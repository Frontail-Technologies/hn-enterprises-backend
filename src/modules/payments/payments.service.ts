import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import { getDb } from "@db";
import { customers, payments, paymentCategoryEnum, paymentStatusEnum, projectSites } from "@db/schema";
import { permissionService } from "@services";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type { AuthTokenPayload } from "@types";
import type { CreatePaymentBody, PaymentFilterColumn, PaymentListQuery, PaymentStatus, UpdatePaymentBody } from "./payments.types";

function parseCsv(value?: string): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

// Shared by list() and summary() - every filter that can narrow "the
// expenses" being viewed: search, date range, category, site/plumber/
// project, and the column-filter checkboxes. summary() is called with two
// different subsets of this same query shape depending on caller intent -
// see summary()'s own comment for why.
function buildListConditions(query: PaymentListQuery) {
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
    // The All Expenses column-filter checkboxes (purpose/paidTo/address/
    // amount/date/status) - each an exact-value multi-select over whatever
    // the sheet shows as options (see filterValues() below), sent up as a
    // comma-separated list of the selected values.
    paidTo.length ? inArray(payments.paidTo, paidTo) : undefined,
    purpose.length ? inArray(payments.purpose, purpose) : undefined,
    address.length ? inArray(payments.address, address) : undefined,
    // amount/paymentDate are numeric/timestamp columns - the checkbox sheet
    // deals in the same display strings Mobile renders, so compare as text
    // rather than requiring the client to round-trip a numeric/date type.
    amount.length ? inArray(sql`${payments.amount}::text`, amount) : undefined,
    date.length ? inArray(sql`to_char(${payments.paymentDate}, 'YYYY-MM-DD')`, date) : undefined,
    status.length ? inArray(payments.status, status) : undefined,
  ];
}

async function getPaymentOrThrow(id: string) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) throw new Error("Payment not found");
  return payment;
}

// A payment belongs to a project via any of three paths, in order of how
// directly it's known: its own `projectId` (only set going forward - see
// payment.schema.ts), its site's project, or its customer's project. Most
// historical rows only resolve through the latter two, so all three are
// checked - this stays backward compatible without requiring a backfill.
// Exported so the project summary endpoint can reuse the exact same
// definition of "belongs to this project" instead of re-deriving it.
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
  async list(query: PaymentListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = buildListConditions(query).filter(
      (condition): condition is NonNullable<typeof condition> => Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    // `evidence` IS needed on the list row, not just the single-record detail
    // view: the web admin's Payments & Expenses grid reads it directly off
    // list rows for its Attachment count column, the row-level "View" action,
    // and to prefill the edit drawer (the frontend has no separate
    // get-by-id call - see payments.service.ts on the frontend). Omitting it
    // here previously left all three permanently broken (View always
    // disabled, Attachment column always "-", edit drawer's receipt field
    // always empty) even for payments with real uploaded evidence.
    const listSelection = {
      id: payments.id,
      category: payments.category,
      plumberId: payments.plumberId,
      paidTo: payments.paidTo,
      siteId: payments.siteId,
      address: payments.address,
      customerId: payments.customerId,
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
      db.select(listSelection).from(payments).where(where).limit(limit).offset(offset).orderBy(payments.paymentDate),
      db.select({ value: count() }).from(payments).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  // Same query shape (and the exact same condition-building) as list(), just
  // aggregated instead of paginated - reused by two different callers with
  // two different scopes:
  //  - Overview tab: search/date only, deliberately omitting category/
  //    status/column filters, so drilling into one category on the All
  //    Expenses list can never collapse Overview's own totals to that slice.
  //  - All Expenses list's own "N expenses, ₹total" line: the full active
  //    filter set, so that figure matches exactly what's on screen.
  // Either way this is computed directly in SQL over the full matching
  // dataset, never the paginated list's loaded pages.
  async summary(query: PaymentListQuery) {
    const db = getDb();
    const conditions = buildListConditions(query).filter(
      (condition): condition is NonNullable<typeof condition> => Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    // The All Expenses list's own total line and the "any expenses at all"
    // check only ever read count/total - skip the groupBy and the recent-5
    // lookup for them so a category drill-down isn't waiting on two
    // sub-queries whose results are thrown away.
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
      // list() orders ascending (oldest first, for stable pagination) - the
      // "recent" 5 shown here are the opposite end of that, so this can't
      // reuse whatever page the All Expenses list happens to have loaded.
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
              projectId: payments.projectId,
              amount: payments.amount,
              paymentDate: payments.paymentDate,
              mode: payments.mode,
              status: payments.status,
              purpose: payments.purpose,
              remarks: payments.remarks,
            })
            .from(payments)
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

  // Authoritative option universe for the All Expenses column-filter
  // checkboxes - status/category are canonical enums (free, no DB round
  // trip); the free-text/numeric columns are a real DISTINCT scan since
  // there's no master-data source for them. Capped since these are meant to
  // populate a checkbox list, not export the dataset.
  async filterValues(column: PaymentFilterColumn): Promise<string[]> {
    if (column === "status") return [...paymentStatusEnum.enumValues];
    if (column === "category") return [...paymentCategoryEnum.enumValues];

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

  async get(id: string) {
    return getPaymentOrThrow(id);
  },

  async create(input: CreatePaymentBody, currentUser: AuthTokenPayload) {
    // A freshly-created payment can only start as "approved"/"rejected" if the
    // submitter is actually allowed to approve payments - otherwise anyone
    // could bypass the approval workflow entirely by setting the status on
    // create instead of going through update().
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
    const db = getDb();

    // Only treat this as an approval action if the status is actually changing
    // to approved/rejected - otherwise every unrelated edit (e.g. adding a
    // receipt photo) to an already-approved payment would re-trip this check
    // for the non-admin who originally submitted it.
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
