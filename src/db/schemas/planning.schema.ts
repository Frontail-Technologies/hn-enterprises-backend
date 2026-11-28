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
/** Plans are what an admin approves: submitted -> approved, or sent back (with a reason). */
export const planStatusEnum = pgEnum("plan_status", ["submitted", "approved", "sent_back"]);

export type PlanTaskPayload = {
  id: string;
  qty?: string;
  worker?: string;
  /** Plumber / labour picked from the project's list (worker keeps the name). */
  plumberId?: string;
};

export type DprTaskPayload = {
  id: string;
  plannedQty?: string;
  completedQty?: string;
  worker?: string;
  plumberId?: string;
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
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    /** Optional: planning is per project now; kept for older app versions. */
    siteId: uuid("site_id").references(() => projectSites.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    /** Immutable snapshot, populated at write time - survives a hard-deleted supervisor so historical plans stay attributable. */
    supervisorName: text("supervisor_name"),
    tasks: jsonb("tasks").$type<PlanTaskPayload[]>().notNull().default([]),
    status: planStatusEnum("status").notNull().default("submitted"),
    /** Admin review: who approved/sent it back, when, and the reason. */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
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
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    /** Optional: planning is per project now; kept for older app versions. */
    siteId: uuid("site_id").references(() => projectSites.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    /** Immutable snapshot, populated at write time - survives a hard-deleted supervisor so historical DPRs stay attributable. */
    supervisorName: text("supervisor_name"),
    status: dprStatusEnum("status").notNull().default("draft"),
    remarks: text("remarks"),
    tasks: jsonb("tasks").$type<DprTaskPayload[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<PlanningEvidenceFile[]>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Admin review: who approved/rejected it, when, and the rejection reason. */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
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

/**
 * Project-wise planning (replaces the per-customer plans / DPRs): one plan and
 * one DPR per supervisor, project and day, with a quantity per task.
 */
export type ProjectDprManpower = { plumberId?: string; name: string; category?: "plumber" | "labour" };
/** Plumbers / labour assigned to one task (same shape as manpower). */
export type ProjectTaskWorker = ProjectDprManpower;
export type ProjectPlanTask = { id: string; qty?: string; workers?: ProjectTaskWorker[] };
export type ProjectDprTask = { id: string; plannedQty?: string; doneQty?: string; delayReason?: string; workers?: ProjectTaskWorker[] };

export const projectPlans = pgTable(
  "project_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    supervisorName: text("supervisor_name"),
    date: date("date", { mode: "string" }).notNull(),
    tasks: jsonb("tasks").$type<ProjectPlanTask[]>().notNull().default([]),
    remarks: text("remarks"),
    status: planStatusEnum("status").notNull().default("submitted"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectDateSupervisorIdx: uniqueIndex("project_plans_project_date_supervisor_idx").on(table.projectId, table.date, table.supervisorId),
    dateIdx: index("project_plans_date_idx").on(table.date),
    statusIdx: index("project_plans_status_idx").on(table.status),
  }),
);

export const projectDprs = pgTable(
  "project_dprs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    supervisorName: text("supervisor_name"),
    date: date("date", { mode: "string" }).notNull(),
    tasks: jsonb("tasks").$type<ProjectDprTask[]>().notNull().default([]),
    manpower: jsonb("manpower").$type<ProjectDprManpower[]>().notNull().default([]),
    remarks: text("remarks"),
    evidence: jsonb("evidence").$type<PlanningEvidenceFile[]>().notNull().default([]),
    status: dprStatusEnum("status").notNull().default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectDateSupervisorIdx: uniqueIndex("project_dprs_project_date_supervisor_idx").on(table.projectId, table.date, table.supervisorId),
    dateIdx: index("project_dprs_date_idx").on(table.date),
  }),
);
