import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

/**
 * Recycle bin: a full snapshot of a deleted record and everything that was
 * deleted or detached with it, kept for 30 days so it can be restored.
 * `data` holds the rows as Postgres JSON (to_jsonb), so restore can put them
 * back with jsonb_populate_record without any per-column mapping.
 */
export const deletedRecords = pgTable(
  "deleted_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    label: text("label").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    deletedAtIdx: index("deleted_records_deleted_at_idx").on(table.deletedAt),
    entityIdx: index("deleted_records_entity_idx").on(table.entityType, table.entityId),
  }),
);
