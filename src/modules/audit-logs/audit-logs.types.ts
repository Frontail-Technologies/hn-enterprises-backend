export type AuditLogListQuery = {
  page?: number | string;
  limit?: number | string;
  module?: string;
  userId?: string;
  projectId?: string;
  from?: string;
  to?: string;
};
