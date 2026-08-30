import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import { getDb } from "@db";
import { customers, payments, paymentCategoryEnum, paymentStatusEnum, projectSites } from "@db/schema";
import { permissionService } from "@services";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type { AuthTokenPayload } from "@types";
import type { CreatePaymentBody, PaymentCategory, PaymentFilterColumn, PaymentListQuery, PaymentStatus, UpdatePaymentBody } from "./payments.types";

const SUPERVISOR_VISIBLE_CATEGORIES: PaymentCategory[] = ["plumber_payment", "other_expense"];

function isCategoryRestricted(currentUser?: AuthTokenPayload | null) {
  return currentUser?.role === "supervisor";
}

function supervisorCategoryCondition(currentUser?: AuthTokenPayload | null) {
  return isCategoryRestricted(currentUser)
    ? inArray(payments.category, SUPERVISOR_VISIBLE_CATEGORIES)
    : undefined;
}

function parseCsv(value?: string): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function buildListConditions(query: PaymentListQuery, currentUser?: AuthTokenPayload | null) {
  const searchPattern = toSearchPattern(query.search);
  const paidTo = parseCsv(query.paidTo);
  const purpose = parseCsv(query.purpose);
  const address = parseCsv(query.address);
  const amount = parseCsv(query.amount);
  const date = parseCsv(query.date);
  const status = parseCsv(query.status).filter((value): value is PaymentStatus =>
    (paymentStatusEnum.enumValues as readonly string[]).includes(value),
  );

  return [
    query.from ? gte(payments.paymentDate, new Date(query.from)) : undefined,
    query.to ? lte(payments.paymentDate, new Date(query.to)) : undefined,
    searchPattern
      ? or(
          ilike(payments.paidTo, searchPattern),
          ilike(payments.purpose, searchPattern),
          ilike(payments.address, searchPattern),
          ilike(payments.mode, searchPattern),
        )
      : undefined,
    query.category ? eq(payments.category, query.category) : undefined,
    query.siteId ? eq(payments.siteId, query.siteId) : undefined,
    query.plumberId ? eq(payments.plumberId, query.plumberId) : undefined,
    query.projectId ? projectPaymentCondition(query.projectId) : undefined,
    paidTo.length ? inArray(payments.paidTo, paidTo) : undefined,
    purpose.length ? inArray(payments.purpose, purpose) : undefined,
    address.length ? inArray(payments.address, address) : undefined,
    amount.length ? inArray(sql`${payments.amount}::text`, amount) : undefined,
    date.length ? inArray(sql`to_char(${payments.paymentDate}, 'YYYY-MM-DD')`, date) : undefined,
    status.length ? inArray(payments.status, status) : undefined,
    supervisorCategoryCondition(currentUser),
  ];
}

async function getPaymentOrThrow(id: string) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) throw new Error("Payment not found");
  return payment;
}

export function projectPaymentCondition(projectId: string) {
  const db = getDb();
  return or(
    eq(payments.projectId, projectId),
    inArray(
      payments.siteId,
      db.select({ id: projectSites.id }).from(projectSites).where(eq(projectSites.projectId, projectId)),
    ),
    inArray(
      payments.customerId,
      db.select({ id: customers.id }).from(customers).where(eq(customers.projectId, projectId)),
    ),
  );
}

