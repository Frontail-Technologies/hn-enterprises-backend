import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { customerDocuments, customers, materials, masterValues, payments } from "@db/schema";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactDependencyConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited "FK" graph for Master Value deletion (§8) - deliberately in scare quotes:
 * nothing in the schema has a real foreign key to `master_values.id` (confirmed -
 * no `references(() => masterValues.id, ...)` anywhere). Master values are
 * consumed by *string equality* against free-text columns elsewhere, so "is this
 * value in use" has to be a value-match query per category, not an FK count.
 *
 * Categories actually wired to a consuming column, audited and checked below:
 *   - material_categories -> materials.category
 *   - payment_types       -> payments.mode
 *   - connection_types    -> customers.connectionType
 *   - house_types         -> customers.houseType
 *   - schemes             -> customers.scheme
 *   - document_categories -> customerDocuments.category
 *
 * `meter_types` has no plain-column consumer - the only place a meter type is
 * recorded is `customers.commissioningConversion->>'meterType'`, inside a jsonb
 * blob. Usage detection for that one specifically was not implemented this pass
 * (reported in the report as a gap needing confirmation, not silently assumed
 * unused) - it will always report 0 usages/always deletable, which could be wrong.
 *
 * Any category with an in-use value is `block`, not `detach`: leaving e.g. a
 * material with `category = "GI Pipe"` after the "GI Pipe" master value is
 * deleted turns that field into an orphaned free-text value with no matching
 * master row - not destructive, but confusing and silently breaks category-based
 * filtering. `master_values.status` already has "active"/"inactive" - reused as
 * the Deactivate alternative.
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

async function buildMasterValueDeleteImpactConfig(db: DbHandle, masterValueId: string): Promise<DeleteImpactConfig> {
  const [master] = await db
    .select({ category: masterValues.category, value: masterValues.value })
    .from(masterValues)
    .where(eq(masterValues.id, masterValueId))
    .limit(1);
  if (!master) throw new Error("Master value not found");

  const dependencies: DeleteImpactDependencyConfig[] = [];

  if (master.category === "material_categories") {
    dependencies.push({
      key: "materials",
      label: "Materials",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(materials).where(eq(materials.category, master.value))),
      preview: async (db) =>
        db.select({ id: materials.id, label: materials.name }).from(materials).where(eq(materials.category, master.value)).limit(5),
      blockReason: (n) => `${n} material${n === 1 ? "" : "s"} use this category.`,
    });
  } else if (master.category === "payment_types") {
    dependencies.push({
      key: "payments",
      label: "Payments",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(payments).where(eq(payments.mode, master.value))),
      blockReason: (n) => `${n} payment${n === 1 ? "" : "s"} use this payment type.`,
    });
  } else if (master.category === "connection_types") {
    dependencies.push({
      key: "customersConnectionType",
      label: "Customers (Connection Type)",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(customers).where(eq(customers.connectionType, master.value))),
      blockReason: (n) => `${n} customer${n === 1 ? "" : "s"} use this connection type.`,
    });
  } else if (master.category === "house_types") {
    dependencies.push({
      key: "customersHouseType",
      label: "Customers (House Type)",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(customers).where(eq(customers.houseType, master.value))),
      blockReason: (n) => `${n} customer${n === 1 ? "" : "s"} use this house type.`,
    });
  } else if (master.category === "schemes") {
    dependencies.push({
      key: "customersScheme",
      label: "Customers (Scheme)",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(customers).where(eq(customers.scheme, master.value))),
      blockReason: (n) => `${n} customer${n === 1 ? "" : "s"} use this scheme.`,
    });
  } else if (master.category === "document_categories") {
    dependencies.push({
      key: "customerDocuments",
      label: "Customer Documents",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(customerDocuments).where(eq(customerDocuments.category, master.value))),
      blockReason: (n) => `${n} customer document${n === 1 ? "" : "s"} use this category.`,
    });
  }
  // meter_types: intentionally no dependency entry - see file header. Always
  // reports as unused/deletable for this category.

  return {
    entityType: "masterValue",
    getLabel: async () => master.value,
    dependencies,
  };
}

export const masterValuesDeletionService = {
  async getDeleteImpact(masterValueId: string): Promise<DeleteImpactResult> {
    return masterValuesDeletionService.getDeleteImpactWithHandle(getDb(), masterValueId);
  },

  /** Same computation against a caller-supplied handle (e.g. a `tx`) - lets bulk
   * delete recheck every target inside its own transaction (§11). */
  async getDeleteImpactWithHandle(db: DbHandle, masterValueId: string): Promise<DeleteImpactResult> {
    const config = await buildMasterValueDeleteImpactConfig(db, masterValueId);
    return computeDeleteImpact(db, config, masterValueId);
  },

  async execute(masterValueId: string): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    return db.transaction(async (tx) => {
      const impact = await masterValuesDeletionService.getDeleteImpactWithHandle(tx, masterValueId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      await tx.delete(masterValues).where(eq(masterValues.id, masterValueId));
      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });
  },
};
