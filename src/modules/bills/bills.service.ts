import { and, count, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@db";
import { billPayments, bills } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type {
  BillListQuery,
  CreateBillBody,
  CreateBillPaymentBody,
  UpdateBillBody,
} from "./bills.types";

function withPendingAmount<T extends { totalAmount: string; tax: string; paidAmount: string }>(
  bill: T,
) {
  const pendingAmount = Number(bill.totalAmount) + Number(bill.tax) - Number(bill.paidAmount);
  return { ...bill, pendingAmount };
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
      query.customerId ? eq(bills.customerId, query.customerId) : undefined,
      query.stage ? eq(bills.stage, query.stage) : undefined,
      query.status ? eq(bills.status, query.status) : undefined,
      searchPattern ? ilike(bills.billNumber, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(bills).where(where).limit(limit).offset(offset).orderBy(bills.billDate),
      db.select({ value: count() }).from(bills).where(where),
    ]);

    return { rows: rows.map(withPendingAmount), pagination: buildPaginationMeta(page, limit, total) };
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
        customerId: input.customerId,
        billNumber: input.billNumber,
        normalizedBillNumber: normalizeKey(input.billNumber),
        stage: input.stage ?? "other",
        billDate: input.billDate ? new Date(input.billDate) : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        totalAmount: String(input.totalAmount),
        tax: String(input.tax ?? 0),
        status: input.status ?? "draft",
        remarks: input.remarks || null,
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
      customerId: input.customerId,
      billNumber: input.billNumber,
      stage: input.stage,
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
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(bills.id, id))
      .returning();

    if (!bill) throw new Error("Unable to update bill");
    return withPendingAmount(bill);
  },

  async delete(id: string) {
    const db = getDb();
    const existing = await getBillOrThrow(id);
    if (existing.status === "completed") {
      throw new Error("Completed bills cannot be deleted. Please create a Void transaction instead to offset it.");
    }

    try {
      await db.delete(bills).where(eq(bills.id, id));
    } catch (error: any) {
      if (error.code === "23503") {
        throw new Error("Cannot delete this bill because it has associated payments. Please delete the payments first.");
      }
      throw error;
    }
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

      const totalPayable = Number(bill.totalAmount) + Number(bill.tax);
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
      const newTotalPayable = Number(updatedBill.totalAmount) + Number(updatedBill.tax);
      const nextStatus =
        newPaidAmount >= newTotalPayable ? "completed" : updatedBill.status === "draft" ? "submitted" : updatedBill.status;

      if (updatedBill.status !== nextStatus) {
        await tx.update(bills).set({ status: nextStatus }).where(eq(bills.id, billId));
      }

      return payment;
    });
  },
};
