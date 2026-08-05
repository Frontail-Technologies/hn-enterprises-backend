import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";
import { plumbers } from "./plumber.schema";
import { projectSites } from "./project.schema";
import { payments } from "./payment.schema";

export const materialTransactionTypeEnum = pgEnum("material_transaction_type", [
  "purchase",
  "pbg_issue",
  "pbg_consumption",
  "issue",
  "return",
  "adjustment",
  "consumption",
]);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),
    unit: text("unit").notNull(),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }).notNull().default("0"),
    currentBalance: numeric("current_balance", { precision: 14, scale: 3 }).notNull().default("0"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedNameIdx: uniqueIndex("materials_normalized_name_idx").on(table.normalizedName),
    categoryIdx: index("materials_category_idx").on(table.category),
  }),
);

export const materialTransactions = pgTable(
  "material_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    type: materialTransactionTypeEnum("type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
    referenceNo: text("reference_no"),
    vendorName: text("vendor_name"),
    rate: numeric("rate", { precision: 14, scale: 2 }),
    billAmount: numeric("bill_amount", { precision: 14, scale: 2 }),
    plumberId: uuid("plumber_id").references(() => plumbers.id, { onDelete: "set null" }),
    supervisorName: text("supervisor_name"),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    siteId: uuid("site_id").references(() => projectSites.id, { onDelete: "set null" }),
    storeLabel: text("store_label"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    reportNo: text("report_no"),
    condition: text("condition"),
    adjustmentType: text("adjustment_type"),
    vehicleNo: text("vehicle_no"),
    vehicleQty: numeric("vehicle_qty", { precision: 14, scale: 3 }),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>(),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    materialIdx: index("material_transactions_material_idx").on(table.materialId),
    typeIdx: index("material_transactions_type_idx").on(table.type),
    plumberIdx: index("material_transactions_plumber_idx").on(table.plumberId),
    supervisorIdx: index("material_transactions_supervisor_idx").on(table.supervisorId),
    siteIdx: index("material_transactions_site_idx").on(table.siteId),
    customerIdx: index("material_transactions_customer_idx").on(table.customerId),
    paymentIdx: index("material_transactions_payment_idx").on(table.paymentId),
    dateIdx: index("material_transactions_date_idx").on(table.transactionDate),
  }),
);

export const materialsRelations = relations(materials, ({ many }) => ({
  transactions: many(materialTransactions),
}));

export const materialTransactionsRelations = relations(materialTransactions, ({ one }) => ({
  material: one(materials, {
    fields: [materialTransactions.materialId],
    references: [materials.id],
  }),
  plumber: one(plumbers, {
    fields: [materialTransactions.plumberId],
    references: [plumbers.id],
  }),
  site: one(projectSites, {
    fields: [materialTransactions.siteId],
    references: [projectSites.id],
  }),
  customer: one(customers, {
    fields: [materialTransactions.customerId],
    references: [customers.id],
  }),
  payment: one(payments, {
    fields: [materialTransactions.paymentId],
    references: [payments.id],
  }),
}));
