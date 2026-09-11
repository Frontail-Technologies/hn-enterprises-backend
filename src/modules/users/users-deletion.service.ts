import { and, count, eq } from "drizzle-orm";
import { getDb } from "@db";
import {
  activityEvents,
  attendance,
  auditLogs,
  complaints,
  customerNotes,
  dprRecords,
  projectSites,
  sitePlans,
  staff,
  users,
  workProgressUpdates,
} from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

/**
 * Product decision (safe-hard-delete + remove-staff-block briefs):
 * supervisors/users MAY be permanently hard-deleted, staff-linked or not.
 * Every dependency below is non-blocking:
 * - "detach": survives the delete, FK set null, readable via its own
 *   actor-name snapshot (activity, audit, notes, attendance, complaints,
 *   site plans, DPR, work progress - all historical business/audit records).
 * - "delete": genuinely removed as part of this same delete. Only `staff`
 *   is this - it is the user's CURRENT profile record (nothing else
 *   references staff.id; verified across every schema file), not history,
 *   and staff.userId is ON DELETE CASCADE, so it disappears together with
 *   the user automatically. No dependency here blocks deletion: only a
 *   dependency that genuinely cannot be safely preserved or cleared under
 *   the current schema would, and none currently exists.
 */
function buildUserDeleteImpactConfig(userId: string): DeleteImpactConfig {
  return {
    entityType: "user",
    getLabel: async (db) => {
      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error("User not found");
      return user.name;
    },
    dependencies: [
      {
        key: "activeSiteAssignments",
        label: "Active Site Assignments",
        action: "detach",
        count: async (db) =>
          scalarCount(
            countOf(db)
              .from(projectSites)
              .where(and(eq(projectSites.supervisorId, userId), eq(projectSites.status, "active"))),
          ),
        preview: async (db) =>
          db
            .select({ id: projectSites.id, label: projectSites.name })
            .from(projectSites)
            .where(and(eq(projectSites.supervisorId, userId), eq(projectSites.status, "active")))
            .limit(5),
      },
      {
        key: "activityEvents",
        label: "Historical Activity Events",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(activityEvents).where(eq(activityEvents.actorId, userId))),
      },
      {
        key: "auditLogs",
        label: "Audit Log Entries",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(auditLogs).where(eq(auditLogs.userId, userId))),
      },
      {
        key: "customerNotes",
        label: "Customer Notes",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(customerNotes).where(eq(customerNotes.authorId, userId))),
      },
      {
        key: "attendance",
        label: "Attendance Records",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(attendance).where(eq(attendance.userId, userId))),
      },
      {
        key: "staff",
        label: "Current Staff Profile",
        action: "delete",
        count: async (db) => scalarCount(countOf(db).from(staff).where(eq(staff.userId, userId))),
      },
      {
        key: "complaints",
        label: "Complaints Created",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(complaints).where(eq(complaints.createdByAdminId, userId))),
      },
      {
        key: "sitePlans",
        label: "Site Plans (as supervisor)",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(sitePlans).where(eq(sitePlans.supervisorId, userId))),
      },
      {
        key: "dprRecords",
        label: "DPR Records (as supervisor)",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(dprRecords).where(eq(dprRecords.supervisorId, userId))),
      },
      {
        key: "workProgressUpdates",
        label: "Work Progress Updates (as supervisor)",
        action: "detach",
        count: async (db) =>
          scalarCount(countOf(db).from(workProgressUpdates).where(eq(workProgressUpdates.supervisorId, userId))),
      },
    ],
  };
}

export const usersDeletionService = {
  async getDeleteImpact(userId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildUserDeleteImpactConfig(userId), userId);
  },

  async getDeleteImpactWithHandle(db: DbHandle, userId: string): Promise<DeleteImpactResult> {
    return computeDeleteImpact(db, buildUserDeleteImpactConfig(userId), userId);
  },

  /**
   * Clears active project-site assignments to this user (safe-hard-delete
   * brief §6/§11) - shared by both execute() (single) and
   * usersService.bulkDelete(), so bulk delete can never skip this step. A
   * CURRENT structural assignment, not a historical record, so it must
   * actually read as "Unassigned" afterward (both supervisorId and the
   * denormalized supervisorName) - unlike the historical tables, which keep
   * their own actor-name snapshot instead.
   */
  async clearActiveSiteAssignments(db: DbHandle, userId: string) {
    await db
      .update(projectSites)
      .set({ supervisorId: null, supervisorName: null })
      .where(and(eq(projectSites.supervisorId, userId), eq(projectSites.status, "active")));
  },

  /**
   * Permanent hard delete (safe-hard-delete brief §8/§12). Transaction:
   * 1. Compute impact / assert not blocked.
   * 2. clearActiveSiteAssignments() - see its own doc comment.
   * 3. Delete the user row. Every other FK referencing users.id is already
   *    ON DELETE SET NULL (or CASCADE for tokens/sessions/staff/prefs/
   *    notifications, which are correctly meant to go) - Postgres enforces
   *    all of those automatically as part of this single DELETE, so no
   *    per-table UPDATE is needed for the historical tables; each one's own
   *    actor-name snapshot (added alongside this change) is what keeps their
   *    history readable afterward.
   * 4. Commit. Email/mobile/username live only on the users row itself, so
   *    deleting it is what releases those identifiers for reuse.
   */
  async execute(userId: string, currentUserId: string): Promise<{ label: string; totalAffected: number }> {
    if (userId === currentUserId) throw new Error("Cannot delete your own account");
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const impact = await usersDeletionService.getDeleteImpactWithHandle(tx, userId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      await usersDeletionService.clearActiveSiteAssignments(tx, userId);
      await tx.delete(users).where(eq(users.id, userId));
      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });

    await auditService.log({
      userId: currentUserId,
      module: "Users",
      action: "Deleted User",
      recordId: userId,
      description: `Permanently deleted user "${result.label}"`,
    });

    return result;
  },
};
