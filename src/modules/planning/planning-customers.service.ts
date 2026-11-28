import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@db";
import { accessibleProjectIds } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";
import { buildPaginationMeta, parsePagination, toSearchPattern } from "@utils";

/**
 * Customers for the app's DPR / Planning list, one page at a time, with each
 * customer's plan / DPR status for the day. Filters: project (or all the
 * user's projects), status, search. Counts per status come with every page
 * (for the status chips).
 */

export type PlanningMode = "work" | "dpr";
export type PlanningCustomerStatus = "not_planned" | "submitted" | "approved" | "sent_back" | "not_reported" | "reported";

export type PlanningCustomersQuery = {
  date: string;
  mode?: PlanningMode;
  projectId?: string;
  status?: string;
  search?: string;
  page?: number | string;
  limit?: number | string;
};

const ADMIN_ROLES = new Set(["super_admin", "admin"]);
const WORK_STATUSES = new Set(["not_planned", "submitted", "approved", "sent_back"]);
const DPR_STATUSES = new Set(["not_reported", "reported"]);

export async function listPlanningCustomers(query: PlanningCustomersQuery, currentUser: AuthTokenPayload) {
  const mode: PlanningMode = query.mode === "dpr" ? "dpr" : "work";
  const { page, limit, offset } = parsePagination(query, 100);
  const projectIds = await accessibleProjectIds(currentUser);
  const empty = { rows: [], pagination: buildPaginationMeta(page, limit, 0), counts: {} as Record<string, number> };
  if (projectIds && !projectIds.length) return empty;
  if (query.projectId && projectIds && !projectIds.includes(query.projectId)) return empty;

  // A supervisor's list shows their own plans / DPRs (same as the plan screen).
  const mine = ADMIN_ROLES.has(currentUser.role) ? sql`` : sql` AND x.supervisor_id = ${currentUser.id}`;
  const statusExpr =
    mode === "work"
      ? sql`COALESCE((SELECT x.status::text FROM site_plans x WHERE x.customer_id = c.id AND x.date = ${query.date}${mine} ORDER BY x.updated_at DESC LIMIT 1), 'not_planned')`
      : sql`CASE WHEN EXISTS (SELECT 1 FROM dpr_records x WHERE x.customer_id = c.id AND x.date = ${query.date}${mine}) THEN 'reported' ELSE 'not_reported' END`;

  const conditions: SQL[] = [sql`c.project_id IS NOT NULL`];
  if (query.projectId) conditions.push(sql`c.project_id = ${query.projectId}`);
  else if (projectIds) conditions.push(sql`c.project_id IN (${sql.join(projectIds.map((id) => sql`${id}`), sql`, `)})`);
  const pattern = toSearchPattern(query.search);
  if (pattern) conditions.push(sql`(c.customer_name ILIKE ${pattern} OR c.tr_bp_number ILIKE ${pattern})`);
  const where = sql.join(conditions, sql` AND `);

  const allowed = mode === "work" ? WORK_STATUSES : DPR_STATUSES;
  const status = query.status && allowed.has(query.status) ? query.status : undefined;

  const db = getDb();
  const base = sql`
    SELECT c.id, c.tr_bp_number, c.customer_name, c.project_id, p.name AS project_name, c.site_id, ${statusExpr} AS status
    FROM customers c
    JOIN projects p ON p.id = c.project_id
    WHERE ${where}`;

  const [rowsResult, countsResult] = await Promise.all([
    db.execute(sql`
      SELECT * FROM (${base}) t
      ${status ? sql`WHERE t.status = ${status}` : sql``}
      ORDER BY t.customer_name, t.id
      LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT t.status, COUNT(*)::int AS n FROM (${base}) t GROUP BY t.status`),
  ]);

  const counts: Record<string, number> = {};
  let all = 0;
  for (const row of countsResult as unknown as { status: string; n: number }[]) {
    counts[row.status] = Number(row.n);
    all += Number(row.n);
  }
  counts.all = all;
  const total = status ? (counts[status] ?? 0) : all;

  const rows = (rowsResult as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    trBpNumber: (row.tr_bp_number as string | null) ?? "",
    customerName: (row.customer_name as string | null) ?? "",
    projectId: row.project_id as string,
    projectName: (row.project_name as string | null) ?? "",
    siteId: (row.site_id as string | null) ?? null,
    status: row.status as PlanningCustomerStatus,
  }));

  return { rows, pagination: buildPaginationMeta(page, limit, total), counts };
}
