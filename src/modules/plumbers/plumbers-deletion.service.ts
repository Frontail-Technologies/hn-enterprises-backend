import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materialTransactions, payments, plumbers, wageRecords } from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited FK graph for Plumber deletion (§5).
 *
 * - wage_records: `ON DELETE RESTRICT` - payroll history. Blocked, never
 *   cascaded/detached (§7).
 * - customers.plumberId, material_transactions.plumberId, payments.plumberId: all
 *   `ON DELETE SET NULL`. These are the plumber's *assignment*, not their
 *   identity-bearing record - detaching just means "no longer attributed to a
 *   specific plumber," which is exactly how the ledger/customer record already
 *   treats an unspecified plumber. Detach (matches the DB, unlike Customer's
 *   bills/payments where the DB's SET NULL was overridden by business policy).
 *
 * `plumbers` already has `status: "active" | "inactive"` - reused as the
 * Deactivate alternative when wage history blocks a hard delete.
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function buildPlumberDeleteImpactConfig(plumberId: string): DeleteImpactConfig {
  return {
    entityType: "plumber",
    getLabel: async (db) => {
      const [plumber] = await db.select({ name: plumbers.name }).from(plumbers).where(eq(plumbers.id, plumberId)).limit(1);
      if (!plumber) throw new Error("Plumber not found");
      return plumber.name;
    },
    dependencies: [
      {
        key: "wageRecords",
        label: "Wage Records",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(wageRecords).where(eq(wageRecords.plumberId, plumberId))),
        preview: async (db) =>
          (
            await db
              .select({ id: wageRecords.id, month: wageRecords.month, status: wageRecords.status })
              .from(wageRecords)
              .where(eq(wageRecords.plumberId, plumberId))
              .limit(5)
          ).map((row) => ({ id: row.id, label: `${row.month} (${row.status})` })),
        blockReason: (n) => `${n} wage record${n === 1 ? "" : "s"} exist for this plumber. Payroll history is never deleted automatically.`,
      },
      {
        key: "customers",
        label: "Customers (assigned)",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(customers).where(eq(customers.plumberId, plumberId))),
      },
      {
        key: "materialTransactions",
        label: "Material Transactions",
        action: "detach",
        count: async (db) =>
          scalarCount(countOf(db).from(materialTransactions).where(eq(materialTransactions.plumberId, plumberId))),
      },
      {
        key: "payments",
        label: "Payments",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(payments).where(eq(payments.plumberId, plumberId))),
      },
    ],
  };
}

export const plumbersDeletionService = {
  async getDeleteImpact(plumberId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildPlumberDeleteImpactConfig(plumberId), plumberId);
  },

  async execute(plumberId: string, userId: string): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const config = buildPlumberDeleteImpactConfig(plumberId);
      const impact = await computeDeleteImpact(tx, config, plumberId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      await tx.delete(plumbers).where(eq(plumbers.id, plumberId));
      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });

    await auditService.log({
      userId,
      module: "Plumbers",
      action: "Deleted Plumber",
      recordId: plumberId,
      description: `Deleted plumber "${result.label}" (${result.totalAffected} record${result.totalAffected === 1 ? "" : "s"} detached)`,
    });

    return result;
  },
};

// Reused by the bulk-delete path so it shares the exact same wage-records policy.
export async function assertPlumbersDeletable(db: DbHandle, plumberIds: string[]) {
  if (!plumberIds.length) return;
  const blocking = await scalarCount(countOf(db).from(wageRecords).where(inArray(wageRecords.plumberId, plumberIds)));
  if (blocking > 0) {
    throw new EntityInUseError(
      `Some selected plumbers cannot be deleted: ${blocking} wage record${blocking === 1 ? "" : "s"} reference them. Payroll history is never deleted automatically.`,
    );
  }
}
