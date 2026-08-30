import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export type ColumnPreferenceEntry = { key: string; visible: boolean };

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
