import { and, count, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb } from "@db";
import { payments } from "@db/schema";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type { CreatePaymentBody, PaymentListQuery, UpdatePaymentBody } from "./payments.types";

const APPROVAL_ROLES = ["super_admin", "admin"];

async function getPaymentOrThrow(id: string) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) throw new Error("Payment not found");
  return payment;
}

export const paymentsService = {
  async list(query: PaymentListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.category ? eq(payments.category, query.category) : undefined,
      query.status ? eq(payments.status, query.status) : undefined,
      query.siteId ? eq(payments.siteId, query.siteId) : undefined,
      query.plumberId ? eq(payments.plumberId, query.plumberId) : undefined,
      query.from ? gte(payments.paymentDate, new Date(query.from)) : undefined,
      query.to ? lte(payments.paymentDate, new Date(query.to)) : undefined,
      searchPattern
        ? or(ilike(payments.paidTo, searchPattern), ilike(payments.purpose, searchPattern))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(payments).where(where).limit(limit).offset(offset).orderBy(payments.paymentDate),
      db.select({ value: count() }).from(payments).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getPaymentOrThrow(id);
  },

  async create(input: CreatePaymentBody, userId: string) {
    const db = getDb();
    const [payment] = await db
      .insert(payments)
      .values({
        category: input.category,
        plumberId: input.plumberId || null,
        paidTo: input.paidTo || null,
        siteId: input.siteId || null,
        customerId: input.customerId || null,
        amount: String(input.amount),
        paymentDate: new Date(input.paymentDate),
        mode: input.mode,
        status: input.status ?? "draft",
        purpose: input.purpose || null,
        remarks: input.remarks || null,
        evidence: input.evidence,
        submittedBy: userId,
      })
      .returning();

    if (!payment) throw new Error("Unable to create payment");
    return payment;
  },

  async update(id: string, input: UpdatePaymentBody, currentUser: { id: string; role: string }) {
    await getPaymentOrThrow(id);
    const db = getDb();

    const isApprovalTransition = input.status === "approved" || input.status === "rejected";
    if (isApprovalTransition && !APPROVAL_ROLES.includes(currentUser.role)) {
      throw new Error("Only admins can approve or reject payments");
    }

    const patch = cleanObject({
      category: input.category,
      plumberId: input.plumberId,
      paidTo: input.paidTo,
      siteId: input.siteId,
      customerId: input.customerId,
      amount: input.amount != null ? String(input.amount) : undefined,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : undefined,
      mode: input.mode,
      status: input.status,
      purpose: input.purpose,
      remarks: input.remarks,
      evidence: input.evidence,
    });

    const [payment] = await db
      .update(payments)
      .set({
        ...patch,
        ...(isApprovalTransition ? { approvedBy: currentUser.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();

    if (!payment) throw new Error("Unable to update payment");
    return payment;
  },
};
