import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { payments, plumbers } from "@db/schema";
import type { PaymentCategory } from "./payments.types";

export type PaymentImportRowData = {
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

type PaymentImportRow = PaymentImportRowData & { rowNumber: number };

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

function assertAdmin(role: string) {
  if (!["super_admin", "admin"].includes(role)) {
    throw new Error("Only admin users can import payments");
  }
}

// Shared by the bulk preview loop and the standalone validate-row endpoint -
// exactly the same checks either way, so an edited row is held to the same
// bar the original file was.
export function validatePaymentRow(data: PaymentImportRowData): { error?: string } {
  const category = CATEGORY_ALIASES[normalizeKey(data.category)];
  if (!category) return { error: "Unrecognized category" };

  const amount = Number(data.amount);
  if (!data.amount || Number.isNaN(amount) || amount <= 0) return { error: "Amount must be a positive number" };

  if (!parseDate(data.paymentDate)) return { error: "Payment date is missing or unreadable" };
  if (!data.mode) return { error: "Missing payment mode" };

  return {};
}

export const paymentsImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);

    const validRows: PaymentImportRow[] = [];
    const invalidRows: PaymentImportInvalidRow[] = [];

    for (const row of rawRows) {
      const base = {
        rowNumber: row.rowNumber,
        category: cell(row.values, "category"),
        paidTo: cell(row.values, "paid to"),
        plumberName: cell(row.values, "plumber name"),
        amount: cell(row.values, "amount"),
        paymentDate: cell(row.values, "payment date") || cell(row.values, "date"),
        mode: cell(row.values, "mode"),
        purpose: cell(row.values, "purpose"),
        remarks: cell(row.values, "remarks"),
        address: cell(row.values, "address"),
      };

      const { error } = validatePaymentRow(base);
      if (error) {
        invalidRows.push({ ...base, error });
        continue;
      }

      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async validateRow(data: PaymentImportRowData, user: { role: string }) {
    assertAdmin(user.role);
    return validatePaymentRow(data);
  },

  // Per-row isolated - each payment row is independent (no cross-row FK or
  // ordering relationship), so one row's DB failure is reported and skipped
  // rather than discarding the rest of the accepted rows.
  async confirm(validRows: PaymentImportRow[], user: { id: string }) {
    const db = getDb();

    const plumberRows = await db.select({ id: plumbers.id, normalizedName: plumbers.normalizedName }).from(plumbers);
    const plumberIdByName = new Map(plumberRows.map((p) => [p.normalizedName, p.id]));

    let insertedCount = 0;
    const failed: { tempId: string; message: string }[] = [];

    for (const row of validRows) {
      const tempId = String(row.rowNumber);
      try {
        const category = CATEGORY_ALIASES[normalizeKey(row.category)];
        const date = parseDate(row.paymentDate);
        if (!category || !date) {
          failed.push({ tempId, message: "Unrecognized category or unreadable payment date" });
          continue;
        }

        const plumberId = row.plumberName ? plumberIdByName.get(normalizeKey(row.plumberName)) ?? null : null;

        await db.insert(payments).values({
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
      } catch (error) {
        failed.push({ tempId, message: error instanceof Error ? error.message : "Unable to import this row" });
      }
    }

    return { insertedCount, imported: insertedCount, failed };
  },
};
