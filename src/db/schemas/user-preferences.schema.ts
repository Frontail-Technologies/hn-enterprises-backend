import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export type ColumnPreferenceEntry = { key: string; visible: boolean };

/**
 * Generic per-user, per-table saved column configuration (order + visibility).
 * `tableKey` scopes this to one configurable grid (currently only "customers") -
 * kept generic rather than a customers-specific table so a future grid can reuse
 * the same mechanism without a new migration. The array's order IS the column
 * order; a key omitted from a saved row (e.g. a newly-added catalog field or a
 * new custom field) is appended after the saved ones by the resolver, not lost.
 */
export const userColumnPreferences = pgTable(
  "user_column_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tableKey: text("table_key").notNull(),
    columns: jsonb("columns").$type<ColumnPreferenceEntry[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTableIdx: uniqueIndex("user_column_preferences_user_table_idx").on(table.userId, table.tableKey),
  }),
);

export const userColumnPreferencesRelations = relations(userColumnPreferences, ({ one }) => ({
  user: one(users, { fields: [userColumnPreferences.userId], references: [users.id] }),
}));
