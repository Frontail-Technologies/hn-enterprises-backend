import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@db";
import { activityEvents, customers, projects, staff, users } from "@db/schema";
import { buildPaginationMeta, parsePagination, toSearchPattern } from "@utils";
import type { AuthTokenPayload } from "@types";
import type { ActivityListQuery, ActivityRow, RecordActivityInput } from "./activity.types";

const NO_MATCH_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

const actorUser = alias(users, "actor_user");
const behalfUser = alias(users, "behalf_user");

/**
 * Resolves the immutable actor/on-behalf-of name+role snapshot to persist
 * alongside a new activity_events row (§2-3 of the safe-hard-delete brief).
 * Looked up fresh at write time rather than requiring every one of
 * activityService.record()'s many call sites to pass name/role themselves -
 * at write time the referenced user is (barring a pathological race) always
 * still live, so this is a correct one-shot snapshot, not a live lookup.
 */
async function resolveActorSnapshot(actorId?: string | null, onBehalfOfUserId?: string | null) {
  const ids = [actorId, onBehalfOfUserId].filter((id): id is string => Boolean(id));
  if (!ids.length) return { actorName: null, actorRole: null, onBehalfOfName: null };

  const db = getDb();
  const rows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));

  return {
    actorName: actorId ? (byId.get(actorId)?.name ?? null) : null,
    actorRole: actorId ? (byId.get(actorId)?.role ?? null) : null,
    onBehalfOfName: onBehalfOfUserId ? (byId.get(onBehalfOfUserId)?.name ?? null) : null,
  };
}

/**
 * A supervisor sees activity for their currently-assigned project (canonical
 * staff.assignedProjectId - never the removed customer.supervisorId) PLUS any
 * event they personally performed, even cross-project. Admins/super_admins see
 * everything. Returns undefined when no scoping is needed.
 */
async function resolveActivityScope(currentUser: AuthTokenPayload) {
  if (currentUser.role === "super_admin" || currentUser.role === "admin") return undefined;
  const db = getDb();
  const row = await db.query.staff.findFirst({
    where: eq(staff.userId, currentUser.id),
    columns: { assignedProjectId: true },
  });
  const projectId = row?.assignedProjectId ?? NO_MATCH_PROJECT_ID;
  return or(eq(activityEvents.projectId, projectId), eq(activityEvents.actorId, currentUser.id));
}

