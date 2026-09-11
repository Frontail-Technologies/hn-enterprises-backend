import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import { getDb } from "@db";
import { customers, payments, paymentCategoryEnum, paymentStatusEnum, projectSites, users } from "@db/schema";

const supervisorUsers = alias(users, "supervisor_users");
const createdByUsers = alias(users, "created_by_users");
import { permissionService } from "@services";
import { activityService } from "@modules/activity/activity.service";
import { expenseTitle } from "@modules/activity/activity.catalog";
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

/**
 * Backend-enforced visibility scope (R13): a supervisor only ever sees
 * expenses attributed to them (own-created or admin-created-on-their-behalf),
 * never another supervisor's - regardless of what the client requests.
 */
function supervisorOwnershipCondition(currentUser?: AuthTokenPayload | null) {
  return currentUser?.role === "supervisor" ? eq(payments.supervisorId, currentUser.id) : undefined;
}

async function assertIsSupervisor(userId: string) {
  const db = getDb();
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "supervisor") throw new Error("Selected supervisor was not found");
}

async function resolveProjectIdForCustomer(customerId: string): Promise<string | null> {
  const db = getDb();
  const [customer] = await db.select({ projectId: customers.projectId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new Error("Selected customer was not found");
  return customer.projectId ?? null;
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
    // Customer-city scope via a subquery so both list() and summary() work
    // without needing the customers join in their FROM clause.
    query.city
      ? inArray(
          payments.customerId,
          getDb().select({ id: customers.id }).from(customers).where(eq(customers.city, query.city)),
        )
      : undefined,
    paidTo.length ? inArray(payments.paidTo, paidTo) : undefined,
    purpose.length ? inArray(payments.purpose, purpose) : undefined,
    address.length ? inArray(payments.address, address) : undefined,
    amount.length ? inArray(sql`${payments.amount}::text`, amount) : undefined,
    date.length ? inArray(sql`to_char(${payments.paymentDate}, 'YYYY-MM-DD')`, date) : undefined,
    status.length ? inArray(payments.status, status) : undefined,
    supervisorCategoryCondition(currentUser),
    supervisorOwnershipCondition(currentUser),
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
      address: payments.address,
      customerId: payments.customerId,
      customerName: customers.customerName,
      customerTrBpNumber: customers.trBpNumber,
      projectId: payments.projectId,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      mode: payments.mode,
      status: payments.status,
      purpose: payments.purpose,
      remarks: payments.remarks,
      evidence: payments.evidence,
      supervisorId: payments.supervisorId,
      // Live relation name -> immutable snapshot (safe-hard-delete brief §5) - never null just because the supervisor/submitter was hard-deleted.
      supervisorName: sql<string | null>`coalesce(${supervisorUsers.name}, ${payments.supervisorNameSnapshot})`,
      createdById: payments.createdById,
      createdByName: sql<string | null>`coalesce(${createdByUsers.name}, ${payments.createdByNameSnapshot})`,
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(listSelection)
        .from(payments)
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .leftJoin(supervisorUsers, eq(payments.supervisorId, supervisorUsers.id))
        .leftJoin(createdByUsers, eq(payments.createdById, createdByUsers.id))
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

    const [[totals], categoryRows, statusRows, recentRows] = await Promise.all([
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
            .select({ status: payments.status, count: count(), total: sum(payments.amount) })
            .from(payments)
            .where(where)
            .groupBy(payments.status),
      totalsOnly
        ? Promise.resolve([])
        : db
            .select({
              id: payments.id,
              category: payments.category,
              plumberId: payments.plumberId,
              paidTo: payments.paidTo,
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
              supervisorId: payments.supervisorId,
              supervisorName: sql<string | null>`coalesce(${supervisorUsers.name}, ${payments.supervisorNameSnapshot})`,
              createdById: payments.createdById,
              createdByName: sql<string | null>`coalesce(${createdByUsers.name}, ${payments.createdByNameSnapshot})`,
            })
            .from(payments)
            .leftJoin(customers, eq(payments.customerId, customers.id))
            .leftJoin(supervisorUsers, eq(payments.supervisorId, supervisorUsers.id))
            .leftJoin(createdByUsers, eq(payments.createdById, createdByUsers.id))
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
      statusBreakdown: statusRows.map((row) => ({
        status: row.status,
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

    /**
     * Financial attribution (supervisorId) is server-derived, never trusted
     * from the request body for the acting supervisor - a supervisor cannot
     * spoof another supervisor's expense. Only an admin/super_admin may set
     * this to someone else (the "create on behalf of" workflow); createdById
     * is always the real authenticated actor, admin included.
     */
    let supervisorId: string | null;
    if (currentUser.role === "supervisor") {
      supervisorId = currentUser.id;
    } else if (permissionService.canManage(currentUser)) {
      supervisorId = input.supervisorId || null;
      if (supervisorId) await assertIsSupervisor(supervisorId);
    } else {
      supervisorId = null;
    }

    // Expenses select Customer, not Site/Project (R14/R16) - project is
    // derived from the customer's own project rather than asked redundantly.
    const projectId = input.customerId ? await resolveProjectIdForCustomer(input.customerId) : input.projectId || null;

    const db = getDb();
    // Immutable snapshots (safe-hard-delete brief §5) - survive a hard-deleted supervisor/submitter.
    const snapshotIds = [supervisorId, currentUser.id].filter((id): id is string => Boolean(id));
    const snapshotRows = snapshotIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, snapshotIds))
      : [];
    const nameById = new Map(snapshotRows.map((row) => [row.id, row.name]));

    const [payment] = await db
      .insert(payments)
      .values({
        category: input.category,
        plumberId: input.plumberId || null,
        paidTo: input.paidTo || null,
        address: input.address || null,
        customerId: input.customerId || null,
        projectId,
        amount: String(input.amount),
        paymentDate: new Date(input.paymentDate),
        mode: input.mode,
        status: requestedStatus,
        purpose: input.purpose || null,
        remarks: input.remarks || null,
        evidence: input.evidence,
        supervisorId,
        supervisorNameSnapshot: supervisorId ? (nameById.get(supervisorId) ?? null) : null,
        createdById: currentUser.id,
        createdByNameSnapshot: nameById.get(currentUser.id) ?? null,
        ...(requestedStatus === "approved" || requestedStatus === "rejected"
          ? { approvedBy: currentUser.id }
          : {}),
      })
      .returning();

    if (!payment) throw new Error("Unable to create payment");

    await activityService.record({
      type: "expense",
      action: "expense.created",
      actorId: currentUser.id,
      onBehalfOfUserId: supervisorId,
      customerId: payment.customerId,
      projectId: payment.projectId,
      entityType: "payment",
      entityId: payment.id,
      sourceType: "payment",
      sourceId: payment.id,
      title: `${expenseTitle(payment.category, "created")}`,
      description: payment.purpose || payment.remarks || "Expense added",
      metadata: {
        category: payment.category,
        status: payment.status,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
      },
      occurredAt: payment.createdAt,
    });

    return payment;
  },

  async update(id: string, input: UpdatePaymentBody, currentUser: AuthTokenPayload) {
    const existing = await getPaymentOrThrow(id);
    if (isCategoryRestricted(currentUser)) {
      if (!SUPERVISOR_VISIBLE_CATEGORIES.includes(existing.category)) {
        throw new Error("Payment not found");
      }
      if (existing.supervisorId !== currentUser.id) {
        throw new Error("Not authorized to update this expense");
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

    // Only an admin may reassign whose expense this is; a supervisor can
    // never touch supervisorId, spoofed or otherwise.
    let supervisorId: string | undefined;
    if (permissionService.canManage(currentUser) && input.supervisorId !== undefined) {
      if (input.supervisorId) await assertIsSupervisor(input.supervisorId);
      supervisorId = input.supervisorId;
    }

    const projectId = input.customerId ? await resolveProjectIdForCustomer(input.customerId) : input.projectId;

    const patch = cleanObject({
      category: input.category,
      plumberId: input.plumberId,
      paidTo: input.paidTo,
      address: input.address,
      customerId: input.customerId,
      projectId,
      amount: input.amount != null ? String(input.amount) : undefined,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : undefined,
      mode: input.mode,
      status: input.status,
      purpose: input.purpose,
      remarks: input.remarks,
      evidence: input.evidence,
      supervisorId,
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

    const statusChanged = input.status !== undefined && input.status !== existing.status;
    await activityService.record({
      type: "expense",
      action: statusChanged ? `expense.${payment.status}` : "expense.updated",
      actorId: currentUser.id,
      onBehalfOfUserId: payment.supervisorId,
      customerId: payment.customerId,
      projectId: payment.projectId,
      entityType: "payment",
      entityId: payment.id,
      sourceType: "payment",
      sourceId: payment.id,
      title: statusChanged
        ? expenseTitle(payment.category, payment.status)
        : `${expenseTitle(payment.category, "updated")}`,
      description: payment.purpose || payment.remarks || "Expense updated",
      metadata: {
        category: payment.category,
        status: payment.status,
        previousStatus: statusChanged ? existing.status : undefined,
        amount: payment.amount,
      },
      occurredAt: payment.updatedAt,
    });

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
