import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@db";
import { dprRecords, projects, staff, users } from "@db/schema";
import { projectPaymentCondition } from "@modules/payments/payments.service";
import { dashboardStatsService } from "@modules/stats/dashboard-stats.service";

// Lightweight KPI counts for the Overview tab (§4) - every number here comes
// from a real, already-scoped query, never a full customer/payment table
// load into Node. Kept separate from projects-team.service.ts, which builds
// the much heavier per-person team roster only when the Team tab is opened.

// Reuses the SAME already-project-filterable admin dashboard KPI query
// (dashboard-stats.service.ts) instead of re-deriving the same "done"
// predicates a second time - covers both Overview's Execution Progress AND
// Billing's five indicators (jmrDone/jmrSubmittedInPbg/gi·gc·conversion
// BillDone) from the one call this function makes.
async function getCustomerHealth(projectId: string) {
  const counts = await dashboardStatsService.getAdminCounts(projectId);
  return {
    total: counts["total-customers"],
    surveyDone: counts["survey-done"],
    giDone: counts["gi-done"],
    gcDone: counts["gc-done"],
    conversionDone: counts["conversion-done"],
    jmrDone: counts["jmr-done"],
    jmrSubmittedInPbg: counts["total-pbg-assignment"],
    giBillDone: counts["gi-bill-done"],
    gcBillDone: counts["gc-bill-done"],
    conversionBillDone: counts["conversion-bill-done"],
    connectionRemark: counts["connection-remark"],
  };
}

async function getSites(projectId: string) {
  const db = getDb();
  // One grouped query gives the Overview "Sites" section its full row list
  // (§3: Site/Area, Status, Supervisor, Planned Connections, Customer Count)
  // without the frontend fetching this project's entire customer list a
  // second time just to count rows per site.
  const rows = await db.execute<{
    id: string;
    name: string;
    status: string;
    supervisor_name: string | null;
    planned_connections: number | null;
    customer_count: string;
  }>(sql`
    SELECT ps.id, ps.name, ps.status, ps.supervisor_name, ps.planned_connections,
      COUNT(c.id) as customer_count
    FROM project_sites ps
    LEFT JOIN customers c ON c.site_id = ps.id
    WHERE ps.project_id = ${projectId}
    GROUP BY ps.id, ps.name, ps.status, ps.supervisor_name, ps.planned_connections
    ORDER BY ps.name
  `);

  const list = rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    supervisorName: row.supervisor_name,
    plannedConnections: row.planned_connections,
    customerCount: Number(row.customer_count),
  }));

  return {
    total: list.length,
    active: list.filter((site) => site.status === "active" || site.status === "in_progress").length,
    list,
  };
}

async function getDprCounts(projectId: string) {
  const db = getDb();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);

  const [[pending], [submittedThisMonth]] = await Promise.all([
    db
      .select({ value: count() })
      .from(dprRecords)
      .where(and(eq(dprRecords.projectId, projectId), ne(dprRecords.status, "approved"))),
    db
      .select({ value: count() })
      .from(dprRecords)
      .where(
        and(
          eq(dprRecords.projectId, projectId),
          gte(dprRecords.date, startOfMonthDate),
          ne(dprRecords.status, "draft"),
        ),
      ),
  ]);

  return { pending: pending.value, submittedThisMonth: submittedThisMonth.value };
}

async function getExpenseTotal(projectId: string) {
  const db = getDb();
  // "Approved" only - matches the Expenses tab's own "Approved" total (§8)
  // rather than counting drafts/pending as money actually spent.
  const [row] = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE status = 'approved' AND (${projectPaymentCondition(projectId)})
  `);

  return { total: Number(row?.total ?? 0) };
}

async function getLowStockAlertCount(projectId: string) {
  const db = getDb();
  // A material "counts" for this project only if it has actually been
  // transacted at one of the project's sites - global warehouse stock that
  // was never allocated here is intentionally excluded (§9, §26: no fake
  // allocation). Low stock itself is still a global fact about the material
  // (materials aren't project-scoped - see the audit), so this reads as
  // "materials this project uses that are currently running low overall".
  const [row] = await db.execute<{ value: string }>(sql`
    SELECT COUNT(DISTINCT m.id) as value
    FROM materials m
    WHERE m.current_balance <= m.reorder_level
    AND EXISTS (
      SELECT 1 FROM material_transactions mt
      JOIN project_sites ps ON ps.id = mt.site_id
      WHERE mt.material_id = m.id AND ps.project_id = ${projectId}
    )
  `);

  return Number(row?.value ?? 0);
}

/** Cheap distinct-people COUNTs for the Overview tab - the full roster is only built when the Team tab opens (projects-team.service.ts). */
async function getTeamCounts(projectId: string) {
  const db = getDb();

  const [[supervisorRow], [plumberRow], [staffCount]] = await Promise.all([
    db.execute<{ value: string }>(sql`
      SELECT COUNT(DISTINCT supervisor_id) as value FROM (
        SELECT supervisor_id FROM project_sites WHERE project_id = ${projectId} AND supervisor_id IS NOT NULL
        UNION
        SELECT supervisor_id FROM customers WHERE project_id = ${projectId} AND supervisor_id IS NOT NULL AND status != 'archived'
      ) distinct_supervisors
    `),
    db.execute<{ value: string }>(sql`
      SELECT COUNT(DISTINCT plumber_id) as value
      FROM customers
      WHERE project_id = ${projectId} AND plumber_id IS NOT NULL AND status != 'archived'
    `),
    db
      .select({ value: count() })
      .from(staff)
      .innerJoin(users, eq(staff.userId, users.id))
      .where(and(eq(staff.assignedProjectId, projectId), eq(users.status, "active"))),
  ]);

  return {
    supervisors: Number(supervisorRow?.value ?? 0),
    plumbers: Number(plumberRow?.value ?? 0),
    staff: staffCount.value,
  };
}

export const projectsSummaryService = {
  async getSummary(projectId: string) {
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new Error("Project not found");

    const [customers, sites, dpr, expenses, lowStockAlerts, team] = await Promise.all([
      getCustomerHealth(projectId),
      getSites(projectId),
      getDprCounts(projectId),
      getExpenseTotal(projectId),
      getLowStockAlertCount(projectId),
      getTeamCounts(projectId),
    ]);

    return {
      project,
      customers,
      sites,
      dpr,
      expenses,
      materials: { lowStockAlerts },
      team,
    };
  },
};
