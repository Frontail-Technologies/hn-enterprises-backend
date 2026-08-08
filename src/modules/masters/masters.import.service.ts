import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { masterValues } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { MasterValueCategory } from "./masters.types";

export const masterValuesImportService = {
  async preview(file: File, category: MasterValueCategory, user: { id: string; role: string }) {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new Error("Only admin users can import master data");
    }

    const rawRows = await readSheetRows(file);
    
    // We expect the Excel to have columns like "Value", "Description"
    const validRows: { rowNumber: number; value: string; description: string }[] = [];
    const invalidRows: { rowNumber: number; value: string; description: string; error: string }[] = [];

    // Fetch existing for this category to detect duplicates early
    const db = getDb();
    const existing = await db
      .select({ normalizedValue: masterValues.normalizedValue })
      .from(masterValues)
      .where(eq(masterValues.category, category));
    
    const existingSet = new Set(existing.map((e) => e.normalizedValue));

    for (const row of rawRows) {
      // Find "Value" column
      const valueKey = Object.keys(row.values).find((k) => normalizeKey(k) === "value");
      const descKey = Object.keys(row.values).find((k) => normalizeKey(k) === "description");

      const value = valueKey ? String(row.values[valueKey] || "").trim() : "";
      const description = descKey ? String(row.values[descKey] || "").trim() : "";

      if (!value) {
        invalidRows.push({ rowNumber: row.rowNumber, value, description, error: "Missing value" });
        continue;
      }

      const norm = normalizeKey(value);
      if (existingSet.has(norm)) {
        invalidRows.push({ rowNumber: row.rowNumber, value, description, error: "Duplicate value in system" });
        continue;
      }

      // Temporarily mark as existing so we don't have dupes in the sheet itself
      existingSet.add(norm);
      validRows.push({ rowNumber: row.rowNumber, value, description });
    }

    return {
      fileName: file.name,
      validRows,
      invalidRows,
    };
  },

  async confirm(validRows: { value: string; description: string }[], category: MasterValueCategory, user: { id: string }) {
    if (!validRows.length) return { insertedCount: 0 };
    
    const db = getDb();
    await db.transaction(async (tx) => {
      // Fetch latest existing just in case
      const existing = await tx
        .select({ normalizedValue: masterValues.normalizedValue })
        .from(masterValues)
        .where(eq(masterValues.category, category));
      
      const existingSet = new Set(existing.map((e) => e.normalizedValue));

      const toInsert = validRows.filter((r) => !existingSet.has(normalizeKey(r.value))).map((r) => ({
        category,
        value: r.value,
        normalizedValue: normalizeKey(r.value),
        description: r.description || null,
        createdBy: user.id,
        updatedBy: user.id,
      }));

      if (toInsert.length > 0) {
        await tx.insert(masterValues).values(toInsert);
      }
    });

    return { insertedCount: validRows.length };
  }
};
