import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { customers } from "./customer.schema";
import { projects } from "./project.schema";

/**
 * Operational Recent Activity feed - a sanitized, human-readable, actor/
 * customer/project-attributed stream written at action time by
 * activityService.record().
 *
 * This is NOT audit_logs. audit_logs stays the raw/immutable technical audit
 * history (super_admin only, compliance/debugging). activity_events is the
 * app-facing feed, permissioned by normal project/staff access. Some actions
 * legitimately write both.
 *
 * All FKs are `set null` on delete - a customer/project/user being removed
 * must never delete or break historical activity. `sourceType`+`sourceId`
 * give every row a deterministic origin key for idempotent backfill and for
 * linking a feed row back to its source record.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Coarse feed category, e.g. "customer" | "work_progress" | "survey" | "dpr" | "expense" | "complaint" | "system". Plain text (no enum) so new kinds don't need a migration. */
    type: text("type").notNull(),
    /** Stable machine action key, e.g. "customer.section_completed", "expense.created", "complaint.status_changed". Never shown raw in the UI. */
    action: text("action").notNull(),

    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * Immutable actor identity snapshot, captured at write time (see
     * activityService.record()). actorId is nulled when the user is hard-
     * deleted, but this snapshot survives so historical activity always
     * renders a readable name - never re-resolved from the live users table.
     */
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    /** Financial/ownership attribution target when someone acted for another user (admin logs an expense for a supervisor). Distinct from actorId. */
    onBehalfOfUserId: uuid("on_behalf_of_user_id").references(() => users.id, { onDelete: "set null" }),
    onBehalfOfName: text("on_behalf_of_name"),

    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),

    /** Deterministic origin for idempotent backfill / dedupe: (sourceType, sourceId, action) is unique-ish per real event. */
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),

    title: text("title").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    occurredAtIdx: index("activity_events_occurred_at_idx").on(table.occurredAt),
    actorIdx: index("activity_events_actor_idx").on(table.actorId),
    customerIdx: index("activity_events_customer_idx").on(table.customerId),
    projectIdx: index("activity_events_project_idx").on(table.projectId),
    typeIdx: index("activity_events_type_idx").on(table.type),
    // Feed default is ORDER BY occurred_at DESC scoped by project - support it directly.
    projectOccurredIdx: index("activity_events_project_occurred_idx").on(table.projectId, table.occurredAt),
    // Idempotent backfill / write-time dedupe lookups.
    sourceIdx: index("activity_events_source_idx").on(table.sourceType, table.sourceId, table.action),
  }),
);

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  actor: one(users, {
    fields: [activityEvents.actorId],
    references: [users.id],
    relationName: "activity_events_actor",
  }),
  onBehalfOfUser: one(users, {
    fields: [activityEvents.onBehalfOfUserId],
    references: [users.id],
    relationName: "activity_events_on_behalf",
  }),
  customer: one(customers, {
    fields: [activityEvents.customerId],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [activityEvents.projectId],
    references: [projects.id],
  }),
}));
