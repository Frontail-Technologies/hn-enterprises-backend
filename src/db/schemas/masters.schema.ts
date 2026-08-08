import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export const masterValueCategoryEnum = pgEnum("master_value_category", [
  "payment_types",
  "connection_types",
  "house_types",
  "schemes",
  "document_categories",
  "material_categories",
  "meter_types",
]);

export const masterValueStatusEnum = pgEnum("master_value_status", ["active", "inactive"]);

export const masterValues = pgTable(
  "master_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: masterValueCategoryEnum("category").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    description: text("description"),
    status: masterValueStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryValueIdx: uniqueIndex("master_values_category_value_idx").on(table.category, table.normalizedValue),
    categoryIdx: index("master_values_category_idx").on(table.category),
  }),
);

export const customFieldValueTypeEnum = pgEnum("custom_field_value_type", [
  "text",
  "number",
  "date",
  "amount",
  "yes_no",
  "dropdown",
]);

export const customFieldStatusEnum = pgEnum("custom_field_status", ["active", "inactive"]);
export const customFieldAccessEnum = pgEnum("custom_field_access", ["admin_only", "supervisor_view", "supervisor_edit"]);

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    groupName: text("group_name").notNull(),
    width: integer("width").notNull().default(150),
    valueType: customFieldValueTypeEnum("value_type").notNull().default("text"),
    dropdownOptions: jsonb("dropdown_options").$type<string[]>(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    supervisorAccess: customFieldAccessEnum("supervisor_access").notNull().default("admin_only"),
    status: customFieldStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("custom_field_definitions_key_idx").on(table.key),
  }),
);

export const holidayTypeEnum = pgEnum("holiday_type", ["national", "restricted", "company"]);
export const holidayStatusEnum = pgEnum("holiday_status", ["active", "inactive"]);

export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: holidayTypeEnum("type").notNull().default("national"),
    status: holidayStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateIdx: index("holidays_date_idx").on(table.date),
  }),
);
