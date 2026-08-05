import { and, count, eq, ilike } from "drizzle-orm";
import { getDb } from "@db";
import { plumbers } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
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

  async remove(id: string) {
    await getPlumberOrThrow(id);
    const db = getDb();
    try {
      await db.delete(plumbers).where(eq(plumbers.id, id));
    } catch (error: any) {
      if (error.code === "23503") {
        throw new Error("Cannot delete this plumber because they have associated records. Please reassign or delete them first.");
      }
      throw error;
    }
  },
};
