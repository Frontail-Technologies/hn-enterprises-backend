import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, projects, projectSites, sitePlans, users } from "@db/schema";
import { cleanObject } from "@utils";
import type { AuthTokenPayload } from "@types";
import type {
  DprRecordListQuery,
  SiteCustomerRow,
  SiteOverviewRow,
  SitePlanListQuery,
  UpsertDprRecordBody,
  UpsertSitePlanBody,
} from "./planning.types";

// Roles that see every Site's Planning/DPR overview and every supervisor's
// filed records; everyone else is scoped to their own assigned customers and
// their own filed records - matches the same split used for mobile stats
// (stats.service.ts's GLOBAL_STATS_ROLES) and the existing per-customer
// editors, which already always scope by the acting user's id.
const GLOBAL_PLANNING_ROLES = new Set(["super_admin", "admin"]);

function planningScope(currentUser: AuthTokenPayload): string | undefined {
  return GLOBAL_PLANNING_ROLES.has(currentUser.role) ? undefined : currentUser.id;
}

// A customer counts toward a Site's population once it has both a project and
// a site assigned - the same eligibility rule the existing customer picker
// (mobile customers.service.ts#listOptions) already applies; a Planning/DPR
// record can't be filed against a customer with no site to attribute it to.
async function fetchSiteTotals(scopeId: string | undefined) {
  const db = getDb();
  const conditions = [
    isNotNull(customers.siteId),
    isNotNull(customers.projectId),
    scopeId ? eq(customers.supervisorId, scopeId) : undefined,
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

// A plan/DPR is filed per customer now, not per site (a site can have many
// customers) - so the match/uniqueness key is (customerId, date, supervisorId).
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

    return db
      .select({
        id: sitePlans.id,
        customerId: sitePlans.customerId,
        projectId: sitePlans.projectId,
        siteId: sitePlans.siteId,
        date: sitePlans.date,
        supervisorId: sitePlans.supervisorId,
        tasks: sitePlans.tasks,
        createdAt: sitePlans.createdAt,
        updatedAt: sitePlans.updatedAt,
        supervisor: { id: users.id, name: users.name },
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
  },

  async upsertSitePlan(input: UpsertSitePlanBody, supervisorId: string) {
    const db = getDb();
    const existing = await findSitePlan(input.customerId, input.date, supervisorId);

    const values = {
      customerId: input.customerId,
      projectId: input.projectId,
      siteId: input.siteId,
      date: input.date,
      supervisorId,
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

    return db
      .select({
        id: dprRecords.id,
        customerId: dprRecords.customerId,
        projectId: dprRecords.projectId,
        siteId: dprRecords.siteId,
        date: dprRecords.date,
        supervisorId: dprRecords.supervisorId,
        status: dprRecords.status,
        remarks: dprRecords.remarks,
        tasks: dprRecords.tasks,
        evidence: dprRecords.evidence,
        submittedAt: dprRecords.submittedAt,
        createdAt: dprRecords.createdAt,
        updatedAt: dprRecords.updatedAt,
        supervisor: { id: users.id, name: users.name },
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
  },

  async upsertDprRecord(input: UpsertDprRecordBody, supervisorId: string) {
    const db = getDb();
    const existing = await findDprRecord(input.customerId, input.date, supervisorId);
    const status = input.status ?? existing?.status ?? "draft";
    const submittedAt =
      status === "submitted" ? (existing?.submittedAt ?? new Date()) : (existing?.submittedAt ?? null);

    const values = {
      customerId: input.customerId,
      projectId: input.projectId,
      siteId: input.siteId,
      date: input.date,
      supervisorId,
      status,
      remarks: input.remarks,
      tasks: input.tasks,
      evidence: input.evidence,
      submittedAt,
      updatedAt: new Date(),
    };

    if (existing) {
      const [record] = await db
        .update(dprRecords)
        .set(cleanObject(values))
        .where(eq(dprRecords.id, existing.id))
        .returning();

      if (!record) throw new Error("Unable to save DPR record");
      return record;
    }

    const [record] = await db
      .insert(dprRecords)
      .values({ ...values, remarks: input.remarks || null, evidence: input.evidence ?? null })
      .returning();

    if (!record) throw new Error("Unable to save DPR record");
    return record;
  },

  // Site-wise aggregate for the mobile overview - never a second source of
  // truth: totals come straight from the customer roster, completions come
  // straight from DISTINCT customerId on the same site_plans table the
  // per-customer editor reads/writes. One customer with a record still only
  // counts once, and duplicate rows across supervisors on the same date (for
  // the unscoped/global view) can't inflate the count either.
  async getWorkPlanningOverview(date: string, currentUser: AuthTokenPayload): Promise<SiteOverviewRow[]> {
    const db = getDb();
    const scopeId = planningScope(currentUser);

    const siteTotals = await fetchSiteTotals(scopeId);
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

    const siteTotals = await fetchSiteTotals(scopeId);
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

  // Lightweight roster for the Site editor's customer list - scoped the same
  // way the overview is, so a supervisor never sees a customer here that
  // wasn't already counted in their own overview totals.
  async listSiteCustomers(siteId: string, currentUser: AuthTokenPayload): Promise<SiteCustomerRow[]> {
    const db = getDb();
    const scopeId = planningScope(currentUser);

    const conditions = [
      eq(customers.siteId, siteId),
      isNotNull(customers.projectId),
      scopeId ? eq(customers.supervisorId, scopeId) : undefined,
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
