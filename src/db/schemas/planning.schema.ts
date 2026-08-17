import { relations } from "drizzle-orm";
import { date, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";
import { projects, projectSites } from "./project.schema";

export const planningTaskIdEnum = pgEnum("planning_task_id", [
  "survey",
  "gi",
  "gc",
  "laying",
  "valve",
  "pre",
  "conversion",
  "jmr",
  "testing",
  "route",
  "commissioning",
]);

export const dprStatusEnum = pgEnum("dpr_status", ["draft", "submitted", "approved"]);

export type PlanTaskPayload = {
  id: string;
  qty?: string;
  worker?: string;
};

export type DprTaskPayload = {
  id: string;
  plannedQty?: string;
  completedQty?: string;
  worker?: string;
  delayReason?: string;
};

export type PlanningEvidenceFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  capturedAt?: string;
};

export const sitePlans = pgTable(
  "site_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // A plan is filed against a specific customer, not a site - a site can have
    // many customers, so the site alone can't distinguish whose work is being
    // planned. projectId/siteId are kept (derived from the customer at write
    // time) purely for filtering/display continuity with the rest of the app.
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => projectSites.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    supervisorId: uuid("supervisor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tasks: jsonb("tasks").$type<PlanTaskPayload[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerDateSupervisorIdx: uniqueIndex("site_plans_customer_date_supervisor_idx").on(
      table.customerId,
      table.date,
      table.supervisorId,
    ),
    customerIdx: index("site_plans_customer_idx").on(table.customerId),
    siteIdx: index("site_plans_site_idx").on(table.siteId),
    projectIdx: index("site_plans_project_idx").on(table.projectId),
    dateIdx: index("site_plans_date_idx").on(table.date),
  }),
);

export const dprRecords = pgTable(
  "dpr_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Same customer-first rationale as site_plans - see comment there.
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => projectSites.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    supervisorId: uuid("supervisor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: dprStatusEnum("status").notNull().default("draft"),
    remarks: text("remarks"),
    tasks: jsonb("tasks").$type<DprTaskPayload[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<PlanningEvidenceFile[]>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerDateSupervisorIdx: uniqueIndex("dpr_records_customer_date_supervisor_idx").on(
      table.customerId,
      table.date,
      table.supervisorId,
    ),
    customerIdx: index("dpr_records_customer_idx").on(table.customerId),
    siteIdx: index("dpr_records_site_idx").on(table.siteId),
    projectIdx: index("dpr_records_project_idx").on(table.projectId),
    dateIdx: index("dpr_records_date_idx").on(table.date),
    statusIdx: index("dpr_records_status_idx").on(table.status),
  }),
);

export const sitePlansRelations = relations(sitePlans, ({ one }) => ({
  customer: one(customers, {
    fields: [sitePlans.customerId],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [sitePlans.projectId],
    references: [projects.id],
  }),
  site: one(projectSites, {
    fields: [sitePlans.siteId],
    references: [projectSites.id],
  }),
  supervisor: one(users, {
    fields: [sitePlans.supervisorId],
    references: [users.id],
    relationName: "site_plans_supervisor",
  }),
}));

export const dprRecordsRelations = relations(dprRecords, ({ one }) => ({
  customer: one(customers, {
    fields: [dprRecords.customerId],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [dprRecords.projectId],
    references: [projects.id],
  }),
  site: one(projectSites, {
    fields: [dprRecords.siteId],
    references: [projectSites.id],
  }),
  supervisor: one(users, {
    fields: [dprRecords.supervisorId],
    references: [users.id],
    relationName: "dpr_records_supervisor",
  }),
}));
