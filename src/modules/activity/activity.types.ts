export type ActivityListQuery = {
  page?: number | string;
  limit?: number | string;
  projectId?: string;
  customerId?: string;
  actorId?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  sort?: "newest" | "oldest";
};

export type ActivityActor = {
  /** null when the account has been hard-deleted - name/role below are the immutable snapshot, not a live relation. */
  id: string | null;
  name: string;
  role: string | null;
  deleted: boolean;
};

export type ActivityCustomerRef = {
  id: string;
  name: string;
  trBpNumber: string | null;
};

export type ActivityProjectRef = {
  id: string;
  name: string | null;
};

/**
 * One normalized activity-feed row. Read from the dedicated activity_events
 * table; labels (actor/customer/project names) are re-joined fresh at read
 * time so a later rename shows the current name.
 */
export type ActivityRow = {
  id: string;
  type: string;
  action: string;
  title: string;
  description: string;
  actor: ActivityActor | null;
  onBehalfOf: { id: string | null; name: string | null } | null;
  customer: ActivityCustomerRef | null;
  project: ActivityProjectRef | null;
  entityType: string;
  entityId: string;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Input to activityService.record(). `sourceType` + `sourceId` + `action`
 * form the deterministic origin key that keeps the one-time backfill (and any
 * re-run of it) idempotent.
 */
export type RecordActivityInput = {
  type: string;
  action: string;
  actorId?: string | null;
  onBehalfOfUserId?: string | null;
  customerId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId?: string | null;
  sourceType: string;
  sourceId: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
};
