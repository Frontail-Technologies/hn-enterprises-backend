import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { attendance, auditLogs, complaints, dprRecords, sitePlans, staff, users, workProgressUpdates } from "@db/schema";
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
