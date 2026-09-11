import { eq } from "drizzle-orm";
import { getDb } from "@db";
import { auditLogs, users } from "@db/schema";

type AuditLogInput = {
  userId?: string;
  module: string;
  action: string;
  recordId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  projectId?: string | null;
};

export const auditService = {
  async log(input: AuditLogInput) {
    try {
      const db = getDb();
      /**
       * Immutable actor snapshot (safe-hard-delete brief §4): resolved fresh
       * at write time so audit history stays readable after the user is
       * hard-deleted, without every one of this function's many call sites
       * needing to pass name/role themselves.
       */
      const [actor] = input.userId
        ? await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1)
        : [];

      await db.insert(auditLogs).values({
        userId: input.userId || null,
        userName: actor?.name ?? null,
        userRole: actor?.role ?? null,
        module: input.module,
        action: input.action,
        recordId: input.recordId || null,
        description: input.description || null,
        metadata: input.metadata,
        projectId: input.projectId || null,
      });
    } catch (error) {
      console.error("[audit] Failed to record audit log", error);
    }
  },
};
