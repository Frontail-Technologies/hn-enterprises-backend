import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, projects, projectSites, sitePlans, users } from "@db/schema";
import { cleanObject } from "@utils";
import type {
  DprRecordListQuery,
  SitePlanListQuery,
  UpsertDprRecordBody,
  UpsertSitePlanBody,
} from "./planning.types";

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
};
