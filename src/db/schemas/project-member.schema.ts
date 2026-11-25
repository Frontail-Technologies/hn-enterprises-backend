import { relations, sql } from "drizzle-orm";
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { plumbers } from "./plumber.schema";
import { projects } from "./project.schema";

/** "plumber" covers labour too (plumbers.category). */
export const projectMemberTypeEnum = pgEnum("project_member_type", ["supervisor", "plumber"]);

/**
 * Who works on which project. A supervisor (mobile app) only sees the
 * projects they are an active member of, and only the plumbers/labour that
 * are active members of those projects. Removing someone sets `removedAt`
 * (the row is kept as history) instead of deleting it.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberType: projectMemberTypeEnum("member_type").notNull(),
    /** Set for supervisors. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Set for plumbers and labour. */
    plumberId: uuid("plumber_id").references(() => plumbers.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    activeUserIdx: uniqueIndex("project_members_active_user_idx")
      .on(table.projectId, table.userId)
      .where(sql`${table.removedAt} IS NULL AND ${table.userId} IS NOT NULL`),
    activePlumberIdx: uniqueIndex("project_members_active_plumber_idx")
      .on(table.projectId, table.plumberId)
      .where(sql`${table.removedAt} IS NULL AND ${table.plumberId} IS NOT NULL`),
    userIdx: index("project_members_user_idx").on(table.userId),
    plumberIdx: index("project_members_plumber_idx").on(table.plumberId),
    projectIdx: index("project_members_project_idx").on(table.projectId),
  }),
);

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
  plumber: one(plumbers, { fields: [projectMembers.plumberId], references: [plumbers.id] }),
}));
