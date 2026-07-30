type AuditLogInput = {
  userId?: string;
  module: string;
  action: string;
  recordId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export const auditService = {
  async log(input: AuditLogInput) {
    console.info("[audit]", {
      ...input,
      createdAt: new Date().toISOString(),
    });
  },
};
