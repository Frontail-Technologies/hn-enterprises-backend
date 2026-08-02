import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@db";
import { customers, projects, projectSites, users, workProgressUpdates } from "@db/schema";
import { buildPaginationMeta, parsePagination, toSearchPattern } from "@utils";
import type {
  CreateWorkProgressUpdateBody,
  WorkProgressListQuery,
  WorkProgressQueueQuery,
} from "./work-progress.types";

async function getCustomerOrThrow(id: string) {
  const db = getDb();
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) throw new Error("Customer not found");
  return customer;
}

export const workProgressService = {
  async create(input: CreateWorkProgressUpdateBody, supervisorId: string) {
    await getCustomerOrThrow(input.customerId);
    const db = getDb();

    const [row] = await db
      .insert(workProgressUpdates)
      .values({
        customerId: input.customerId,
        supervisorId,
        stage: input.stage,
        status: input.status,
        nextRequiredAction: input.nextRequiredAction || null,
        remarks: input.remarks || null,
        evidence: input.evidence ?? null,
      })
      .returning();

    if (!row) throw new Error("Unable to create work progress update");
    return row;
  },

  async list(query: WorkProgressListQuery) {
    const db = getDb();
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const conditions = [
      query.customerId ? eq(workProgressUpdates.customerId, query.customerId) : undefined,
      query.supervisorId ? eq(workProgressUpdates.supervisorId, query.supervisorId) : undefined,
      query.stage ? eq(workProgressUpdates.stage, query.stage) : undefined,
      query.status ? eq(workProgressUpdates.status, query.status) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    return db
      .select({
        id: workProgressUpdates.id,
        customerId: workProgressUpdates.customerId,
        customer: {
          id: customers.id,
          name: customers.customerName,
          trBpNumber: customers.trBpNumber,
          mobileNumber: customers.mobileNumber,
        },
        project: { id: projects.id, name: projects.name },
        site: { id: projectSites.id, name: projectSites.name },
        stage: workProgressUpdates.stage,
        status: workProgressUpdates.status,
        nextRequiredAction: workProgressUpdates.nextRequiredAction,
        remarks: workProgressUpdates.remarks,
        evidence: workProgressUpdates.evidence,
        createdAt: workProgressUpdates.createdAt,
        supervisor: { id: users.id, name: users.name },
      })
      .from(workProgressUpdates)
      .leftJoin(customers, eq(workProgressUpdates.customerId, customers.id))
      .leftJoin(projects, eq(customers.projectId, projects.id))
      .leftJoin(projectSites, eq(customers.siteId, projectSites.id))
      .leftJoin(users, eq(workProgressUpdates.supervisorId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(workProgressUpdates.createdAt))
      .limit(limit);
  },

  async listQueue(query: WorkProgressQueueQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const latest = db
      .selectDistinctOn([workProgressUpdates.customerId], {
        customerId: workProgressUpdates.customerId,
        stage: workProgressUpdates.stage,
        status: workProgressUpdates.status,
        nextRequiredAction: workProgressUpdates.nextRequiredAction,
        evidence: workProgressUpdates.evidence,
        createdAt: workProgressUpdates.createdAt,
        supervisorId: workProgressUpdates.supervisorId,
      })
      .from(workProgressUpdates)
      .orderBy(workProgressUpdates.customerId, desc(workProgressUpdates.createdAt))
      .as("latest_update");

    const conditions = [
      query.projectId ? eq(customers.projectId, query.projectId) : undefined,
      query.siteId ? eq(customers.siteId, query.siteId) : undefined,
      query.stage ? eq(latest.stage, query.stage) : undefined,
      query.status
        ? query.status === "not_started"
          ? or(isNull(latest.status), eq(latest.status, "not_started"))
          : eq(latest.status, query.status)
        : undefined,
      searchPattern
        ? or(
            ilike(customers.customerName, searchPattern),
            ilike(customers.trBpNumber, searchPattern),
            ilike(customers.mobileNumber, searchPattern),
          )
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const selection = {
      id: customers.id,
      customerName: customers.customerName,
      trBpNumber: customers.trBpNumber,
      mobileNumber: customers.mobileNumber,
      project: { id: projects.id, name: projects.name },
      site: { id: projectSites.id, name: projectSites.name },
      stage: latest.stage,
      status: latest.status,
      nextRequiredAction: latest.nextRequiredAction,
      evidence: latest.evidence,
      lastUpdated: latest.createdAt,
      supervisor: { id: users.id, name: users.name },
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(selection)
        .from(customers)
        .leftJoin(latest, eq(latest.customerId, customers.id))
        .leftJoin(projects, eq(customers.projectId, projects.id))
        .leftJoin(projectSites, eq(customers.siteId, projectSites.id))
        .leftJoin(users, eq(latest.supervisorId, users.id))
        .where(where)
        .orderBy(desc(customers.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(customers)
        .leftJoin(latest, eq(latest.customerId, customers.id))
        .where(where),
    ]);

    const mapped = rows.map((row) => ({
      ...row,
      stage: row.stage ?? "survey",
      status: row.status ?? "not_started",
    }));

    return { rows: mapped, pagination: buildPaginationMeta(page, limit, total) };
  },
};
