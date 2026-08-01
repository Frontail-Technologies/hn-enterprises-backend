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
import { paymentModeEnum } from "./common.schema";
import { customers } from "./customer.schema";

export const billStageEnum = pgEnum("bill_stage", [
  "gi",
  "gc",
  "commissioning",
  "conversion",
  "other",
]);

export const billStatusEnum = pgEnum("bill_status", [
  "draft",
  "submitted",
  "completed",
  "overdue",
]);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    billNumber: text("bill_number").notNull(),
    normalizedBillNumber: text("normalized_bill_number").notNull(),
    stage: billStageEnum("stage").notNull().default("other"),
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
    customerIdx: index("bills_customer_idx").on(table.customerId),
    statusIdx: index("bills_status_idx").on(table.status),
    stageIdx: index("bills_stage_idx").on(table.stage),
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
    mode: paymentModeEnum("mode").notNull(),
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
  customer: one(customers, {
    fields: [bills.customerId],
    references: [customers.id],
  }),
  payments: many(billPayments),
}));

export const billPaymentsRelations = relations(billPayments, ({ one }) => ({
  bill: one(bills, {
    fields: [billPayments.billId],
    references: [bills.id],
  }),
}));
