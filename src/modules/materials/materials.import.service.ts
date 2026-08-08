import { eq } from "drizzle-orm";
import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { materials } from "@db/schema";

type MaterialImportRow = {
  rowNumber: number;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
};

type MaterialImportInvalidRow = MaterialImportRow & { error: string };

function findColumn(row: Record<string, unknown>, key: string): unknown {
  const found = Object.keys(row).find((k) => normalizeKey(k) === key);
  return found ? row[found] : undefined;
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(findColumn(row, key) ?? "").trim();
}

export const materialsImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new Error("Only admin users can import materials");
    }

    const rawRows = await readSheetRows(file);

    const validRows: MaterialImportRow[] = [];
    const invalidRows: MaterialImportInvalidRow[] = [];

    const db = getDb();
    const existing = await db.select({ normalizedName: materials.normalizedName }).from(materials);
    const existingSet = new Set(existing.map((e) => e.normalizedName));

    for (const row of rawRows) {
      const name = cell(row.values, "name");
      const category = cell(row.values, "category");
      const unit = cell(row.values, "unit");
      const reorderLevelRaw = cell(row.values, "reorder level");
      const reorderLevel = Number(reorderLevelRaw) || 0;

      const base = { rowNumber: row.rowNumber, name, category, unit, reorderLevel };

      if (!name) {
        invalidRows.push({ ...base, error: "Missing name" });
        continue;
      }
      if (!unit) {
        invalidRows.push({ ...base, error: "Missing unit" });
        continue;
      }

      const norm = normalizeKey(name);
      if (existingSet.has(norm)) {
        invalidRows.push({ ...base, error: "Duplicate material name in system" });
        continue;
      }

      existingSet.add(norm);
      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async confirm(validRows: Omit<MaterialImportRow, "rowNumber">[], user: { id: string }) {
    if (!validRows.length) return { insertedCount: 0 };

    const db = getDb();
    let insertedCount = 0;

    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const norm = normalizeKey(row.name);
        const [existing] = await tx
          .select({ id: materials.id })
          .from(materials)
          .where(eq(materials.normalizedName, norm))
          .limit(1);
        if (existing) continue;

        await tx.insert(materials).values({
          name: row.name,
          normalizedName: norm,
          category: row.category || null,
          unit: row.unit,
          reorderLevel: String(row.reorderLevel ?? 0),
          createdBy: user.id,
          updatedBy: user.id,
        });
        insertedCount += 1;
      }
    });

    return { insertedCount };
  },
};
