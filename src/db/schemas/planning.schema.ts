import { relations } from "drizzle-orm";
import { date, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
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
    siteDateSupervisorIdx: uniqueIndex("site_plans_site_date_supervisor_idx").on(
      table.siteId,
      table.date,
      table.supervisorId,
    ),
    siteIdx: index("site_plans_site_idx").on(table.siteId),
    projectIdx: index("site_plans_project_idx").on(table.projectId),
    dateIdx: index("site_plans_date_idx").on(table.date),
  }),
);

export const dprRecords = pgTable(
  "dpr_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    siteDateSupervisorIdx: uniqueIndex("dpr_records_site_date_supervisor_idx").on(
      table.siteId,
      table.date,
      table.supervisorId,
    ),
    siteIdx: index("dpr_records_site_idx").on(table.siteId),
    projectIdx: index("dpr_records_project_idx").on(table.projectId),
    dateIdx: index("dpr_records_date_idx").on(table.date),
    statusIdx: index("dpr_records_status_idx").on(table.status),
  }),
);

export const sitePlansRelations = relations(sitePlans, ({ one }) => ({
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
