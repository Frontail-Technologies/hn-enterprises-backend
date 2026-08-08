import { eq } from "drizzle-orm";
import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { plumbers } from "@db/schema";

type PlumberImportRow = {
  rowNumber: number;
  name: string;
  type: string;
  contactNumber: string;
  remarks: string;
};

type PlumberImportInvalidRow = PlumberImportRow & { error: string };

function findColumn(row: Record<string, unknown>, key: string): unknown {
  const found = Object.keys(row).find((k) => normalizeKey(k) === key);
  return found ? row[found] : undefined;
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(findColumn(row, key) ?? "").trim();
}

export const plumbersImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new Error("Only admin users can import plumbers");
    }

    const rawRows = await readSheetRows(file);

    const validRows: PlumberImportRow[] = [];
    const invalidRows: PlumberImportInvalidRow[] = [];

    const db = getDb();
    const existing = await db.select({ normalizedName: plumbers.normalizedName }).from(plumbers);
    const existingSet = new Set(existing.map((e) => e.normalizedName));

    for (const row of rawRows) {
      const name = cell(row.values, "name");
      const typeRaw = cell(row.values, "type");
      const contactNumber = cell(row.values, "contact number") || cell(row.values, "contact");
      const remarks = cell(row.values, "remarks");
      const type = /^team$/i.test(typeRaw) ? "team" : "individual";

      const base = { rowNumber: row.rowNumber, name, type, contactNumber, remarks };

      if (!name) {
        invalidRows.push({ ...base, error: "Missing name" });
        continue;
      }

      const norm = normalizeKey(name);
      if (existingSet.has(norm)) {
        invalidRows.push({ ...base, error: "Duplicate plumber name in system" });
        continue;
      }

      existingSet.add(norm);
      validRows.push(base);
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async confirm(validRows: Omit<PlumberImportRow, "rowNumber">[], user: { id: string }) {
    if (!validRows.length) return { insertedCount: 0 };

    const db = getDb();
    let insertedCount = 0;

    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const norm = normalizeKey(row.name);
        const [existing] = await tx
          .select({ id: plumbers.id })
          .from(plumbers)
          .where(eq(plumbers.normalizedName, norm))
          .limit(1);
        if (existing) continue;

        await tx.insert(plumbers).values({
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
      }
    });

    return { insertedCount };
  },
};
