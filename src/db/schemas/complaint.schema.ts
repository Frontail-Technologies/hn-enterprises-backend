import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";

export const complaintPriorityEnum = pgEnum("complaint_priority", ["low", "medium", "high"]);

export const complaintStatusEnum = pgEnum("complaint_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    createdByAdminId: uuid("created_by_admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priority: complaintPriorityEnum("priority").notNull().default("medium"),
    status: complaintStatusEnum("status").notNull().default("open"),
    supervisorRemark: text("supervisor_remark"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("complaints_customer_idx").on(table.customerId),
    statusIdx: index("complaints_status_idx").on(table.status),
  }),
);

export const complaintsRelations = relations(complaints, ({ one }) => ({
  customer: one(customers, {
    fields: [complaints.customerId],
    references: [customers.id],
  }),
  createdByAdmin: one(users, {
    fields: [complaints.createdByAdminId],
    references: [users.id],
    relationName: "complaints_created_by_admin",
  }),
}));
