import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "previewed",
  "confirmed",
  "cancelled",
  "failed",
]);

export const importRowStatusEnum = pgEnum("import_row_status", [
  "valid",
  "warning",
  "invalid",
  "imported",
  "rejected",
]);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull().default("master_sheet"),
    fileName: text("file_name").notNull(),
    status: importBatchStatusEnum("status").notNull().default("previewed"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("import_batches_status_idx").on(table.status),
    createdByIdx: index("import_batches_created_by_idx").on(table.createdBy),
  }),
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    status: importRowStatusEnum("status").notNull().default("valid"),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull(),
    normalizedData: jsonb("normalized_data").$type<Record<string, unknown>>().notNull(),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    matchedProjectId: uuid("matched_project_id"),
    matchedSiteId: uuid("matched_site_id"),
    importedCustomerId: uuid("imported_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index("import_rows_batch_idx").on(table.batchId),
    statusIdx: index("import_rows_status_idx").on(table.status),
    rowNumberIdx: index("import_rows_row_number_idx").on(table.rowNumber),
  }),
);

