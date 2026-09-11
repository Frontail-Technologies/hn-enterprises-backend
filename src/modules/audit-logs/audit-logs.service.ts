import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb } from "@db";
import { auditLogs, users } from "@db/schema";
import { buildPaginationMeta, parsePagination, toSearchPattern } from "@utils";
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
  userId: auditLogs.userId,
  liveUserName: users.name,
  liveUserRole: users.role,
  userNameSnapshot: auditLogs.userName,
  userRoleSnapshot: auditLogs.userRole,
};

export const auditLogsService = {
  async list(query: AuditLogListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const searchPattern = toSearchPattern(query.search);
    const conditions = [
      query.module ? eq(auditLogs.module, query.module) : undefined,
      query.userId ? eq(auditLogs.userId, query.userId) : undefined,
      query.projectId ? eq(auditLogs.projectId, query.projectId) : undefined,
      query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
      query.to ? lte(auditLogs.createdAt, new Date(query.to)) : undefined,
      searchPattern
        ? or(ilike(auditLogs.description, searchPattern), ilike(users.name, searchPattern))
        : undefined,
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
      db
        .select({ value: count() })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      module: row.module,
      action: row.action,
      recordId: row.recordId,
      description: row.description,
      metadata: row.metadata,
      projectId: row.projectId,
      createdAt: row.createdAt,
      /**
       * Fallback order (safe-hard-delete brief §13): live relation name ->
       * immutable snapshot -> null (a genuine system/no-actor action, not a
       * deleted user - the frontend renders that case as "System").
       */
      user: row.userId
        ? {
            id: row.userId,
            name: row.liveUserName ?? row.userNameSnapshot ?? "Unknown",
            role: row.liveUserRole ?? row.userRoleSnapshot,
            deleted: false,
          }
        : row.userNameSnapshot
          ? { id: null, name: row.userNameSnapshot, role: row.userRoleSnapshot, deleted: true }
          : null,
    }));

    return { rows: data, pagination: buildPaginationMeta(page, limit, total) };
  },

  /** Distinct module names for the Audit Logs filter dropdown (small, mostly-static set). */
  async modules() {
    const db = getDb();
    const rows = await db
      .selectDistinct({ module: auditLogs.module })
      .from(auditLogs)
      .orderBy(auditLogs.module);
    return rows.map((row) => row.module).filter((value): value is string => Boolean(value));
  },
};
