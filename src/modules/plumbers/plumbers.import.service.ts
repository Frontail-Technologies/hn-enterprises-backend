import { eq } from "drizzle-orm";
import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { plumbers } from "@db/schema";

export type PlumberImportRowData = {
  name: string;
  type: string;
  contactNumber: string;
  remarks: string;
};

type PlumberImportRow = PlumberImportRowData & { rowNumber: number };

type PlumberImportInvalidRow = PlumberImportRow & { error: string };

function findColumn(row: Record<string, unknown>, key: string): unknown {
  const found = Object.keys(row).find((k) => normalizeKey(k) === key);
  return found ? row[found] : undefined;
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(findColumn(row, key) ?? "").trim();
}

function assertAdmin(role: string) {
  if (!["super_admin", "admin"].includes(role)) {
    throw new Error("Only admin users can import plumbers");
  }
}

// Shared by the bulk preview loop and the standalone validate-row endpoint.
// In-file duplicates are only caught during the initial bulk preview (the
// only place every row is available at once); a later single-row
// revalidation checks against existing system records.
export function validatePlumberRow(data: PlumberImportRowData, existingNames: Set<string>): { error?: string } {
  if (!data.name) return { error: "Missing name" };
  if (existingNames.has(normalizeKey(data.name))) return { error: "Duplicate plumber name in system" };
  return {};
}

async function loadExistingNames() {
  const db = getDb();
  const existing = await db.select({ normalizedName: plumbers.normalizedName }).from(plumbers);
  return new Set(existing.map((e) => e.normalizedName));
}

export const plumbersImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);

    const validRows: PlumberImportRow[] = [];
    const invalidRows: PlumberImportInvalidRow[] = [];
    const existingSet = await loadExistingNames();

    for (const row of rawRows) {
      const name = cell(row.values, "name");
      const typeRaw = cell(row.values, "type");
      const contactNumber = cell(row.values, "contact number") || cell(row.values, "contact");
      const remarks = cell(row.values, "remarks");
      const type = /^team$/i.test(typeRaw) ? "team" : "individual";

      const base = { rowNumber: row.rowNumber, name, type, contactNumber, remarks };
      const { error } = validatePlumberRow(base, existingSet);
      if (error) {
        invalidRows.push({ ...base, error });
        continue;
      }

      existingSet.add(normalizeKey(name));
      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async validateRow(data: PlumberImportRowData, user: { role: string }) {
    assertAdmin(user.role);
    const existingSet = await loadExistingNames();
    return validatePlumberRow(data, existingSet);
  },

  // Per-row isolated - each plumber row is an independent insert.
  async confirm(validRows: PlumberImportRow[], user: { id: string }) {
    const db = getDb();
    let insertedCount = 0;
    const failed: { tempId: string; message: string }[] = [];

    for (const row of validRows) {
      const tempId = String(row.rowNumber);
      try {
        const norm = normalizeKey(row.name);
        const [existing] = await db
          .select({ id: plumbers.id })
          .from(plumbers)
          .where(eq(plumbers.normalizedName, norm))
          .limit(1);

        if (existing) {
          failed.push({ tempId, message: "Duplicate plumber name in system" });
          continue;
        }

        await db.insert(plumbers).values({
          name: row.name,
          normalizedName: norm,
          type: row.type === "team" ? "team" : "individual",
          contactNumber: row.contactNumber || null,
          status: "active",
          remarks: row.remarks || null,
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
