import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, projects, projectSites, sitePlans, staff, users } from "@db/schema";
import { cleanObject } from "@utils";
import { activityService } from "@modules/activity/activity.service";
import { dprAction, dprTitle } from "@modules/activity/activity.catalog";
import type { AuthTokenPayload } from "@types";
import type {
  DprRecordListQuery,
  SiteCustomerRow,
  SiteOverviewRow,
  SitePlanListQuery,
  UpsertDprRecordBody,
  UpsertSitePlanBody,
} from "./planning.types";

const GLOBAL_PLANNING_ROLES = new Set(["super_admin", "admin"]);

// Actor scope for sitePlans/dprRecords.supervisorId (who submitted this
// record) - unrelated to customer ownership, unchanged.
function planningScope(currentUser: AuthTokenPayload): string | undefined {
  return GLOBAL_PLANNING_ROLES.has(currentUser.role) ? undefined : currentUser.id;
}

/**
 * Customers are not permanently owned by one supervisor (R1) - a non-admin's
 * planning view scopes to customers in whichever project they are CURRENTLY
 * assigned to (staff.assignedProjectId), not a stored customer.supervisorId.
 * Returns a project id that will never match anything if the user has no
 * current assignment, so scoping never silently falls through to "no filter".
 */
async function resolveCustomerProjectScope(currentUser: AuthTokenPayload): Promise<string | undefined> {
  if (GLOBAL_PLANNING_ROLES.has(currentUser.role)) return undefined;
  const db = getDb();
  const row = await db.query.staff.findFirst({
    where: eq(staff.userId, currentUser.id),
    columns: { assignedProjectId: true },
  });
  return row?.assignedProjectId ?? "00000000-0000-0000-0000-000000000000";
}

