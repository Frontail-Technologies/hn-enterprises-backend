import { eq } from "drizzle-orm";
import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { materials } from "@db/schema";

export type MaterialImportRowData = {
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
};

type MaterialImportRow = MaterialImportRowData & { rowNumber: number };

type MaterialImportInvalidRow = MaterialImportRow & { error: string };

function findColumn(row: Record<string, unknown>, key: string): unknown {
  const found = Object.keys(row).find((k) => normalizeKey(k) === key);
  return found ? row[found] : undefined;
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(findColumn(row, key) ?? "").trim();
}

function assertAdmin(role: string) {
  if (!["super_admin", "admin"].includes(role)) {
    throw new Error("Only admin users can import materials");
  }
}

// The single authoritative rule set, reused by the bulk preview loop and the
// standalone validate-row endpoint (re-run after an in-place edit) - a
// single edit never needs the whole file reprocessed. In-file duplicates are
// only caught during the initial bulk preview (the only place every row is
// available at once) - a later single-row revalidation checks against
// existing system records, the authoritative source either way.
export function validateMaterialRow(data: MaterialImportRowData, existingNames: Set<string>): { error?: string } {
  if (!data.name) return { error: "Missing name" };
  if (!data.unit) return { error: "Missing unit" };
  if (existingNames.has(normalizeKey(data.name))) return { error: "Duplicate material name in system" };
  return {};
}

async function loadExistingNames() {
  const db = getDb();
  const existing = await db.select({ normalizedName: materials.normalizedName }).from(materials);
  return new Set(existing.map((e) => e.normalizedName));
}

export const materialsImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);

    const validRows: MaterialImportRow[] = [];
    const invalidRows: MaterialImportInvalidRow[] = [];
    const existingSet = await loadExistingNames();

    for (const row of rawRows) {
      const name = cell(row.values, "name");
      const category = cell(row.values, "category");
      const unit = cell(row.values, "unit");
      const reorderLevelRaw = cell(row.values, "reorder level");
      const reorderLevel = Number(reorderLevelRaw) || 0;

      const base = { rowNumber: row.rowNumber, name, category, unit, reorderLevel };
      const { error } = validateMaterialRow(base, existingSet);
      if (error) {
        invalidRows.push({ ...base, error });
        continue;
      }

      existingSet.add(normalizeKey(name));
      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async validateRow(data: MaterialImportRowData, user: { role: string }) {
    assertAdmin(user.role);
    const existingSet = await loadExistingNames();
    return validateMaterialRow(data, existingSet);
  },

  // Per-row isolated - each row is a single independent insert (no cross-row
  // dependency), so a failing row is simply reported and skipped instead of
  // discarding the rows around it.
  async confirm(validRows: MaterialImportRow[], user: { id: string }) {
    const db = getDb();
    let insertedCount = 0;
    const failed: { tempId: string; message: string }[] = [];

    for (const row of validRows) {
      const tempId = String(row.rowNumber);
      try {
        const norm = normalizeKey(row.name);
        const [existing] = await db
          .select({ id: materials.id })
          .from(materials)
          .where(eq(materials.normalizedName, norm))
          .limit(1);

        if (existing) {
          failed.push({ tempId, message: "Duplicate material name in system" });
          continue;
        }

        await db.insert(materials).values({
          name: row.name,
          normalizedName: norm,
          category: row.category || null,
          unit: row.unit,
          reorderLevel: String(row.reorderLevel ?? 0),
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
