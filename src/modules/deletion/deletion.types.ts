import type { getDb } from "@db";

/**
 * Works for both the plain db handle and a `db.transaction(async (tx) => ...)`
 * callback's `tx` - the transaction type is structurally the same query builder
 * minus `$client` (only the top-level connection has that), so it's omitted here
 * to make both assignable to this type.
 */
export type DbHandle = Omit<ReturnType<typeof getDb>, "$client">;

export type DependencyAction = "delete" | "detach" | "preserve" | "block";

export type DeleteImpactPreviewRow = {
  id: string;
  label: string;
};

/**
 * One audited dependency an entity's deletion may touch. `count`/`preview` receive
 * the active db handle (plain db for the preview endpoint, `tx` for the pre-delete
 * recheck) so both call sites see a consistent, race-free snapshot.
 */
export type DeleteImpactDependencyConfig = {
  key: string;
  label: string;
  action: DependencyAction;
  count: (db: DbHandle) => Promise<number>;
  /** Small sample of affected rows (3-5) for the dialog - omit when not useful to preview individually. */
  preview?: (db: DbHandle) => Promise<DeleteImpactPreviewRow[]>;
  /** Required context for `action: "block"` - why this stops deletion, shown verbatim in the dialog. */
  blockReason?: (count: number) => string;
};

export type DeleteImpactDependency = {
  key: string;
  label: string;
  count: number;
  action: DependencyAction;
  preview?: DeleteImpactPreviewRow[];
};

export type DeleteImpactBlocker = {
  key: string;
  label: string;
  reason: string;
};

export type DeleteImpactResult = {
  entity: {
    type: string;
    id: string;
    label: string;
  };
  canDelete: boolean;
  totalAffected: number;
  dependencies: DeleteImpactDependency[];
  blockers: DeleteImpactBlocker[];
};

export type DeleteImpactConfig = {
  entityType: string;
  getLabel: (db: DbHandle) => Promise<string>;
  dependencies: DeleteImpactDependencyConfig[];
};
