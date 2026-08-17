import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@db";
import { customFieldDefinitions, holidays, masterValues } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { cleanObject, EntityInUseError, toSearchPattern } from "@utils";
import { masterValuesDeletionService } from "./master-values-deletion.service";
import type {
  CreateCustomFieldBody,
  CreateHolidayBody,
  CreateMasterValueBody,
  CustomFieldListQuery,
  HolidayListQuery,
  MasterValueListQuery,
  ReorderCustomFieldsBody,
  UpdateCustomFieldBody,
  UpdateHolidayBody,
  UpdateMasterValueBody,
} from "./masters.types";

// Deterministic label -> camelCase key derivation, shared by single-create and
// bulk import so the two paths can't drift into generating different keys for
// the same label. Callers are responsible for resolving uniqueness (a DB
// lookup for one-off creates, an in-memory set for a batch import).
export function buildCustomFieldKey(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
}

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

  // Delegates to the Delete Impact architecture (master-values-deletion.service.ts):
  // blocks whenever any business record still uses this value (matched by string
  // equality against the one column that category actually feeds - see that file).
  async delete(id: string) {
    return masterValuesDeletionService.execute(id);
  },

  /** Same in-use policy as the single-delete flow, rechecked per value inside the
   * transaction (§11) - one in-use value fails the whole batch. */
  async bulkDelete(ids: string[]) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const existing = await db.select({ id: masterValues.id, value: masterValues.value }).from(masterValues).where(inArray(masterValues.id, uniqueIds));
    if (!existing.length) return { count: 0 };

    const resolvedIds = existing.map((row) => row.id);
    await db.transaction(async (tx) => {
      for (const id of resolvedIds) {
        const impact = await masterValuesDeletionService.getDeleteImpact(id);
        if (!impact.canDelete) {
          throw new EntityInUseError(
            `Some selected values cannot be deleted: "${impact.entity.label}" ${impact.blockers.map((b) => b.reason).join(" ")} Deactivate them instead.`,
          );
        }
      }
      await tx.delete(masterValues).where(inArray(masterValues.id, resolvedIds));
    });

    return { count: resolvedIds.length };
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
    return db.select().from(customFieldDefinitions).where(where)
      .orderBy(customFieldDefinitions.groupName, customFieldDefinitions.sortOrder, customFieldDefinitions.label);
  },

  async getGroups() {
    const db = getDb();
    const rows = await db
      .selectDistinct({ groupName: customFieldDefinitions.groupName })
      .from(customFieldDefinitions)
      .orderBy(customFieldDefinitions.groupName);
    return rows.map((r) => r.groupName);
  },

  async create(input: CreateCustomFieldBody, userId: string) {
    const db = getDb();
    const key = buildCustomFieldKey(input.label);

    // Make key unique if collision
    const [existing] = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.key, key))
      .limit(1);
    const finalKey = existing ? `${key}_${Date.now()}` : key;

    const [row] = await db
      .insert(customFieldDefinitions)
      .values({
        key: finalKey,
        label: input.label,
        groupName: input.groupName,
        width: input.width ?? 150,
        valueType: input.valueType ?? "text",
        dropdownOptions: input.valueType === "dropdown" ? input.dropdownOptions ?? [] : null,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
        supervisorAccess: input.supervisorAccess ?? "admin_only",
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
      sortOrder: input.sortOrder,
      valueType: input.valueType,
      required: input.required,
      supervisorAccess: input.supervisorAccess,
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

  async delete(id: string) {
    const db = getDb();
    await getCustomFieldOrThrow(id);
    await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
  },

  // Same safety gate as the single-field delete flow (see DynamicFieldGrid on
  // the frontend): only fields already deactivated may be permanently
  // deleted. Active fields in the selection are silently skipped rather than
  // failing the whole batch, and the count reflects that.
  async bulkDelete(ids: string[]) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const rows = await db
      .select({ id: customFieldDefinitions.id, status: customFieldDefinitions.status })
      .from(customFieldDefinitions)
      .where(inArray(customFieldDefinitions.id, uniqueIds));
    if (!rows.length) return { count: 0, skippedActive: 0 };

    const deletableIds = rows.filter((row) => row.status === "inactive").map((row) => row.id);
    const skippedActive = rows.length - deletableIds.length;
    if (!deletableIds.length) return { count: 0, skippedActive };

    await db.delete(customFieldDefinitions).where(inArray(customFieldDefinitions.id, deletableIds));
    return { count: deletableIds.length, skippedActive };
  },

  // Bulk position/group update from drag-and-drop reordering - one transaction
  // so a partial failure can't leave the list in a half-reordered state.
  async reorder(items: ReorderCustomFieldsBody, userId: string) {
    if (!items.length) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(customFieldDefinitions)
          .set({ groupName: item.groupName, sortOrder: item.sortOrder, updatedBy: userId, updatedAt: new Date() })
          .where(eq(customFieldDefinitions.id, item.id));
      }
    });
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

  async delete(id: string) {
    const db = getDb();
    await getHolidayOrThrow(id);
    await db.delete(holidays).where(eq(holidays.id, id));
  },

  async bulkDelete(ids: string[]) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const existing = await db.select({ id: holidays.id }).from(holidays).where(inArray(holidays.id, uniqueIds));
    if (!existing.length) return { count: 0 };

    const resolvedIds = existing.map((row) => row.id);
    await db.delete(holidays).where(inArray(holidays.id, resolvedIds));
    return { count: resolvedIds.length };
  },
};
