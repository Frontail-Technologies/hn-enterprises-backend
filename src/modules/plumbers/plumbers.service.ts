import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { plumbers } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, isForeignKeyViolation, parsePagination, toEntityInUseError, toSearchPattern } from "@utils";
import { assertPlumbersDeletable, plumbersDeletionService } from "./plumbers-deletion.service";
import type { CreatePlumberBody, PlumberListQuery, UpdatePlumberBody } from "./plumbers.types";

async function getPlumberOrThrow(id: string) {
  const db = getDb();
  const [plumber] = await db.select().from(plumbers).where(eq(plumbers.id, id)).limit(1);
  if (!plumber) throw new Error("Plumber not found");
  return plumber;
}

export const plumbersService = {
  async list(query: PlumberListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.type ? eq(plumbers.type, query.type) : undefined,
      query.status ? eq(plumbers.status, query.status) : undefined,
      searchPattern ? ilike(plumbers.name, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(plumbers).where(where).limit(limit).offset(offset).orderBy(plumbers.name),
      db.select({ value: count() }).from(plumbers).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getPlumberOrThrow(id);
  },

  async create(input: CreatePlumberBody, userId: string) {
    const db = getDb();
    const [plumber] = await db
      .insert(plumbers)
      .values({
        name: input.name,
        normalizedName: normalizeKey(input.name),
        type: input.type ?? "individual",
        contactNumber: input.contactNumber || null,
        status: input.status ?? "active",
        remarks: input.remarks || null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!plumber) throw new Error("Unable to create plumber");
    return plumber;
  },

  async update(id: string, input: UpdatePlumberBody, userId: string) {
    await getPlumberOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      name: input.name,
      type: input.type,
      contactNumber: input.contactNumber,
      status: input.status,
      remarks: input.remarks,
    });

    const [plumber] = await db
      .update(plumbers)
      .set({
        ...patch,
        ...(input.name ? { normalizedName: normalizeKey(input.name) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(plumbers.id, id))
      .returning();

    if (!plumber) throw new Error("Unable to update plumber");
    return plumber;
  },

  // Delegates to the Delete Impact architecture (plumbers-deletion.service.ts):
  // blocks on wage/payroll history, detaches customer/ledger/payment assignments.
  async remove(id: string, userId: string) {
    return plumbersDeletionService.execute(id, userId);
  },

  async bulkRemove(ids: string[]) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const existing = await db.select({ id: plumbers.id }).from(plumbers).where(inArray(plumbers.id, uniqueIds));
    if (!existing.length) return { count: 0 };

    const resolvedIds = existing.map((row) => row.id);
    try {
      await db.transaction(async (tx) => {
        await assertPlumbersDeletable(tx, resolvedIds);
        await tx.delete(plumbers).where(inArray(plumbers.id, resolvedIds));
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw toEntityInUseError(
          error,
          "Some selected plumbers have associated records (e.g. wage records) and cannot be deleted. Please reassign or delete them first.",
        );
      }
      throw error;
    }

    return { count: resolvedIds.length };
  },
};
