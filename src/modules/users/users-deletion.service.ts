import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { attendance, auditLogs, complaints, dprRecords, sitePlans, staff, users, workProgressUpdates } from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited FK graph for User deletion (§7) - this one needed the most care.
 *
 * Most `references(() => users.id, ...)` in the schema are `SET NULL`
 * (createdBy/updatedBy/uploadedBy/approvedBy/... on materials, projects, bills,
 * payments, wage records, master values, etc.) - detaching those is always safe
 * and there are too many of them to list individually without turning the dialog
 * into noise, so they aren't enumerated as their own rows here.
 *
 * `audit_logs.userId` is also `SET NULL` and *is* called out below - unlinking a
 * user from their own audit trail is exactly the kind of thing worth surfacing.
 *
 * The important finding: several tables that hold real, user-authored business
 * content are `ON DELETE CASCADE` off `users.id`, not `SET NULL` or `RESTRICT`:
 *   - attendance.userId (a person's attendance history)
 *   - complaints.createdByAdminId
 *   - site_plans.supervisorId / dpr_records.supervisorId
 *   - work_progress_updates.supervisorId
 * A raw `DELETE FROM users` would silently take that content with it - the exact
 * "destroy auditability" outcome §7 rules out. Per the task's constraint ("do not
 * blindly change every FK"), the schema is left as-is; instead these are modeled
 * as `block` dependencies here and checked *before* the delete ever reaches
 * Postgres, so the dangerous cascade is never actually triggered. (staff.userId
 * is also CASCADE but is never reached either - see below.)
 *
 * `staff` (the payroll profile) is also blocked rather than silently cascaded:
 * a user with salary/bank details on file should be deactivated, not erased.
 *
 * `users.status` already has "inactive"/"suspended" - reused as the Deactivate
 * alternative whenever any of the above blocks a hard delete.
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

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
        key: "attendance",
        label: "Attendance Records",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(attendance).where(eq(attendance.userId, userId))),
        blockReason: (n) => `${n} attendance record${n === 1 ? "" : "s"} belong to this user. Attendance history is never deleted automatically.`,
      },
      {
        key: "staff",
        label: "Staff / Payroll Profile",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(staff).where(eq(staff.userId, userId))),
        blockReason: () => `This user has a staff/payroll profile on file. Deactivate the staff record instead of deleting the user.`,
      },
      {
        key: "complaints",
        label: "Complaints Created",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(complaints).where(eq(complaints.createdByAdminId, userId))),
        blockReason: (n) => `${n} complaint${n === 1 ? "" : "s"} were created by this user.`,
      },
      {
        key: "sitePlans",
        label: "Site Plans (as supervisor)",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(sitePlans).where(eq(sitePlans.supervisorId, userId))),
        blockReason: (n) => `${n} site plan${n === 1 ? "" : "s"} are attributed to this user as supervisor.`,
      },
      {
        key: "dprRecords",
        label: "DPR Records (as supervisor)",
        action: "block",
        count: async (db) => scalarCount(countOf(db).from(dprRecords).where(eq(dprRecords.supervisorId, userId))),
        blockReason: (n) => `${n} DPR record${n === 1 ? "" : "s"} are attributed to this user as supervisor.`,
      },
      {
        key: "workProgressUpdates",
        label: "Work Progress Updates (as supervisor)",
        action: "block",
        count: async (db) =>
          scalarCount(countOf(db).from(workProgressUpdates).where(eq(workProgressUpdates.supervisorId, userId))),
        blockReason: (n) => `${n} work progress update${n === 1 ? "" : "s"} are attributed to this user as supervisor.`,
      },
      {
        key: "auditLogs",
        label: "Audit Log Entries",
        action: "detach",
        count: async (db) => scalarCount(countOf(db).from(auditLogs).where(eq(auditLogs.userId, userId))),
      },
    ],
  };
}

export const usersDeletionService = {
  async getDeleteImpact(userId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildUserDeleteImpactConfig(userId), userId);
  },

  /** Same computation, against a caller-supplied handle (e.g. a `tx`) - lets bulk
   * delete recheck every target inside its own transaction instead of trusting a
   * pre-transaction snapshot. */
  async getDeleteImpactWithHandle(db: DbHandle, userId: string): Promise<DeleteImpactResult> {
    return computeDeleteImpact(db, buildUserDeleteImpactConfig(userId), userId);
  },

  async execute(userId: string, currentUserId: string): Promise<{ label: string; totalAffected: number }> {
    if (userId === currentUserId) throw new Error("Cannot delete your own account");
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const impact = await usersDeletionService.getDeleteImpactWithHandle(tx, userId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      await tx.delete(users).where(eq(users.id, userId));
      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });

    await auditService.log({
      userId: currentUserId,
      module: "Users",
      action: "Deleted User",
      recordId: userId,
      description: `Deleted user "${result.label}"`,
    });

    return result;
  },
};
