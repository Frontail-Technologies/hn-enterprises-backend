import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@db";
import { auditLogs, users } from "@db/schema";
import { buildPaginationMeta, parsePagination } from "@utils";
import type { AuditLogListQuery } from "./audit-logs.types";

const auditLogSelection = {
  id: auditLogs.id,
  module: auditLogs.module,
  action: auditLogs.action,
  recordId: auditLogs.recordId,
  description: auditLogs.description,
  metadata: auditLogs.metadata,
  projectId: auditLogs.projectId,
  createdAt: auditLogs.createdAt,
  user: {
    id: users.id,
    name: users.name,
  },
};

export const auditLogsService = {
  async list(query: AuditLogListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = [
      query.module ? eq(auditLogs.module, query.module) : undefined,
      query.userId ? eq(auditLogs.userId, query.userId) : undefined,
      // Only rows written after the Phase 1 activity foundation went in carry
      // a projectId - older rows simply won't match, which is correct (they
      // stay visible in the unscoped/global audit log instead).
      query.projectId ? eq(auditLogs.projectId, query.projectId) : undefined,
      query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
      query.to ? lte(auditLogs.createdAt, new Date(query.to)) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(auditLogSelection)
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(auditLogs.createdAt)),
      db.select({ value: count() }).from(auditLogs).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },
};
