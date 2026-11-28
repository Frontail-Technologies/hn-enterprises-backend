import { and, count, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { getDb } from "@db";
import { billPayments, bills, projects } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { snapshotRecords } from "@modules/recycle-bin/recycle-bin.service";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type {
  BillListQuery,
  BillPaymentStatus,
  CreateBillBody,
  CreateBillPaymentBody,
  UpdateBillBody,
} from "./bills.types";

type BillMoney = {
  totalAmount: string;
  tax: string;
  paidAmount: string;
  tdsIncome?: string;
  tdsGst?: string;
  prs?: string;
  bankGuarantee?: string;
  bgReleased?: string;
  holdAmount?: string;
  holdReleased?: string;
};

const n = (value: string | undefined) => Number(value ?? 0);

/** What the client still owes: total + tax - TDS - PRS - BG still held - hold still held. */
export function netPayable(bill: BillMoney) {
  const bgHeld = n(bill.bankGuarantee) - n(bill.bgReleased);
  const holdHeld = n(bill.holdAmount) - n(bill.holdReleased);
  return n(bill.totalAmount) + n(bill.tax) - n(bill.tdsIncome) - n(bill.tdsGst) - n(bill.prs) - bgHeld - holdHeld;
}

/** Same as netPayable, in SQL (for sums). */
export const NET_PAYABLE_SQL = sql`(${bills.totalAmount} + ${bills.tax} - ${bills.tdsIncome} - ${bills.tdsGst} - ${bills.prs}
  - (${bills.bankGuarantee} - ${bills.bgReleased}) - (${bills.holdAmount} - ${bills.holdReleased}))`;

function withPendingAmount<T extends BillMoney>(bill: T) {
  const net = netPayable(bill);
  return {
    ...bill,
    netPayable: net,
    pendingAmount: net - n(bill.paidAmount),
    bgHeld: n(bill.bankGuarantee) - n(bill.bgReleased),
    holdHeld: n(bill.holdAmount) - n(bill.holdReleased),
  };
}

function deductionValues(input: { tdsIncome?: number; tdsGst?: number; prs?: number; bankGuarantee?: number; holdAmount?: number }) {
  return {
    ...(input.tdsIncome != null ? { tdsIncome: String(input.tdsIncome) } : {}),
    ...(input.tdsGst != null ? { tdsGst: String(input.tdsGst) } : {}),
    ...(input.prs != null ? { prs: String(input.prs) } : {}),
    ...(input.bankGuarantee != null ? { bankGuarantee: String(input.bankGuarantee) } : {}),
    ...(input.holdAmount != null ? { holdAmount: String(input.holdAmount) } : {}),
  };
}

async function getBillOrThrow(id: string) {
  const db = getDb();
  const bill = await db.query.bills.findFirst({
    where: eq(bills.id, id),
    with: { payments: true },
  });
  if (!bill) throw new Error("Bill not found");
  return bill;
}

export const billsService = {
  async list(query: BillListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.projectId ? eq(bills.projectId, query.projectId) : undefined,
      query.status ? eq(bills.status, query.status) : undefined,
      searchPattern ? ilike(bills.billNumber, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({ ...getTableColumns(bills), projectName: projects.name })
        .from(bills)
        .leftJoin(projects, eq(bills.projectId, projects.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(bills.billDate),
      db.select({ value: count() }).from(bills).where(where),
    ]);

    return { rows: rows.map(withPendingAmount), pagination: buildPaginationMeta(page, limit, total) };
  },

  /** Dataset-wide billing totals for the stat cards, honoring the same filters as list(). */
  async summary(query: BillListQuery) {
    const db = getDb();
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.projectId ? eq(bills.projectId, query.projectId) : undefined,
      query.status ? eq(bills.status, query.status) : undefined,
      searchPattern ? ilike(bills.billNumber, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [row] = await db
      .select({
        billed: sql<string>`coalesce(sum(${bills.totalAmount}), 0)`,
        received: sql<string>`coalesce(sum(${bills.paidAmount}), 0)`,
        pending: sql<string>`coalesce(sum(${NET_PAYABLE_SQL} - ${bills.paidAmount}), 0)`,
        overdue: sql<string>`coalesce(sum(case when ${bills.status} = 'overdue' then ${NET_PAYABLE_SQL} - ${bills.paidAmount} else 0 end), 0)`,
        tds: sql<string>`coalesce(sum(${bills.tdsIncome} + ${bills.tdsGst}), 0)`,
        prs: sql<string>`coalesce(sum(${bills.prs}), 0)`,
        bgHeld: sql<string>`coalesce(sum(${bills.bankGuarantee} - ${bills.bgReleased}), 0)`,
        holdHeld: sql<string>`coalesce(sum(${bills.holdAmount} - ${bills.holdReleased}), 0)`,
      })
      .from(bills)
      .where(where);

    return {
      billed: Number(row?.billed ?? 0),
      received: Number(row?.received ?? 0),
      pending: Number(row?.pending ?? 0),
      overdue: Number(row?.overdue ?? 0),
      tds: Number(row?.tds ?? 0),
      prs: Number(row?.prs ?? 0),
      bgHeld: Number(row?.bgHeld ?? 0),
      holdHeld: Number(row?.holdHeld ?? 0),
    };
  },

  async get(id: string) {
    const bill = await getBillOrThrow(id);
    return withPendingAmount(bill);
  },

  async create(input: CreateBillBody, userId: string) {
    const db = getDb();
    const [bill] = await db
      .insert(bills)
      .values({
        projectId: input.projectId,
        billNumber: input.billNumber,
        normalizedBillNumber: normalizeKey(input.billNumber),
        billDate: input.billDate ? new Date(input.billDate) : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        totalAmount: String(input.totalAmount),
        tax: String(input.tax ?? 0),
        ...deductionValues(input),
        status: input.status ?? "draft",
        remarks: input.remarks || null,
        attachments: input.attachments ?? [],
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!bill) throw new Error("Unable to create bill");
    return withPendingAmount(bill);
  },

  async update(id: string, input: UpdateBillBody, userId: string) {
    await getBillOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      projectId: input.projectId,
      billNumber: input.billNumber,
      billDate: input.billDate ? new Date(input.billDate) : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      totalAmount: input.totalAmount != null ? String(input.totalAmount) : undefined,
      tax: input.tax != null ? String(input.tax) : undefined,
      status: input.status,
      remarks: input.remarks,
    });

    const [bill] = await db
      .update(bills)
      .set({
        ...patch,
        ...(input.billNumber ? { normalizedBillNumber: normalizeKey(input.billNumber) } : {}),
        ...deductionValues(input),
        // An empty list is a real value (all photos removed), so it bypasses cleanObject.
        ...(input.attachments ? { attachments: input.attachments } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(bills.id, id))
      .returning();

    if (!bill) throw new Error("Unable to update bill");
    return withPendingAmount(bill);
  },

  /** The bill and its received payments go to the recycle bin (30 days). */
  async delete(id: string, userId: string) {
    await getBillOrThrow(id);
    await getDb().transaction(async (tx) => {
      await snapshotRecords(tx, "bill", [id], userId);
      await tx.delete(bills).where(eq(bills.id, id));
    });
  },

  async listPayments(billId: string) {
    await getBillOrThrow(billId);
    const db = getDb();
    return db
      .select()
      .from(billPayments)
      .where(eq(billPayments.billId, billId))
      .orderBy(billPayments.paymentDate);
  },

  async createPayment(billId: string, input: CreateBillPaymentBody, userId: string) {
    const db = getDb();

    return db.transaction(async (tx) => {
      const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
      if (!bill) throw new Error("Bill not found");

      const totalPayable = netPayable(bill);
      const currentPaid = Number(bill.paidAmount);
      const newPayment = Number(input.amount);

      if (currentPaid + newPayment > totalPayable) {
        throw new Error(`Payment of ${newPayment} exceeds the remaining balance of ${totalPayable - currentPaid}`);
      }

      const [payment] = await tx
        .insert(billPayments)
        .values({
          billId,
          amount: String(input.amount),
          paymentDate: new Date(input.paymentDate),
          mode: input.mode,
          status: input.status ?? "cleared",
          receivedBy: userId,
          remarks: input.remarks || null,
        })
        .returning();

      if (!payment) throw new Error("Unable to record payment");

      const [updatedBill] = await tx
        .update(bills)
        .set({
          paidAmount: sql`${bills.paidAmount} + ${input.amount}`,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(bills.id, billId))
        .returning();

      const newPaidAmount = Number(updatedBill.paidAmount);
      const newTotalPayable = netPayable(updatedBill);
      const nextStatus =
        newPaidAmount >= newTotalPayable ? "completed" : updatedBill.status === "draft" ? "submitted" : updatedBill.status;

      if (updatedBill.status !== nextStatus) {
        await tx.update(bills).set({ status: nextStatus }).where(eq(bills.id, billId));
      }

      return payment;
    });
  },

  /**
   * The client paid out (part of) the bank guarantee or the held amount: it
   * becomes "released" and is recorded as a received payment on the bill.
   */
  async releaseAmount(
    billId: string,
    input: { kind: "bg" | "hold"; amount: number; paymentDate: string; mode: string; remarks?: string },
    userId: string,
  ) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
      if (!bill) throw new Error("Bill not found");
      const held = input.kind === "bg" ? n(bill.bankGuarantee) - n(bill.bgReleased) : n(bill.holdAmount) - n(bill.holdReleased);
      const label = input.kind === "bg" ? "Bank guarantee" : "Hold amount";
      if (input.amount > held + 0.001) throw new Error(`${label} release cannot be more than the ${held.toFixed(2)} still held`);

      const [payment] = await tx
        .insert(billPayments)
        .values({
          billId,
          amount: String(input.amount),
          paymentDate: new Date(input.paymentDate),
          mode: input.mode,
          status: "cleared",
          receivedBy: userId,
          remarks: [`${label} released`, input.remarks?.trim()].filter(Boolean).join(" - "),
        })
        .returning();

      await tx
        .update(bills)
        .set({
          ...(input.kind === "bg"
            ? { bgReleased: sql`${bills.bgReleased} + ${input.amount}` }
            : { holdReleased: sql`${bills.holdReleased} + ${input.amount}` }),
          paidAmount: sql`${bills.paidAmount} + ${input.amount}`,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(bills.id, billId));
      return payment;
    });
  },

  async updatePaymentStatus(billId: string, paymentId: string, status: BillPaymentStatus) {
    const db = getDb();
    await getBillOrThrow(billId);

    const [payment] = await db
      .update(billPayments)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(billPayments.id, paymentId), eq(billPayments.billId, billId)))
      .returning();

    if (!payment) throw new Error("Payment not found");
    return payment;
  },
};
