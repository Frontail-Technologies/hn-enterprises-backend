import { relations } from "drizzle-orm";
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { projects } from "./project.schema";

export const billStatusEnum = pgEnum("bill_status", [
  "draft",
  "submitted",
  "completed",
  "overdue",
]);

export const billPaymentStatusEnum = pgEnum("bill_payment_status", [
  "pending",
  "cleared",
  "bounced",
]);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Billing happens at the project level - projectId is the bill's only
    // ownership link. (Existing rows were backfilled via
    // backfill-bill-projects.ts before this was made required.)
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    billNumber: text("bill_number").notNull(),
    normalizedBillNumber: text("normalized_bill_number").notNull(),
    billDate: timestamp("bill_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    tax: numeric("tax", { precision: 14, scale: 2 }).notNull().default("0"),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    status: billStatusEnum("status").notNull().default("draft"),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedBillNumberIdx: uniqueIndex("bills_normalized_bill_number_idx").on(
      table.normalizedBillNumber,
    ),
    projectIdx: index("bills_project_idx").on(table.projectId),
    statusIdx: index("bills_status_idx").on(table.status),
  }),
);

export const billPayments = pgTable(
  "bill_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    // Free text, not an enum - see the matching note on payments.mode in
    // payment.schema.ts.
    mode: text("mode").notNull(),
    status: billPaymentStatusEnum("status").notNull().default("cleared"),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    billIdx: index("bill_payments_bill_idx").on(table.billId),
  }),
);

export const billsRelations = relations(bills, ({ one, many }) => ({
  project: one(projects, {
    fields: [bills.projectId],
    references: [projects.id],
  }),
  payments: many(billPayments),
}));

export const billPaymentsRelations = relations(billPayments, ({ one }) => ({
  bill: one(bills, {
    fields: [billPayments.billId],
    references: [bills.id],
  }),
}));
