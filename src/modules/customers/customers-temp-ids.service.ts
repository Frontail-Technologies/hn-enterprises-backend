import { inArray, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";

/** Imports give customers without a BR/TR number an ID like TEMP-7F3A2C-0012. */
export const TEMP_ID_NORMALIZED_PREFIX = "temp-";

export type TempIdReplacementInput = { tempId: string; trBpNumber: string };

export type TempIdReplacementResult = {
  tempId: string;
  trBpNumber: string;
  customerId: string | null;
  customerName: string | null;
  status: "ready" | "updated" | "not_found" | "not_temp" | "missing" | "duplicate_in_file" | "number_in_use";
  message: string;
};

/**
 * Replace temporary IDs with real BR/TR numbers in bulk. With apply=false it
 * only checks every row (nothing is saved); with apply=true the "ready" rows
 * are saved in one statement and the rest are reported unchanged.
 */
export async function replaceTempIds(rows: TempIdReplacementInput[], apply: boolean, userId: string) {
  const db = getDb();
  const cleaned = rows.map((row) => ({
    tempId: (row.tempId ?? "").trim(),
    trBpNumber: (row.trBpNumber ?? "").trim(),
    tempKey: normalizeKey(row.tempId),
    newKey: normalizeKey(row.trBpNumber),
  }));

  const tempKeys = Array.from(new Set(cleaned.map((row) => row.tempKey).filter(Boolean)));
  const newKeys = Array.from(new Set(cleaned.map((row) => row.newKey).filter(Boolean)));
  const [tempCustomers, takenNumbers] = await Promise.all([
    tempKeys.length
      ? db
          .select({ id: customers.id, name: customers.customerName, key: customers.normalizedTrBpNumber })
          .from(customers)
          .where(inArray(customers.normalizedTrBpNumber, tempKeys))
      : Promise.resolve([]),
    newKeys.length
      ? db
          .select({ key: customers.normalizedTrBpNumber })
          .from(customers)
          .where(inArray(customers.normalizedTrBpNumber, newKeys))
      : Promise.resolve([]),
  ]);
  const customerByTempKey = new Map(tempCustomers.map((row) => [row.key, row]));
  const taken = new Set(takenNumbers.map((row) => row.key));

  const tempSeen = new Map<string, number>();
  const newSeen = new Map<string, number>();
  for (const row of cleaned) {
    if (row.tempKey) tempSeen.set(row.tempKey, (tempSeen.get(row.tempKey) ?? 0) + 1);
    if (row.newKey) newSeen.set(row.newKey, (newSeen.get(row.newKey) ?? 0) + 1);
  }

  const results: TempIdReplacementResult[] = cleaned.map((row) => {
    const customer = customerByTempKey.get(row.tempKey);
    const base = { tempId: row.tempId, trBpNumber: row.trBpNumber, customerId: customer?.id ?? null, customerName: customer?.name ?? null };
    if (!row.tempKey || !row.newKey) return { ...base, status: "missing", message: "Both the temporary ID and the BR/TR number are needed" };
    if (!row.tempKey.startsWith(TEMP_ID_NORMALIZED_PREFIX)) return { ...base, status: "not_temp", message: `${row.tempId} is not a temporary ID` };
    if ((tempSeen.get(row.tempKey) ?? 0) > 1 || (newSeen.get(row.newKey) ?? 0) > 1) {
      return { ...base, status: "duplicate_in_file", message: "This temporary ID or BR/TR number appears more than once in the file" };
    }
    if (!customer) return { ...base, status: "not_found", message: `No customer has the temporary ID ${row.tempId}` };
    if (taken.has(row.newKey)) return { ...base, status: "number_in_use", message: `Another customer already has BR/TR ${row.trBpNumber}` };
    return { ...base, status: "ready", message: `${row.tempId} → ${row.trBpNumber}` };
  });

  const ready = results.filter((row) => row.status === "ready");
  if (apply && ready.length) {
    // One statement for all rows (each round trip to the database is slow).
    const values = sql.join(
      ready.map((row) => sql`(${row.customerId}::uuid, ${row.trBpNumber}, ${normalizeKey(row.trBpNumber)})`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE customers AS c
      SET tr_bp_number = v.tr, normalized_tr_bp_number = v.ntr, updated_by = ${userId}::uuid, updated_at = now()
      FROM (VALUES ${values}) AS v(id, tr, ntr)
      WHERE c.id = v.id
    `);
    for (const row of ready) {
      row.status = "updated";
      row.message = `${row.tempId} → ${row.trBpNumber}`;
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      ready: results.filter((row) => row.status === "ready").length,
      updated: results.filter((row) => row.status === "updated").length,
      problems: results.filter((row) => row.status !== "ready" && row.status !== "updated").length,
    },
  };
}
