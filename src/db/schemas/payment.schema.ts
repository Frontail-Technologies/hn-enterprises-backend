import { relations } from "drizzle-orm";
import { index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";
import { plumbers } from "./plumber.schema";
import { projects, projectSites } from "./project.schema";
import { materialTransactions } from "./material.schema";

export const paymentCategoryEnum = pgEnum("payment_category", [
  "worker_payment",
  "supervisor_payment",
  "plumber_payment",
  "rent",
  "material_expense",
  "other_expense",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: paymentCategoryEnum("category").notNull(),
    plumberId: uuid("plumber_id").references(() => plumbers.id, { onDelete: "set null" }),
    paidTo: text("paid_to"),
    siteId: uuid("site_id").references(() => projectSites.id, { onDelete: "set null" }),
    address: text("address"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // Nullable, additive (Command Center Phase 1) - most historical rows resolve
    // their project via siteId/customerId instead. This exists so expenses with
    // no site or customer (rent, transport, misc project cost) can still be
    // attributed to a project directly, without requiring one.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    // Free text, not an enum - payment modes are managed as master data
    // ("Payment Types"), so any value an admin adds there must be storable
    // without a code change/migration.
    mode: text("mode").notNull(),
    status: paymentStatusEnum("status").notNull().default("draft"),
    purpose: text("purpose"),
    remarks: text("remarks"),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>(),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("payments_category_idx").on(table.category),
    statusIdx: index("payments_status_idx").on(table.status),
    plumberIdx: index("payments_plumber_idx").on(table.plumberId),
    siteIdx: index("payments_site_idx").on(table.siteId),
    projectIdx: index("payments_project_idx").on(table.projectId),
    dateIdx: index("payments_date_idx").on(table.paymentDate),
  }),
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  plumber: one(plumbers, { fields: [payments.plumberId], references: [plumbers.id] }),
  site: one(projectSites, { fields: [payments.siteId], references: [projectSites.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
  transactions: many(materialTransactions),
}));
