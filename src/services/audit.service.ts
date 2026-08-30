import { getDb } from "@db";
import { auditLogs } from "@db/schema";

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
      await db.insert(auditLogs).values({
        userId: input.userId || null,
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
