import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@db";
import { dprRecords, projects, projectSites, staff, users } from "@db/schema";
import { projectPaymentCondition } from "@modules/payments/payments.service";
import { dashboardStatsService } from "@modules/stats/dashboard-stats.service";


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
  const [row] = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE status = 'approved' AND (${projectPaymentCondition(projectId)})
  `);

  return { total: Number(row?.total ?? 0) };
}

/** First number in a free-text measurement ("12.5", "12.5 m", "12 mtr"); 0 when none. */
const giMetres = (key: string) =>
  sql.raw(`COALESCE(SUM(NULLIF(substring(COALESCE(c.gi_measurements->>'${key}', '') from '[0-9]+[.]?[0-9]*'), '')::numeric), 0)`);

/** Work done and billed on the project: LMC metres by pipe size, GI metres, bill amounts. */
async function getWorkTotals(projectId: string) {
  const db = getDb();
  const [lmcRows, [gi], [billing]] = await Promise.all([
    db.execute<{ pipeSize: string; metres: string; customers: number }>(sql`
      SELECT r.pipe_size AS "pipeSize", COALESCE(SUM(r.length_metres), 0) AS metres, COUNT(DISTINCT r.customer_id)::int AS customers
      FROM customer_lmc_pipe_records r
      JOIN customers c ON c.id = r.customer_id
      WHERE c.project_id = ${projectId}
      GROUP BY r.pipe_size
      ORDER BY r.pipe_size
    `),
    db.execute<{ halfInch: string; threeQuarterInch: string; oneInch: string; oneAndHalfInch: string; twoInch: string }>(sql`
      SELECT ${giMetres("totalGiPipeHalfInch")} AS "halfInch",
             ${giMetres("giPipeThreeQuarterInch")} AS "threeQuarterInch",
             ${giMetres("giPipeOneInch")} AS "oneInch",
             ${giMetres("giPipeOneAndHalfInch")} AS "oneAndHalfInch",
             ${giMetres("giPipeTwoInch")} AS "twoInch"
      FROM customers c
      WHERE c.project_id = ${projectId}
    `),
    db.execute<{ bills: number; billed: string; paid: string }>(sql`
      SELECT COUNT(*)::int AS bills,
             COALESCE(SUM(total_amount), 0) AS billed,
             COALESCE(SUM(paid_amount), 0) AS paid
      FROM bills
      WHERE project_id = ${projectId} AND status <> 'draft'
    `),
  ]);

  const giSizes = {
    halfInch: Number(gi?.halfInch ?? 0),
    threeQuarterInch: Number(gi?.threeQuarterInch ?? 0),
    oneInch: Number(gi?.oneInch ?? 0),
    oneAndHalfInch: Number(gi?.oneAndHalfInch ?? 0),
    twoInch: Number(gi?.twoInch ?? 0),
  };
  const lmc = lmcRows.map((row) => ({ pipeSize: row.pipeSize, metres: Number(row.metres), customers: row.customers }));
  const billed = Number(billing?.billed ?? 0);
  const paid = Number(billing?.paid ?? 0);

  return {
    lmc: { bySize: lmc, totalMetres: lmc.reduce((sum, row) => sum + row.metres, 0) },
    gi: { ...giSizes, totalMetres: Object.values(giSizes).reduce((sum, value) => sum + value, 0) },
    billing: { bills: billing?.bills ?? 0, billed, paid, outstanding: Math.max(billed - paid, 0) },
  };
}

async function getLowStockAlertCount(projectId: string) {
  const db = getDb();
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

async function getTeamCounts(projectId: string) {
  const db = getDb();

  const [[supervisorRow], [plumberRow], [staffCount]] = await Promise.all([
    db.execute<{ value: string }>(sql`
      SELECT COUNT(DISTINCT distinct_supervisors.supervisor_id) as value FROM (
        SELECT ${projectSites.supervisorId} as supervisor_id FROM ${projectSites}
        WHERE ${projectSites.projectId} = ${projectId} AND ${projectSites.supervisorId} IS NOT NULL
        UNION
        SELECT ${staff.userId} as supervisor_id FROM ${staff}
        INNER JOIN ${users} ON ${staff.userId} = ${users.id}
        WHERE ${staff.assignedProjectId} = ${projectId}
          AND ${users.role} = 'supervisor' AND ${users.status} = 'active'
      ) distinct_supervisors
      INNER JOIN ${users} ON ${users.id} = distinct_supervisors.supervisor_id
      WHERE ${users.status} = 'active'
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

    const [customers, sites, dpr, expenses, lowStockAlerts, team, work] = await Promise.all([
      getCustomerHealth(projectId),
      getSites(projectId),
      getDprCounts(projectId),
      getExpenseTotal(projectId),
      getLowStockAlertCount(projectId),
      getTeamCounts(projectId),
      getWorkTotals(projectId),
    ]);

    return {
      project,
      customers,
      sites,
      dpr,
      expenses,
      materials: { lowStockAlerts },
      team,
      work,
    };
  },
};
