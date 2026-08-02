import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("audit_logs_user_idx").on(table.userId),
    moduleIdx: index("audit_logs_module_idx").on(table.module),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  }),
);
