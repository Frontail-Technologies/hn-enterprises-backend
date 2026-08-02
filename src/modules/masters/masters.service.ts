import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@db";
import { customFieldDefinitions, holidays, masterValues } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { cleanObject, toSearchPattern } from "@utils";
import type {
  CreateCustomFieldBody,
  CreateHolidayBody,
  CreateMasterValueBody,
  CustomFieldListQuery,
  HolidayListQuery,
  MasterValueListQuery,
  UpdateCustomFieldBody,
  UpdateHolidayBody,
  UpdateMasterValueBody,
} from "./masters.types";

async function getMasterValueOrThrow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(masterValues).where(eq(masterValues.id, id)).limit(1);
  if (!row) throw new Error("Master value not found");
  return row;
}

export const masterValuesService = {
  async list(query: MasterValueListQuery) {
    const db = getDb();
    const searchPattern = toSearchPattern(query.search);
    const conditions = [
      query.category ? eq(masterValues.category, query.category) : undefined,
      query.status ? eq(masterValues.status, query.status) : undefined,
      searchPattern
        ? or(ilike(masterValues.value, searchPattern), ilike(masterValues.description, searchPattern))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(masterValues).where(where).orderBy(masterValues.value);
  },

  async create(input: CreateMasterValueBody, userId: string) {
    const db = getDb();
    const [row] = await db
      .insert(masterValues)
      .values({
        category: input.category,
        value: input.value,
        normalizedValue: normalizeKey(input.value),
        description: input.description || null,
        status: input.status ?? "active",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!row) throw new Error("Unable to create master value");
    return row;
  },

  async update(id: string, input: UpdateMasterValueBody, userId: string) {
    await getMasterValueOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      value: input.value,
      description: input.description,
      status: input.status,
    });

    const [row] = await db
      .update(masterValues)
      .set({
        ...patch,
        ...(input.value ? { normalizedValue: normalizeKey(input.value) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(masterValues.id, id))
      .returning();

    if (!row) throw new Error("Unable to update master value");
    return row;
  },
};

async function getCustomFieldOrThrow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.id, id)).limit(1);
  if (!row) throw new Error("Custom field not found");
  return row;
}

export const customFieldDefinitionsService = {
  async list(query: CustomFieldListQuery) {
    const db = getDb();
    const where = query.status ? eq(customFieldDefinitions.status, query.status) : undefined;
    return db.select().from(customFieldDefinitions).where(where).orderBy(customFieldDefinitions.label);
  },

  async create(input: CreateCustomFieldBody, userId: string) {
    const db = getDb();
    // Not run through normalizeKey: this is a programmatic identifier used to
    // read/write a specific customers.customFields JSONB property, not
    // freeform text - normalizing it would make it unable to match keys
    // already written under the original casing.
    const key = input.key.trim();

    const [existing] = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.key, key))
      .limit(1);
    if (existing) throw new Error("A custom field with this key already exists");

    const [row] = await db
      .insert(customFieldDefinitions)
      .values({
        key,
        label: input.label,
        groupName: input.groupName,
        width: input.width ?? 150,
        valueType: input.valueType ?? "text",
        dropdownOptions: input.valueType === "dropdown" ? input.dropdownOptions ?? [] : null,
        required: input.required ?? false,
        status: input.status ?? "active",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!row) throw new Error("Unable to create custom field");
    return row;
  },

  async update(id: string, input: UpdateCustomFieldBody, userId: string) {
    await getCustomFieldOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      label: input.label,
      groupName: input.groupName,
      width: input.width,
      valueType: input.valueType,
      required: input.required,
      status: input.status,
    });

    const [row] = await db
      .update(customFieldDefinitions)
      .set({
        ...patch,
        ...(input.dropdownOptions ? { dropdownOptions: input.dropdownOptions } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(customFieldDefinitions.id, id))
      .returning();

    if (!row) throw new Error("Unable to update custom field");
    return row;
  },
};

async function getHolidayOrThrow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
  if (!row) throw new Error("Holiday not found");
  return row;
}

export const holidaysService = {
  async list(query: HolidayListQuery) {
    const db = getDb();
    const searchPattern = toSearchPattern(query.search);
    const conditions = [
      query.status ? eq(holidays.status, query.status) : undefined,
      searchPattern ? ilike(holidays.name, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(holidays).where(where).orderBy(holidays.date);
  },

  async create(input: CreateHolidayBody, userId: string) {
    const db = getDb();
    const [row] = await db
      .insert(holidays)
      .values({
        name: input.name,
        date: new Date(input.date),
        type: input.type ?? "national",
        status: input.status ?? "active",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!row) throw new Error("Unable to create holiday");
    return row;
  },

  async update(id: string, input: UpdateHolidayBody, userId: string) {
    await getHolidayOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      name: input.name,
      date: input.date ? new Date(input.date) : undefined,
      type: input.type,
      status: input.status,
    });

    const [row] = await db
      .update(holidays)
      .set({ ...patch, updatedBy: userId, updatedAt: new Date() })
      .where(eq(holidays.id, id))
      .returning();

    if (!row) throw new Error("Unable to update holiday");
    return row;
  },
};
