import type { DbHandle, DeleteImpactBlocker, DeleteImpactConfig, DeleteImpactDependency, DeleteImpactResult } from "./deletion.types";

/**
 * Shared Delete Impact Preview engine (reused across entities per the audited,
 * per-entity `DeleteImpactConfig` each module supplies - see projects-deletion.service.ts
 * for the first, fully-audited example). This function only assembles counts/previews
 * into the standard response shape; it never guesses a dependency's policy - that
 * judgment call lives in each entity's own config, made after auditing real FK/business
 * semantics (§1).
 *
 * Zero-count dependencies are dropped entirely, so a harmless entity's dialog is just
 * "no related records" instead of a wall of empty rows (§10). Each dependency is a
 * single, non-overlapping query (e.g. "customers where projectId = X"), so nothing here
 * needs its own dedup pass - a record can only be counted once, by the one dependency
 * whose query actually matches it (§3).
 */
export async function computeDeleteImpact(db: DbHandle, config: DeleteImpactConfig, entityId: string): Promise<DeleteImpactResult> {
  const label = await config.getLabel(db);

  const dependencies: DeleteImpactDependency[] = [];
  const blockers: DeleteImpactBlocker[] = [];
  let totalAffected = 0;

  for (const dependency of config.dependencies) {
    const count = await dependency.count(db);
    if (count === 0) continue;

    totalAffected += count;
    const preview = dependency.preview ? await dependency.preview(db) : undefined;
    dependencies.push({ key: dependency.key, label: dependency.label, count, action: dependency.action, preview });

    if (dependency.action === "block") {
      blockers.push({
        key: dependency.key,
        label: dependency.label,
        reason: dependency.blockReason?.(count) ?? `${dependency.label} (${count}) must be resolved first.`,
      });
    }
  }

  return {
    entity: { type: config.entityType, id: entityId, label },
    canDelete: blockers.length === 0,
    totalAffected,
    dependencies,
    blockers,
  };
}