export const paymentsService = {
  async list(query: PaymentListQuery, currentUser?: AuthTokenPayload | null) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = buildListConditions(query, currentUser).filter(
      (condition): condition is NonNullable<typeof condition> => Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const listSelection = {
      id: payments.id,
      category: payments.category,
      plumberId: payments.plumberId,
      paidTo: payments.paidTo,
      siteId: payments.siteId,
      address: payments.address,
      customerId: payments.customerId,
      customerName: customers.customerName,
      projectId: payments.projectId,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      mode: payments.mode,
      status: payments.status,
      purpose: payments.purpose,
      remarks: payments.remarks,
      evidence: payments.evidence,
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(listSelection)
        .from(payments)
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(payments.paymentDate),
      db.select({ value: count() }).from(payments).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async summary(query: PaymentListQuery, currentUser?: AuthTokenPayload | null) {
    const db = getDb();
    const conditions = buildListConditions(query, currentUser).filter(
      (condition): condition is NonNullable<typeof condition> => Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const totalsOnly = query.totalsOnly === "true";

    const [[totals], categoryRows, recentRows] = await Promise.all([
      db
        .select({ count: count(), total: sum(payments.amount) })
        .from(payments)
        .where(where),
      totalsOnly
        ? Promise.resolve([])
        : db
            .select({ category: payments.category, count: count(), total: sum(payments.amount) })
            .from(payments)
            .where(where)
            .groupBy(payments.category),
      totalsOnly
        ? Promise.resolve([])
        : db
            .select({
              id: payments.id,
              category: payments.category,
              plumberId: payments.plumberId,
              paidTo: payments.paidTo,
              siteId: payments.siteId,
              address: payments.address,
              customerId: payments.customerId,
              customerName: customers.customerName,
              projectId: payments.projectId,
              amount: payments.amount,
              paymentDate: payments.paymentDate,
              mode: payments.mode,
              status: payments.status,
              purpose: payments.purpose,
              remarks: payments.remarks,
            })
            .from(payments)
            .leftJoin(customers, eq(payments.customerId, customers.id))
            .where(where)
            .orderBy(desc(payments.paymentDate))
            .limit(5),
    ]);

    return {
      count: totals?.count ?? 0,
      total: Number(totals?.total ?? 0),
      categoryBreakdown: categoryRows.map((row) => ({
        category: row.category,
        count: row.count,
        total: Number(row.total ?? 0),
      })),
      recent: recentRows,
    };
  },

  async filterValues(column: PaymentFilterColumn, currentUser?: AuthTokenPayload | null): Promise<string[]> {
    if (column === "status") return [...paymentStatusEnum.enumValues];
    if (column === "category") {
      return isCategoryRestricted(currentUser)
        ? [...SUPERVISOR_VISIBLE_CATEGORIES]
        : [...paymentCategoryEnum.enumValues];
    }

    const db = getDb();
    const columnMap = {
      paidTo: payments.paidTo,
      purpose: payments.purpose,
      address: payments.address,
      amount: sql<string>`${payments.amount}::text`,
      date: sql<string>`to_char(${payments.paymentDate}, 'YYYY-MM-DD')`,
    } as const;
    const valueColumn = columnMap[column];

    const rows = await db
      .selectDistinct({ value: valueColumn })
      .from(payments)
      .where(sql`${valueColumn} is not null`)
      .orderBy(asc(valueColumn))
      .limit(500);

    return rows.map((row) => row.value).filter((value): value is string => Boolean(value));
  },

  async get(id: string, currentUser?: AuthTokenPayload | null) {
    const payment = await getPaymentOrThrow(id);
    if (isCategoryRestricted(currentUser) && !SUPERVISOR_VISIBLE_CATEGORIES.includes(payment.category)) {
      throw new Error("Payment not found");
    }
    return payment;
  },

  async create(input: CreatePaymentBody, currentUser: AuthTokenPayload) {
    if (isCategoryRestricted(currentUser) && !SUPERVISOR_VISIBLE_CATEGORIES.includes(input.category)) {
      throw new Error("You do not have permission to record this category of expense");
    }

    const requestedStatus = input.status ?? "draft";
    if ((requestedStatus === "approved" || requestedStatus === "rejected") && !permissionService.canManage(currentUser)) {
      throw new Error("Only admins can create a payment that is already approved or rejected");
    }

    const db = getDb();
    const [payment] = await db
      .insert(payments)
      .values({
        category: input.category,
        plumberId: input.plumberId || null,
        paidTo: input.paidTo || null,
        siteId: input.siteId || null,
        address: input.address || null,
        customerId: input.customerId || null,
        projectId: input.projectId || null,
        amount: String(input.amount),
        paymentDate: new Date(input.paymentDate),
        mode: input.mode,
        status: requestedStatus,
        purpose: input.purpose || null,
        remarks: input.remarks || null,
        evidence: input.evidence,
        submittedBy: currentUser.id,
        ...(requestedStatus === "approved" || requestedStatus === "rejected"
          ? { approvedBy: currentUser.id }
          : {}),
      })
      .returning();

    if (!payment) throw new Error("Unable to create payment");
    return payment;
  },

  async update(id: string, input: UpdatePaymentBody, currentUser: AuthTokenPayload) {
    const existing = await getPaymentOrThrow(id);
    if (isCategoryRestricted(currentUser)) {
      if (!SUPERVISOR_VISIBLE_CATEGORIES.includes(existing.category)) {
        throw new Error("Payment not found");
      }
      if (input.category && !SUPERVISOR_VISIBLE_CATEGORIES.includes(input.category)) {
        throw new Error("You do not have permission to record this category of expense");
      }
    }
    const db = getDb();

    const isApprovalTransition =
      (input.status === "approved" || input.status === "rejected") && input.status !== existing.status;
    if (isApprovalTransition && !permissionService.canManage(currentUser)) {
      throw new Error("Only admins can approve or reject payments");
    }

    const patch = cleanObject({
      category: input.category,
      plumberId: input.plumberId,
      paidTo: input.paidTo,
      siteId: input.siteId,
      address: input.address,
      customerId: input.customerId,
      projectId: input.projectId,
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

  async remove(id: string) {
    const existing = await getPaymentOrThrow(id);
    if (existing.status === "approved") {
      throw new Error("Approved payments cannot be deleted. Please create a Void transaction instead to offset it.");
    }
    const db = getDb();
    await db.delete(payments).where(eq(payments.id, id));
  },
};
