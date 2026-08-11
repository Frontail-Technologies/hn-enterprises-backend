import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { projects } from "./project.schema";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    module: text("module").notNull(),
    action: text("action").notNull(),
    recordId: text("record_id"),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Nullable, additive (Command Center Phase 1 activity foundation). Only
    // new writes populate this - historical rows stay unscoped rather than
    // attempting an unreliable backfill from `recordId`/`metadata`.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("audit_logs_user_idx").on(table.userId),
    moduleIdx: index("audit_logs_module_idx").on(table.module),
    projectIdx: index("audit_logs_project_idx").on(table.projectId),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  }),
);
