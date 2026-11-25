import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export const plumberTypeEnum = pgEnum("plumber_type", ["individual", "team"]);
/** Plumbers are picked on customers; labour only for payments, wages and material. */
export const plumberCategoryEnum = pgEnum("plumber_category", ["plumber", "labour"]);
export const plumberStatusEnum = pgEnum("plumber_status", ["active", "inactive"]);

export const plumbers = pgTable(
  "plumbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: plumberCategoryEnum("category").notNull().default("plumber"),
    type: plumberTypeEnum("type").notNull().default("individual"),
    contactNumber: text("contact_number"),
    /** Profile photo URL (set by admins from the admin panel). */
    avatarUrl: text("avatar_url"),
    status: plumberStatusEnum("status").notNull().default("active"),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedNameIdx: uniqueIndex("plumbers_category_normalized_name_idx").on(table.category, table.normalizedName),
    statusIdx: index("plumbers_status_idx").on(table.status),
  }),
);

export const plumbersRelations = relations(plumbers, () => ({}));
