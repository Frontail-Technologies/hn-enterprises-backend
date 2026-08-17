import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { materialTransactions, materials } from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited FK graph for Material deletion (§4).
 *
 * The only thing that ever references `materials.id` is
 * `material_transactions.materialId` (`ON DELETE RESTRICT`) - the append-only
 * ledger built and hardened across the whole Inventory pass. Transaction history
 * must not disappear just because the catalog item is removed, so this is a hard
 * block, never a cascade or detach: an unused material (no transactions at all)
 * remains simply, immediately deletable.
 *
 * `materials` has no status/active column today, so there is no existing
 * Deactivate mechanism to offer as the alternative when blocked - this is
 * reported as a schema gap rather than invented here (§10).
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function buildMaterialDeleteImpactConfig(materialId: string): DeleteImpactConfig {
  return {
    entityType: "material",
    getLabel: async (db) => {
      const [material] = await db.select({ name: materials.name }).from(materials).where(eq(materials.id, materialId)).limit(1);
      if (!material) throw new Error("Material not found");
      return material.name;
    },
    dependencies: [
      {
        key: "materialTransactions",
        label: "Material Transactions",
        action: "block",
        count: async (db) =>
          scalarCount(countOf(db).from(materialTransactions).where(eq(materialTransactions.materialId, materialId))),
        preview: async (db) =>
          (
            await db
              .select({ id: materialTransactions.id, type: materialTransactions.type, quantity: materialTransactions.quantity })
              .from(materialTransactions)
              .where(eq(materialTransactions.materialId, materialId))
              .limit(5)
          ).map((row) => ({ id: row.id, label: `${row.type} - ${row.quantity}` })),
        blockReason: (n) =>
          `${n} transaction${n === 1 ? "" : "s"} (purchase, PBG, issue, or consumption) reference this material. Ledger history is never deleted automatically.`,
      },
    ],
  };
}

export const materialsDeletionService = {
  async getDeleteImpact(materialId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildMaterialDeleteImpactConfig(materialId), materialId);
  },

  async execute(materialId: string, userId: string): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const config = buildMaterialDeleteImpactConfig(materialId);
      const impact = await computeDeleteImpact(tx, config, materialId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      await tx.delete(materials).where(eq(materials.id, materialId));
      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });

    await auditService.log({
      userId,
      module: "Inventory",
      action: "Deleted Material",
      recordId: materialId,
      description: `Deleted material "${result.label}"`,
    });

    return result;
  },
};
