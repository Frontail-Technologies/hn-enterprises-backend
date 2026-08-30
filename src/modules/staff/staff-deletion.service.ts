import { count, eq } from "drizzle-orm";
import { getDb } from "@db";
import { attendance, staff, users } from "@db/schema";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactResult } from "../deletion/deletion.types";

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
