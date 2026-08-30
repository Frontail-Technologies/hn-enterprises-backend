import type { getDb } from "@db";

export type DbHandle = Omit<ReturnType<typeof getDb>, "$client">;

export type DependencyAction = "delete" | "detach" | "preserve" | "block";

export type DeleteImpactPreviewRow = {
  id: string;
  label: string;
};

export type DeleteImpactDependencyConfig = {
  key: string;
  label: string;
  action: DependencyAction;
  count: (db: DbHandle) => Promise<number>;
  preview?: (db: DbHandle) => Promise<DeleteImpactPreviewRow[]>;
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
