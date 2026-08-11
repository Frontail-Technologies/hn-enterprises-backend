import { getDb } from "@db";
import { auditLogs } from "@db/schema";

type AuditLogInput = {
  userId?: string;
  module: string;
  action: string;
  recordId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  // Project Command Center activity foundation (Phase 1) - optional, additive.
  // Only pass this when the event unambiguously belongs to one project (e.g.
  // a bulk operation spanning customers from multiple projects should omit
  // it rather than guess). Omitted/undefined rows simply don't show up in a
  // project-scoped activity feed - they remain visible in the global one.
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