export const activityService = {
  /**
   * Central, canonical writer for the operational Recent Activity feed.
   * Domain modules must go through here - never INSERT into activity_events
   * directly.
   *
   * Transaction strategy: this is a NON-CRITICAL, fire-after-success write.
   * Callers invoke it only after the primary business mutation has already
   * succeeded, and any failure here is swallowed (logged, never rethrown) so
   * a feed hiccup can never corrupt or roll back the real mutation. It is
   * intentionally NOT enrolled in the domain transaction - the cost is a rare
   * missing feed row (recoverable via backfill), never a broken business
   * write.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      const db = getDb();
      const onBehalfOfUserId =
        input.onBehalfOfUserId && input.onBehalfOfUserId !== input.actorId ? input.onBehalfOfUserId : null;
      const snapshot = await resolveActorSnapshot(input.actorId, onBehalfOfUserId);
      await db
        .insert(activityEvents)
        .values({
          type: input.type,
          action: input.action,
          actorId: input.actorId ?? null,
          actorName: snapshot.actorName,
          actorRole: snapshot.actorRole,
          onBehalfOfUserId,
          onBehalfOfName: snapshot.onBehalfOfName,
          customerId: input.customerId ?? null,
          projectId: input.projectId ?? null,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          title: input.title,
          description: input.description ?? null,
          metadata: input.metadata ?? null,
          occurredAt: input.occurredAt ?? new Date(),
        });
    } catch (error) {
      console.error("[activity] failed to record event", input.action, input.sourceId, error);
    }
  },

  /**
   * Idempotent insert keyed on (sourceType, sourceId, action) - used only by
   * the one-time backfill so re-running it never double-writes. Live writes
   * use record() directly (repeated real actions are meant to be distinct
   * rows). Returns true if a row was written.
   */
  async recordIfAbsent(input: RecordActivityInput): Promise<boolean> {
    const db = getDb();
    const [existing] = await db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.sourceType, input.sourceType),
          eq(activityEvents.sourceId, input.sourceId),
          eq(activityEvents.action, input.action),
        ),
      )
      .limit(1);
    if (existing) return false;
    const onBehalfOfUserId =
      input.onBehalfOfUserId && input.onBehalfOfUserId !== input.actorId ? input.onBehalfOfUserId : null;
    const snapshot = await resolveActorSnapshot(input.actorId, onBehalfOfUserId);
    await db.insert(activityEvents).values({
      type: input.type,
      action: input.action,
      actorId: input.actorId ?? null,
      actorName: snapshot.actorName,
      actorRole: snapshot.actorRole,
      onBehalfOfUserId,
      onBehalfOfName: snapshot.onBehalfOfName,
      customerId: input.customerId ?? null,
      projectId: input.projectId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    });
    return true;
  },

  async list(query: ActivityListQuery, currentUser: AuthTokenPayload) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const searchPattern = toSearchPattern(query.search);
    const scope = await resolveActivityScope(currentUser);

    const conditions = [
      scope,
      query.projectId ? eq(activityEvents.projectId, query.projectId) : undefined,
      query.customerId ? eq(activityEvents.customerId, query.customerId) : undefined,
      query.actorId ? eq(activityEvents.actorId, query.actorId) : undefined,
      query.type ? eq(activityEvents.type, query.type) : undefined,
      query.from ? gte(activityEvents.occurredAt, new Date(query.from)) : undefined,
      query.to ? lte(activityEvents.occurredAt, new Date(query.to)) : undefined,
      searchPattern
        ? or(
            ilike(activityEvents.title, searchPattern),
            ilike(activityEvents.description, searchPattern),
            ilike(actorUser.name, searchPattern),
            ilike(customers.customerName, searchPattern),
            ilike(customers.trBpNumber, searchPattern),
            ilike(projects.name, searchPattern),
          )
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;
    const orderExpr = query.sort === "oldest" ? activityEvents.occurredAt : desc(activityEvents.occurredAt);

    const selection = {
      id: activityEvents.id,
      type: activityEvents.type,
      action: activityEvents.action,
      title: activityEvents.title,
      description: activityEvents.description,
      entityType: activityEvents.entityType,
      entityId: activityEvents.entityId,
      occurredAt: activityEvents.occurredAt,
      metadata: activityEvents.metadata,
      actorId: activityEvents.actorId,
      liveActorName: actorUser.name,
      liveActorRole: actorUser.role,
      actorNameSnapshot: activityEvents.actorName,
      actorRoleSnapshot: activityEvents.actorRole,
      onBehalfId: activityEvents.onBehalfOfUserId,
      liveOnBehalfName: behalfUser.name,
      onBehalfNameSnapshot: activityEvents.onBehalfOfName,
      customerId: activityEvents.customerId,
      customerName: customers.customerName,
      customerTrBp: customers.trBpNumber,
      projectId: activityEvents.projectId,
      projectName: projects.name,
    };

    const baseQuery = db
      .select(selection)
      .from(activityEvents)
      .leftJoin(actorUser, eq(activityEvents.actorId, actorUser.id))
      .leftJoin(behalfUser, eq(activityEvents.onBehalfOfUserId, behalfUser.id))
      .leftJoin(customers, eq(activityEvents.customerId, customers.id))
      .leftJoin(projects, eq(activityEvents.projectId, projects.id));

    const [rows, [{ value: total }]] = await Promise.all([
      baseQuery.where(where).orderBy(orderExpr, desc(activityEvents.id)).limit(limit).offset(offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(activityEvents)
        .leftJoin(actorUser, eq(activityEvents.actorId, actorUser.id))
        .leftJoin(customers, eq(activityEvents.customerId, customers.id))
        .leftJoin(projects, eq(activityEvents.projectId, projects.id))
        .where(where),
    ]);

    const data: ActivityRow[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      action: row.action,
      title: row.title,
      description: row.description ?? "",
      actor: row.actorId
        ? { id: row.actorId, name: row.liveActorName ?? row.actorNameSnapshot ?? "Unknown", role: row.liveActorRole ?? row.actorRoleSnapshot, deleted: false }
        : row.actorNameSnapshot
          ? { id: null, name: row.actorNameSnapshot, role: row.actorRoleSnapshot, deleted: true }
          : null,
      onBehalfOf: row.onBehalfId
        ? { id: row.onBehalfId, name: row.liveOnBehalfName ?? row.onBehalfNameSnapshot }
        : row.onBehalfNameSnapshot
          ? { id: null, name: row.onBehalfNameSnapshot }
          : null,
      customer: row.customerId
        ? { id: row.customerId, name: row.customerName ?? "Unknown", trBpNumber: row.customerTrBp }
        : null,
      project: row.projectId ? { id: row.projectId, name: row.projectName } : null,
      entityType: row.entityType,
      entityId: row.entityId ?? "",
      occurredAt:
        row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
      metadata: row.metadata ?? null,
    }));

    return { rows: data, pagination: buildPaginationMeta(page, limit, Number(total)) };
  },
};
