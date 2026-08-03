import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, customers } from "@db/schema";
import type { AuthTokenPayload } from "@types";
import { buildPaginationMeta, cleanObject, parsePagination } from "@utils";
import type { ComplaintListQuery, CreateComplaintBody, UpdateComplaintBody } from "./complaints.types";

async function getComplaintOrThrow(id: string) {
  const db = getDb();
  const complaint = await db.query.complaints.findFirst({
    where: eq(complaints.id, id),
    with: { customer: true },
  });
  if (!complaint) throw new Error("Complaint not found");
  return complaint;
}

const RESOLVED_STATUSES = new Set(["resolved", "closed"]);

export const complaintsService = {
  async list(query: ComplaintListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = [
      query.customerId ? eq(complaints.customerId, query.customerId) : undefined,
      query.supervisorId ? eq(customers.supervisorId, query.supervisorId) : undefined,
      query.status ? eq(complaints.status, query.status) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const selection = {
      id: complaints.id,
      customerId: complaints.customerId,
      customer: {
        id: customers.id,
        name: customers.customerName,
        trBpNumber: customers.trBpNumber,
        mobileNumber: customers.mobileNumber,
      },
      title: complaints.title,
      description: complaints.description,
      priority: complaints.priority,
      status: complaints.status,
      supervisorRemark: complaints.supervisorRemark,
      resolvedAt: complaints.resolvedAt,
      createdAt: complaints.createdAt,
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(selection)
        .from(complaints)
        .leftJoin(customers, eq(complaints.customerId, customers.id))
        .where(where)
        .orderBy(desc(complaints.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(complaints)
        .leftJoin(customers, eq(complaints.customerId, customers.id))
        .where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async create(input: CreateComplaintBody, adminId: string) {
    const db = getDb();
    const [complaint] = await db
      .insert(complaints)
      .values({
        customerId: input.customerId,
        createdByAdminId: adminId,
        title: input.title,
        description: input.description,
        priority: input.priority ?? "medium",
        status: "open",
      })
      .returning();

    if (!complaint) throw new Error("Unable to create complaint");
    return complaint;
  },

  async update(id: string, input: UpdateComplaintBody, currentUser: AuthTokenPayload) {
    const existing = await getComplaintOrThrow(id);
    const db = getDb();
    const isAdmin = currentUser.role === "super_admin" || currentUser.role === "admin";

    if (!isAdmin && existing.customer.supervisorId !== currentUser.id) {
      throw new Error("Not authorized to update this complaint");
    }

    // Supervisors may only change status/remark - even if other fields are present in the
    // body, silently drop them rather than trusting a wider patch from a non-admin caller.
    const patch = isAdmin
      ? cleanObject({
          customerId: input.customerId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          supervisorRemark: input.supervisorRemark,
        })
      : cleanObject({
          status: input.status,
          supervisorRemark: input.supervisorRemark,
        });

    const nextStatus = "status" in patch ? patch.status : undefined;

    const [complaint] = await db
      .update(complaints)
      .set({
        ...patch,
        ...(nextStatus
          ? { resolvedAt: RESOLVED_STATUSES.has(nextStatus) ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!complaint) throw new Error("Unable to update complaint");
    return complaint;
  },
};