async function fetchSiteTotals(projectScopeId: string | undefined) {
  const db = getDb();
  const conditions = [
    isNotNull(customers.siteId),
    isNotNull(customers.projectId),
    projectScopeId ? eq(customers.projectId, projectScopeId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  return db
    .select({
      siteId: customers.siteId,
      total: sql<number>`COUNT(DISTINCT ${customers.id})`,
    })
    .from(customers)
    .where(and(...conditions))
    .groupBy(customers.siteId);
}

async function fetchSiteMeta(siteIds: string[]) {
  const db = getDb();
  if (!siteIds.length) return new Map<string, { name: string; projectId: string; projectName: string }>();

  const rows = await db
    .select({ id: projectSites.id, name: projectSites.name, projectId: projectSites.projectId, projectName: projects.name })
    .from(projectSites)
    .innerJoin(projects, eq(projectSites.projectId, projects.id))
    .where(inArray(projectSites.id, siteIds));

  return new Map(rows.map((row) => [row.id, { name: row.name, projectId: row.projectId, projectName: row.projectName }]));
}

function computeStatus(total: number, completed: number): SiteOverviewRow["status"] {
  if (total <= 0 || completed <= 0) return "pending";
  if (completed >= total) return "done";
  return "partial";
}

function buildOverviewRows(
  siteTotals: { siteId: string | null; total: number }[],
  completedBySite: Map<string, number>,
  siteMeta: Map<string, { name: string; projectId: string; projectName: string }>,
): SiteOverviewRow[] {
  return siteTotals
    .filter((row): row is { siteId: string; total: number } => Boolean(row.siteId))
    .map((row) => {
      const meta = siteMeta.get(row.siteId);
      const completed = Math.min(completedBySite.get(row.siteId) ?? 0, row.total);
      return {
        siteId: row.siteId,
        siteName: meta?.name ?? "Unknown Site",
        projectId: meta?.projectId ?? "",
        projectName: meta?.projectName ?? "",
        totalCustomers: row.total,
        completedCustomers: completed,
        status: computeStatus(row.total, completed),
      };
    })
    .sort((a, b) => a.siteName.localeCompare(b.siteName));
}

async function findSitePlan(customerId: string, date: string, supervisorId: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(sitePlans)
    .where(
      and(eq(sitePlans.customerId, customerId), eq(sitePlans.date, date), eq(sitePlans.supervisorId, supervisorId)),
    )
    .limit(1);

  return record ?? null;
}

async function findDprRecord(customerId: string, date: string, supervisorId: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(dprRecords)
    .where(
      and(eq(dprRecords.customerId, customerId), eq(dprRecords.date, date), eq(dprRecords.supervisorId, supervisorId)),
    )
    .limit(1);

  return record ?? null;
}

export const planningService = {
  async listSitePlans(query: SitePlanListQuery) {
    const db = getDb();
    const conditions = [
      query.projectId ? eq(sitePlans.projectId, query.projectId) : undefined,
      query.siteId ? eq(sitePlans.siteId, query.siteId) : undefined,
      query.supervisorId ? eq(sitePlans.supervisorId, query.supervisorId) : undefined,
      query.customerId ? eq(sitePlans.customerId, query.customerId) : undefined,
      query.date ? eq(sitePlans.date, query.date) : undefined,
      query.from ? gte(sitePlans.date, query.from) : undefined,
      query.to ? lte(sitePlans.date, query.to) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const rows = await db
      .select({
        id: sitePlans.id,
        customerId: sitePlans.customerId,
        projectId: sitePlans.projectId,
        siteId: sitePlans.siteId,
        date: sitePlans.date,
        supervisorId: sitePlans.supervisorId,
        liveSupervisorName: users.name,
        supervisorNameSnapshot: sitePlans.supervisorName,
        tasks: sitePlans.tasks,
        createdAt: sitePlans.createdAt,
        updatedAt: sitePlans.updatedAt,
        site: { id: projectSites.id, name: projectSites.name, address: projectSites.address },
        project: { id: projects.id, name: projects.name },
        customer: { id: customers.id, name: customers.customerName, trBpNumber: customers.trBpNumber },
      })
      .from(sitePlans)
      .leftJoin(users, eq(sitePlans.supervisorId, users.id))
      .leftJoin(projectSites, eq(sitePlans.siteId, projectSites.id))
      .leftJoin(projects, eq(sitePlans.projectId, projects.id))
      .leftJoin(customers, eq(sitePlans.customerId, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sitePlans.date);

    return rows.map(({ supervisorId, liveSupervisorName, supervisorNameSnapshot, ...row }) => ({
      ...row,
      supervisor: supervisorId
        ? { id: supervisorId, name: liveSupervisorName ?? supervisorNameSnapshot ?? "Deleted user" }
        : supervisorNameSnapshot
          ? { id: null, name: supervisorNameSnapshot }
          : null,
    }));
  },

  async upsertSitePlan(input: UpsertSitePlanBody, supervisorId: string) {
    const db = getDb();
    const existing = await findSitePlan(input.customerId, input.date, supervisorId);
    // Immutable supervisor snapshot (safe-hard-delete brief §5) - survives a hard-deleted supervisor. Only resolved on create; an existing row keeps its original snapshot.
    const supervisorName = existing
      ? undefined
      : ((await db.select({ name: users.name }).from(users).where(eq(users.id, supervisorId)).limit(1))[0]?.name ?? null);

    const values = {
      customerId: input.customerId,
      projectId: input.projectId,
      siteId: input.siteId,
      date: input.date,
      supervisorId,
      ...(supervisorName !== undefined ? { supervisorName } : {}),
      tasks: input.tasks,
      updatedAt: new Date(),
    };

    if (existing) {
      const [record] = await db
        .update(sitePlans)
        .set(cleanObject(values))
        .where(eq(sitePlans.id, existing.id))
        .returning();

      if (!record) throw new Error("Unable to save site plan");
      return record;
    }

    const [record] = await db.insert(sitePlans).values(values).returning();
    if (!record) throw new Error("Unable to save site plan");
    return record;
  },

  async listDprRecords(query: DprRecordListQuery) {
    const db = getDb();
    const conditions = [
      query.projectId ? eq(dprRecords.projectId, query.projectId) : undefined,
      query.siteId ? eq(dprRecords.siteId, query.siteId) : undefined,
      query.supervisorId ? eq(dprRecords.supervisorId, query.supervisorId) : undefined,
      query.customerId ? eq(dprRecords.customerId, query.customerId) : undefined,
      query.date ? eq(dprRecords.date, query.date) : undefined,
      query.from ? gte(dprRecords.date, query.from) : undefined,
      query.to ? lte(dprRecords.date, query.to) : undefined,
      query.status ? eq(dprRecords.status, query.status) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const rows = await db
      .select({
        id: dprRecords.id,
        customerId: dprRecords.customerId,
        projectId: dprRecords.projectId,
        siteId: dprRecords.siteId,
        date: dprRecords.date,
        supervisorId: dprRecords.supervisorId,
        liveSupervisorName: users.name,
        supervisorNameSnapshot: dprRecords.supervisorName,
        status: dprRecords.status,
        remarks: dprRecords.remarks,
        tasks: dprRecords.tasks,
        evidence: dprRecords.evidence,
        submittedAt: dprRecords.submittedAt,
        createdAt: dprRecords.createdAt,
        updatedAt: dprRecords.updatedAt,
        site: { id: projectSites.id, name: projectSites.name, address: projectSites.address },
        project: { id: projects.id, name: projects.name },
        customer: { id: customers.id, name: customers.customerName, trBpNumber: customers.trBpNumber },
      })
      .from(dprRecords)
      .leftJoin(users, eq(dprRecords.supervisorId, users.id))
      .leftJoin(projectSites, eq(dprRecords.siteId, projectSites.id))
      .leftJoin(projects, eq(dprRecords.projectId, projects.id))
      .leftJoin(customers, eq(dprRecords.customerId, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(dprRecords.date);

    return rows.map(({ supervisorId, liveSupervisorName, supervisorNameSnapshot, ...row }) => ({
      ...row,
      supervisor: supervisorId
        ? { id: supervisorId, name: liveSupervisorName ?? supervisorNameSnapshot ?? "Deleted user" }
        : supervisorNameSnapshot
          ? { id: null, name: supervisorNameSnapshot }
          : null,
    }));
  },

  async upsertDprRecord(input: UpsertDprRecordBody, supervisorId: string) {
    const db = getDb();
    const existing = await findDprRecord(input.customerId, input.date, supervisorId);
    const status = input.status ?? existing?.status ?? "draft";
    const submittedAt =
      status === "submitted" ? (existing?.submittedAt ?? new Date()) : (existing?.submittedAt ?? null);
    // Immutable supervisor snapshot (safe-hard-delete brief §5) - survives a hard-deleted supervisor. Only resolved on create; an existing row keeps its original snapshot.
    const supervisorName = existing
      ? undefined
      : ((await db.select({ name: users.name }).from(users).where(eq(users.id, supervisorId)).limit(1))[0]?.name ?? null);

    const values = {
      customerId: input.customerId,
      projectId: input.projectId,
      siteId: input.siteId,
      date: input.date,
      supervisorId,
      ...(supervisorName !== undefined ? { supervisorName } : {}),
      status,
      remarks: input.remarks,
      tasks: input.tasks,
      evidence: input.evidence,
      submittedAt,
      updatedAt: new Date(),
    };

    const isNew = !existing;
    const [record] = existing
      ? await db.update(dprRecords).set(cleanObject(values)).where(eq(dprRecords.id, existing.id)).returning()
      : await db
          .insert(dprRecords)
          .values({ ...values, remarks: input.remarks || null, evidence: input.evidence ?? null })
          .returning();

    if (!record) throw new Error("Unable to save DPR record");

    const statusChanged = isNew || !existing || existing.status !== record.status;
    // Only emit an event on a meaningful transition (create, or a status
    // change) - not on every silent draft re-save.
    if (statusChanged) {
      await activityService.record({
        type: "dpr",
        action: dprAction(record.status, isNew),
        actorId: supervisorId,
        customerId: record.customerId,
        projectId: record.projectId,
        entityType: "dpr_record",
        entityId: record.id,
        sourceType: "dpr_record",
        sourceId: record.id,
        title: dprTitle(record.status, isNew),
        description: record.remarks || "Daily progress report",
        metadata: { status: record.status, date: record.date, isNew },
        occurredAt: record.submittedAt ?? record.updatedAt ?? record.createdAt,
      });
    }

    return record;
  },

  async getWorkPlanningOverview(date: string, currentUser: AuthTokenPayload): Promise<SiteOverviewRow[]> {
    const db = getDb();
    const scopeId = planningScope(currentUser);

    const siteTotals = await fetchSiteTotals(await resolveCustomerProjectScope(currentUser));
    if (!siteTotals.length) return [];
    const siteIds = siteTotals.map((row) => row.siteId).filter((id): id is string => Boolean(id));

    const recordConditions = [
      eq(sitePlans.date, date),
      inArray(sitePlans.siteId, siteIds),
      scopeId ? eq(sitePlans.supervisorId, scopeId) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const [completedRows, siteMeta] = await Promise.all([
      db
        .select({ siteId: sitePlans.siteId, completed: sql<number>`COUNT(DISTINCT ${sitePlans.customerId})` })
        .from(sitePlans)
        .where(and(...recordConditions))
        .groupBy(sitePlans.siteId),
      fetchSiteMeta(siteIds),
    ]);

    const completedBySite = new Map(completedRows.map((row) => [row.siteId, Number(row.completed)]));
    return buildOverviewRows(
      siteTotals.map((row) => ({ siteId: row.siteId, total: Number(row.total) })),
      completedBySite,
      siteMeta,
    );
  },

  async getDprOverview(date: string, currentUser: AuthTokenPayload): Promise<SiteOverviewRow[]> {
    const db = getDb();
    const scopeId = planningScope(currentUser);

    const siteTotals = await fetchSiteTotals(await resolveCustomerProjectScope(currentUser));
    if (!siteTotals.length) return [];
    const siteIds = siteTotals.map((row) => row.siteId).filter((id): id is string => Boolean(id));

    const recordConditions = [
      eq(dprRecords.date, date),
      inArray(dprRecords.siteId, siteIds),
      scopeId ? eq(dprRecords.supervisorId, scopeId) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const [completedRows, siteMeta] = await Promise.all([
      db
        .select({ siteId: dprRecords.siteId, completed: sql<number>`COUNT(DISTINCT ${dprRecords.customerId})` })
        .from(dprRecords)
        .where(and(...recordConditions))
        .groupBy(dprRecords.siteId),
      fetchSiteMeta(siteIds),
    ]);

    const completedBySite = new Map(completedRows.map((row) => [row.siteId, Number(row.completed)]));
    return buildOverviewRows(
      siteTotals.map((row) => ({ siteId: row.siteId, total: Number(row.total) })),
      completedBySite,
      siteMeta,
    );
  },

  async listSiteCustomers(siteId: string, currentUser: AuthTokenPayload): Promise<SiteCustomerRow[]> {
    const db = getDb();
    const projectScopeId = await resolveCustomerProjectScope(currentUser);

    const conditions = [
      eq(customers.siteId, siteId),
      isNotNull(customers.projectId),
      projectScopeId ? eq(customers.projectId, projectScopeId) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const rows = await db
      .select({
        id: customers.id,
        trBpNumber: customers.trBpNumber,
        customerName: customers.customerName,
        projectId: customers.projectId,
        siteId: customers.siteId,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(customers.customerName);

    return rows
      .filter((row): row is typeof row & { siteId: string } => Boolean(row.siteId))
      .map((row) => ({ ...row, siteId: row.siteId as string }));
  },
};
