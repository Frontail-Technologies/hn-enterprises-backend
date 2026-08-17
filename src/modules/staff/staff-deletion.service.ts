import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { attendance, staff, users } from "@db/schema";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited FK graph for Staff deletion (§6).
 *
 * Nothing in the schema references `staff.id` at all - it's a leaf table (a
 * payroll-profile extension of exactly one user, `staff.userId` unique). The
 * *existing* delete behavior (staff.service.ts) already never removes a row: it
 * deactivates the linked user (`status: "inactive"`). That already satisfies
 * "preserve historical attendance/payroll records" by construction - there is
 * nothing to block or cascade.
 *
 * This Delete Impact config exists for UI consistency (the same dialog, the same
 * "here's what's linked" preview) rather than because deactivation carries any
 * real risk - `canDelete` is always true, and the dialog's primary action reads
 * "Deactivate Staff" rather than a destructive delete label (wired on the
 * frontend side via `entityTypeLabel`/copy, not by lying about the action here).
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function buildStaffDeleteImpactConfig(staffId: string): DeleteImpactConfig {
  return {
    entityType: "staff",
    getLabel: async (db) => {
      const [row] = await db
        .select({ name: users.name })
        .from(staff)
        .innerJoin(users, eq(staff.userId, users.id))
        .where(eq(staff.id, staffId))
        .limit(1);
      if (!row) throw new Error("Staff record not found");
      return row.name;
    },
    dependencies: [
      {
        key: "attendance",
        label: "Attendance Records",
        action: "preserve",
        count: async (db) => {
          const [row] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, staffId)).limit(1);
          if (!row) return 0;
          return scalarCount(countOf(db).from(attendance).where(eq(attendance.userId, row.userId)));
        },
      },
    ],
  };
}

export const staffDeletionService = {
  async getDeleteImpact(staffId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildStaffDeleteImpactConfig(staffId), staffId);
  },
};
