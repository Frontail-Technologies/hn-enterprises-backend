import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { payments, plumbers } from "@db/schema";
import type { PaymentCategory } from "./payments.types";

type PaymentImportRow = {
  rowNumber: number;
  category: string;
  paidTo: string;
  plumberName: string;
  amount: string;
  paymentDate: string;
  mode: string;
  purpose: string;
  remarks: string;
  address: string;
};

type PaymentImportInvalidRow = PaymentImportRow & { error: string };

const CATEGORY_ALIASES: Record<string, PaymentCategory> = {
  "worker payments": "worker_payment",
  worker_payment: "worker_payment",
  "supervisor payments": "supervisor_payment",
  supervisor_payment: "supervisor_payment",
  "plumber payments": "plumber_payment",
  plumber_payment: "plumber_payment",
  "office / guest house rent": "rent",
  "office guest house rent": "rent",
  rent: "rent",
  "material expenses": "material_expense",
  material_expense: "material_expense",
  "other expenses": "other_expense",
  other_expense: "other_expense",
};

function findColumn(row: Record<string, unknown>, key: string): unknown {
  const found = Object.keys(row).find((k) => normalizeKey(k) === key);
  return found ? row[found] : undefined;
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(findColumn(row, key) ?? "").trim();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const paymentsImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new Error("Only admin users can import payments");
    }

    const rawRows = await readSheetRows(file);

    const validRows: PaymentImportRow[] = [];
    const invalidRows: PaymentImportInvalidRow[] = [];

    for (const row of rawRows) {
      const categoryRaw = cell(row.values, "category");
      const paidTo = cell(row.values, "paid to");
      const plumberName = cell(row.values, "plumber name");
      const amountRaw = cell(row.values, "amount");
      const paymentDateRaw = cell(row.values, "payment date") || cell(row.values, "date");
      const mode = cell(row.values, "mode");
      const purpose = cell(row.values, "purpose");
      const remarks = cell(row.values, "remarks");
      const address = cell(row.values, "address");

      const base = {
        rowNumber: row.rowNumber,
        category: categoryRaw,
        paidTo,
        plumberName,
        amount: amountRaw,
        paymentDate: paymentDateRaw,
        mode,
        purpose,
        remarks,
        address,
      };

      const category = CATEGORY_ALIASES[normalizeKey(categoryRaw)];
      if (!category) {
        invalidRows.push({ ...base, error: "Unrecognized category" });
        continue;
      }

      const amount = Number(amountRaw);
      if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
        invalidRows.push({ ...base, error: "Amount must be a positive number" });
        continue;
      }

      if (!parseDate(paymentDateRaw)) {
        invalidRows.push({ ...base, error: "Payment date is missing or unreadable" });
        continue;
      }

      if (!mode) {
        invalidRows.push({ ...base, error: "Missing payment mode" });
        continue;
      }

      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async confirm(validRows: Omit<PaymentImportRow, "rowNumber">[], user: { id: string }) {
    if (!validRows.length) return { insertedCount: 0 };

    const db = getDb();

    const plumberRows = await db.select({ id: plumbers.id, normalizedName: plumbers.normalizedName }).from(plumbers);
    const plumberIdByName = new Map(plumberRows.map((p) => [p.normalizedName, p.id]));

    let insertedCount = 0;

    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const category = CATEGORY_ALIASES[normalizeKey(row.category)];
        const date = parseDate(row.paymentDate);
        if (!category || !date) continue;

        const plumberId = row.plumberName ? plumberIdByName.get(normalizeKey(row.plumberName)) ?? null : null;

        await tx.insert(payments).values({
          category,
          plumberId,
          paidTo: row.paidTo || null,
          address: row.address || null,
          amount: String(Number(row.amount)),
          paymentDate: date,
          mode: row.mode,
          status: "draft",
          purpose: row.purpose || null,
          remarks: row.remarks || null,
          submittedBy: user.id,
        });
        insertedCount += 1;
      }
    });

    return { insertedCount };
  },
};

