import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export const plumberTypeEnum = pgEnum("plumber_type", ["individual", "team"]);
export const plumberStatusEnum = pgEnum("plumber_status", ["active", "inactive"]);

export const plumbers = pgTable(
  "plumbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    type: plumberTypeEnum("type").notNull().default("individual"),
    contactNumber: text("contact_number"),
    status: plumberStatusEnum("status").notNull().default("active"),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedNameIdx: uniqueIndex("plumbers_normalized_name_idx").on(table.normalizedName),
    statusIdx: index("plumbers_status_idx").on(table.status),
  }),
);

export const plumbersRelations = relations(plumbers, () => ({}));
