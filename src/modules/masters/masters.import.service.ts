import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { masterValues } from "@db/schema";
import { and, eq } from "drizzle-orm";
import type { MasterValueCategory } from "./masters.types";

export type MasterValueImportRowData = { value: string; description: string };
type MasterValueImportRow = MasterValueImportRowData & { rowNumber: number };
type MasterValueImportInvalidRow = MasterValueImportRow & { error: string };

function assertAdmin(role: string) {
  if (!["super_admin", "admin"].includes(role)) {
    throw new Error("Only admin users can import master data");
  }
}

// Shared by the bulk preview loop and the standalone validate-row endpoint -
// in-file duplicates are only caught during the initial bulk preview (the
// only place every row is available at once); a later single-row
// revalidation checks against existing system records for that category.
export function validateMasterValueRow(data: MasterValueImportRowData, existingValues: Set<string>): { error?: string } {
  if (!data.value) return { error: "Missing value" };
  if (existingValues.has(normalizeKey(data.value))) return { error: "Duplicate value in system" };
  return {};
}

async function loadExistingValues(category: MasterValueCategory) {
  const db = getDb();
  const existing = await db
    .select({ normalizedValue: masterValues.normalizedValue })
    .from(masterValues)
    .where(eq(masterValues.category, category));
  return new Set(existing.map((e) => e.normalizedValue));
}

export const masterValuesImportService = {
  async preview(file: File, category: MasterValueCategory, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);
    const validRows: MasterValueImportRow[] = [];
    const invalidRows: MasterValueImportInvalidRow[] = [];
    const existingSet = await loadExistingValues(category);

    for (const row of rawRows) {
      const valueKey = Object.keys(row.values).find((k) => normalizeKey(k) === "value");
      const descKey = Object.keys(row.values).find((k) => normalizeKey(k) === "description");

      const base = {
        rowNumber: row.rowNumber,
        value: valueKey ? String(row.values[valueKey] || "").trim() : "",
        description: descKey ? String(row.values[descKey] || "").trim() : "",
      };

      const { error } = validateMasterValueRow(base, existingSet);
      if (error) {
        invalidRows.push({ ...base, error });
        continue;
      }

      existingSet.add(normalizeKey(base.value));
      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async validateRow(data: MasterValueImportRowData, category: MasterValueCategory, user: { role: string }) {
    assertAdmin(user.role);
    const existingSet = await loadExistingValues(category);
    return validateMasterValueRow(data, existingSet);
  },

  // Per-row isolated - each master value is an independent insert, only
  // constrained by per-category uniqueness, already checked per-row.
  async confirm(validRows: MasterValueImportRow[], category: MasterValueCategory, user: { id: string }) {
    const db = getDb();
    let insertedCount = 0;
    const failed: { tempId: string; message: string }[] = [];

    for (const row of validRows) {
      const tempId = String(row.rowNumber);
      try {
        const norm = normalizeKey(row.value);
        const [conflict] = await db
          .select({ id: masterValues.id })
          .from(masterValues)
          .where(and(eq(masterValues.category, category), eq(masterValues.normalizedValue, norm)))
          .limit(1);

        if (conflict) {
          failed.push({ tempId, message: "Duplicate value in system" });
          continue;
        }

        await db.insert(masterValues).values({
          category,
          value: row.value,
          normalizedValue: norm,
          description: row.description || null,
          createdBy: user.id,
          updatedBy: user.id,
        });
        insertedCount += 1;
      } catch (error) {
        failed.push({ tempId, message: error instanceof Error ? error.message : "Unable to import this row" });
      }
    }

    return { insertedCount, imported: insertedCount, failed };
  },
};
