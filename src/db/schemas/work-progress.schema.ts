import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";

export const workStageEnum = pgEnum("work_stage", [
  "survey",
  "workable",
  "plumbing_gi",
  "gc",
  "commissioning",
  "conversion",
]);

export const workProgressStatusEnum = pgEnum("work_progress_status", [
  "not_started",
  "pending",
  "in_progress",
  "completed",
  "sent_back",
  "on_hold",
]);

export type WorkProgressEvidenceFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  capturedAt?: string;
};

export const workProgressUpdates = pgTable(
  "work_progress_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    supervisorId: uuid("supervisor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: workStageEnum("stage").notNull(),
    status: workProgressStatusEnum("status").notNull(),
    nextRequiredAction: text("next_required_action"),
    remarks: text("remarks"),
    evidence: jsonb("evidence").$type<WorkProgressEvidenceFile[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerCreatedIdx: index("work_progress_updates_customer_created_idx").on(
      table.customerId,
      table.createdAt,
    ),
    supervisorIdx: index("work_progress_updates_supervisor_idx").on(table.supervisorId),
    stageIdx: index("work_progress_updates_stage_idx").on(table.stage),
    statusIdx: index("work_progress_updates_status_idx").on(table.status),
  }),
);

export const workProgressUpdatesRelations = relations(workProgressUpdates, ({ one }) => ({
  customer: one(customers, {
    fields: [workProgressUpdates.customerId],
    references: [customers.id],
  }),
  supervisor: one(users, {
    fields: [workProgressUpdates.supervisorId],
    references: [users.id],
    relationName: "work_progress_updates_supervisor",
  }),
}));
