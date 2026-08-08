import { and, count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { wageRecords } from "@db/schema";
import { buildPaginationMeta, cleanObject, parsePagination } from "@utils";
import type { UpsertWageBody, WageListQuery } from "./wages.types";

function withComputed<T extends { wageRate: string; daysWorked: string; pf: string; esic: string }>(record: T) {
  const wageRate = Number(record.wageRate);
  const daysWorked = Number(record.daysWorked);
  const pf = Number(record.pf);
  const esic = Number(record.esic);
  const basic = Math.round(wageRate * daysWorked);
  const total = basic;
  const totalDeduction = pf + esic;
  const netPayment = total - totalDeduction;

  return { ...record, basic, total, totalDeduction, netPayment };
}

async function findRecord(plumberId: string, month: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(wageRecords)
    .where(and(eq(wageRecords.plumberId, plumberId), eq(wageRecords.month, month)))
    .limit(1);

  return record ?? null;
}

export const wagesService = {
  async list(query: WageListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = [
      query.month ? eq(wageRecords.month, query.month) : undefined,
      query.plumberId ? eq(wageRecords.plumberId, query.plumberId) : undefined,
      query.status ? eq(wageRecords.status, query.status) : undefined,
      query.category ? eq(wageRecords.category, query.category) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(wageRecords).where(where).limit(limit).offset(offset).orderBy(wageRecords.month),
      db.select({ value: count() }).from(wageRecords).where(where),
    ]);

    return { rows: rows.map(withComputed), pagination: buildPaginationMeta(page, limit, total) };
  },

  async upsert(input: UpsertWageBody, userId: string) {
    const db = getDb();
    const existing = await findRecord(input.plumberId, input.month);

    if (existing) {
      const [record] = await db
        .update(wageRecords)
        .set(
          cleanObject({
            category: input.category,
            wageRate: input.wageRate != null ? String(input.wageRate) : undefined,
            daysWorked: input.daysWorked != null ? String(input.daysWorked) : undefined,
            pf: input.pf != null ? String(input.pf) : undefined,
            esic: input.esic != null ? String(input.esic) : undefined,
            status: input.status,
            remarks: input.remarks,
            updatedBy: userId,
            updatedAt: new Date(),
          }),
        )
        .where(eq(wageRecords.id, existing.id))
        .returning();

      if (!record) throw new Error("Unable to save wage record");
      return withComputed(record);
    }

    const [record] = await db
      .insert(wageRecords)
      .values({
        plumberId: input.plumberId,
        month: input.month,
        category: input.category,
        wageRate: String(input.wageRate),
        daysWorked: String(input.daysWorked),
        pf: String(input.pf ?? 0),
        esic: String(input.esic ?? 0),
        status: input.status ?? "pending",
        remarks: input.remarks || null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!record) throw new Error("Unable to save wage record");
    return withComputed(record);
  },

  async delete(id: string) {
    const db = getDb();
    const [deleted] = await db.delete(wageRecords).where(eq(wageRecords.id, id)).returning();
    if (!deleted) throw new Error("Wage record not found");
  },
};
