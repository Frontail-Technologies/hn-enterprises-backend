import { and, eq } from "drizzle-orm";
import { getDb } from "@db";
import { customFieldDefinitions, userColumnPreferences } from "@db/schema";
import type { ColumnPreferenceEntry } from "@db/schema";
import { CUSTOMER_COLUMN_CATALOG, type CustomerColumnType } from "./customer-columns.catalog";

const TABLE_KEY = "customers";

const CUSTOM_FIELD_TYPE_TO_COLUMN_TYPE: Record<string, CustomerColumnType> = {
  text: "text",
  number: "num",
  date: "date",
  amount: "money",
  yes_no: "bool",
  dropdown: "text",
};

export type ResolvedCustomerColumn = {
  key: string;
  label: string;
  group: string;
  type: CustomerColumnType;
  width: number;
  visible: boolean;
  /** True for a live custom field (from custom_field_definitions), false for a static catalog field. */
  custom: boolean;
};

async function fullCatalog(): Promise<Array<ResolvedCustomerColumn & { defaultVisible: boolean }>> {
  const db = getDb();
  const customFields = await db
    .select({
      key: customFieldDefinitions.key,
      label: customFieldDefinitions.label,
      groupName: customFieldDefinitions.groupName,
      width: customFieldDefinitions.width,
      valueType: customFieldDefinitions.valueType,
    })
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.status, "active"));

  const staticEntries = CUSTOMER_COLUMN_CATALOG.map((entry) => ({
    key: entry.key,
    label: entry.label,
    group: entry.group,
    type: entry.type,
    width: entry.width,
    visible: entry.defaultVisible ?? true,
    defaultVisible: entry.defaultVisible ?? true,
    custom: false,
  }));

  const customEntries = customFields.map((field) => ({
    key: field.key,
    label: field.label,
    group: field.groupName,
    type: CUSTOM_FIELD_TYPE_TO_COLUMN_TYPE[field.valueType] ?? "text",
    width: field.width,
    visible: true,
    defaultVisible: true,
    custom: true,
  }));

  return [...staticEntries, ...customEntries];
}

/**
 * Merges the catalog (static + live active custom fields) with a user's saved
 * order/visibility. Saved order wins for keys it lists; any catalog key the
 * saved row doesn't mention (a field added after the user last saved, or a
 * newly-created custom field) is appended in catalog order, visible per its
 * own default - never dropped, never silently hidden by omission.
 */
export async function resolveCustomerColumns(userId: string | null): Promise<ResolvedCustomerColumn[]> {
  const catalog = await fullCatalog();
  if (!userId) return catalog.map(({ defaultVisible: _defaultVisible, ...entry }) => entry);

  const db = getDb();
  const [saved] = await db
    .select({ columns: userColumnPreferences.columns })
    .from(userColumnPreferences)
    .where(and(eq(userColumnPreferences.userId, userId), eq(userColumnPreferences.tableKey, TABLE_KEY)))
    .limit(1);

  if (!saved) return catalog.map(({ defaultVisible: _defaultVisible, ...entry }) => entry);

  const catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));
  const seen = new Set<string>();
  const ordered: ResolvedCustomerColumn[] = [];

  for (const saveEntry of saved.columns) {
    const catalogEntry = catalogByKey.get(saveEntry.key);
    if (!catalogEntry || seen.has(saveEntry.key)) continue;
    seen.add(saveEntry.key);
    ordered.push({
      key: catalogEntry.key,
      label: catalogEntry.label,
      group: catalogEntry.group,
      type: catalogEntry.type,
      width: catalogEntry.width,
      visible: saveEntry.visible,
      custom: catalogEntry.custom,
    });
  }

  for (const entry of catalog) {
    if (seen.has(entry.key)) continue;
    ordered.push({
      key: entry.key,
      label: entry.label,
      group: entry.group,
      type: entry.type,
      width: entry.width,
      visible: entry.defaultVisible,
      custom: entry.custom,
    });
  }

  return ordered;
}

export async function saveCustomerColumnPreferences(userId: string, columns: ColumnPreferenceEntry[]): Promise<void> {
  const db = getDb();
  const catalog = await fullCatalog();
  const validKeys = new Set(catalog.map((entry) => entry.key));
  // Never persist a key that isn't (or no longer is) a real column - a stale
  // saved preference must not resurrect a deleted custom field or typo'd key.
  const cleaned = columns.filter((entry) => validKeys.has(entry.key));

  const [existing] = await db
    .select({ id: userColumnPreferences.id })
    .from(userColumnPreferences)
    .where(and(eq(userColumnPreferences.userId, userId), eq(userColumnPreferences.tableKey, TABLE_KEY)))
    .limit(1);

  if (existing) {
    await db
      .update(userColumnPreferences)
      .set({ columns: cleaned, updatedAt: new Date() })
      .where(eq(userColumnPreferences.id, existing.id));
    return;
  }

  await db.insert(userColumnPreferences).values({ userId, tableKey: TABLE_KEY, columns: cleaned });
}

export async function resetCustomerColumnPreferences(userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(userColumnPreferences)
    .where(and(eq(userColumnPreferences.userId, userId), eq(userColumnPreferences.tableKey, TABLE_KEY)));
}
