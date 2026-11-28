import { sql } from "drizzle-orm";
import { getDb } from "@db";
import { accessibleProjectIds } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/**
 * Work progress report: how many customers reached each stage in the period,
 * from the completion dates already stored on the customer (and the LMC pipe
 * records). Stages that only have a yes/no flag (JMR) are counted in the
 * "done so far" totals but can't be placed on a date.
 */

export type ProgressStageKey =
  | "survey"
  | "gi"
  | "gc"
  | "laying"
  | "testing"
  | "valveChamber"
  | "preCommissioning"
  | "connection"
  | "commissioning"
  | "conversion"
  | "jmr";

export const PROGRESS_STAGES: { key: ProgressStageKey; label: string; dated: boolean }[] = [
  { key: "survey", label: "Survey", dated: true },
  { key: "gi", label: "GI", dated: true },
  { key: "gc", label: "GC", dated: true },
  { key: "laying", label: "Laying", dated: true },
  { key: "testing", label: "Testing / Purging", dated: true },
  { key: "valveChamber", label: "Valve chamber", dated: true },
  { key: "preCommissioning", label: "Pre-commissioning", dated: true },
  { key: "connection", label: "Connection", dated: true },
  { key: "commissioning", label: "Commissioning", dated: true },
  { key: "conversion", label: "Conversion", dated: true },
  { key: "jmr", label: "JMR", dated: false },
];

const DATED_STAGES = PROGRESS_STAGES.filter((stage) => stage.dated).map((stage) => stage.key);

/** One customer with the date (yyyy-MM-dd) each stage was reached, or null. */
export type CustomerStageDates = {
  customerId: string;
  projectId: string | null;
  projectName: string | null;
  plumberId: string | null;
  jmrDone: boolean;
  dates: Partial<Record<ProgressStageKey, string | null>>;
};

/** A stored text date ("2026-05-11" or an ISO timestamp) as a date, ignoring anything unparseable. */
function textDate(expr: string) {
  return `CASE WHEN TRIM(COALESCE(${expr}, '')) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(TRIM(${expr}), 10) END`;
}

const TERMINAL_LAYING = "('laying_completed', 'not_required')";
const TERMINAL_TESTING = "('testing_completed', 'not_required')";
const TERMINAL_PURGING = "('purging_completed', 'not_required')";

/**
 * Every customer the viewer can see (optionally one project), with its stage
 * dates. Shared with the Plumbers & Labour report.
 */
export async function loadCustomerStageDates(projectId: string | undefined, currentUser: AuthTokenPayload): Promise<CustomerStageDates[]> {
  const scope = await accessibleProjectIds(currentUser);
  if (scope && !scope.length) return [];
  if (projectId && scope && !scope.includes(projectId)) return [];

  const conditions = [
    projectId ? sql`c.project_id = ${projectId}` : undefined,
    scope ? sql`c.project_id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})` : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const result = await getDb().execute(sql`
    SELECT
      c.id AS "customerId",
      c.project_id AS "projectId",
      p.name AS "projectName",
      c.plumber_id AS "plumberId",
      COALESCE(c.billing_completion->>'jmrDone', '') = 'true' AS "jmrDone",
      ${sql.raw(textDate("c.survey->>'surveyDate'"))} AS "survey",
      ${sql.raw(textDate("c.gi_measurements->'completion'->>'completedAt'"))} AS "gi",
      ${sql.raw(textDate("c.progress_milestones->'gc'->>'completedAt'"))} AS "gc",
      ${sql.raw(textDate("c.progress_milestones->'valveChamber'->>'completedAt'"))} AS "valveChamber",
      ${sql.raw(textDate("c.progress_milestones->'preCommissioning'->>'completedAt'"))} AS "preCommissioning",
      ${sql.raw(textDate("c.progress_milestones->'connection'->>'completedAt'"))} AS "connection",
      ${sql.raw(textDate("c.commissioning_conversion->>'commissioningDate'"))} AS "commissioning",
      ${sql.raw(textDate("c.commissioning_conversion->>'conversionDate'"))} AS "conversion",
      to_char(l.laying, 'YYYY-MM-DD') AS "laying",
      to_char(l.testing, 'YYYY-MM-DD') AS "testing"
    FROM customers c
    LEFT JOIN projects p ON p.id = c.project_id
    LEFT JOIN LATERAL (
      SELECT
        -- Laying is done when every pipe record is laid (or not needed): the last laying date.
        CASE WHEN COUNT(*) > 0 AND BOOL_AND(r.laying_status IN ${sql.raw(TERMINAL_LAYING)})
          THEN MAX(r.laying_date AT TIME ZONE 'Asia/Kolkata')::date END AS laying,
        CASE WHEN COUNT(*) > 0
            AND BOOL_AND(r.testing_status IN ${sql.raw(TERMINAL_TESTING)} AND r.purging_status IN ${sql.raw(TERMINAL_PURGING)})
          THEN MAX(GREATEST(r.testing_date, r.purging_date) AT TIME ZONE 'Asia/Kolkata')::date END AS testing
      FROM customer_lmc_pipe_records r
      WHERE r.customer_id = c.id
    ) l ON TRUE
    ${where}
  `);

  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({
    customerId: String(row.customerId),
    projectId: (row.projectId as string | null) ?? null,
    projectName: (row.projectName as string | null) ?? null,
    plumberId: (row.plumberId as string | null) ?? null,
    jmrDone: Boolean(row.jmrDone),
    dates: Object.fromEntries(DATED_STAGES.map((key) => [key, (row[key] as string | null) ?? null])),
  }));
}

/** Customers whose stage date falls in [from, to] (inclusive, yyyy-MM-dd). */
export function inRange(date: string | null | undefined, from: string, to: string): date is string {
  return Boolean(date) && date! >= from && date! <= to;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // A runaway range (bad input) is cut at ~3 years of days.
  while (cursor <= end && days.length < 1200) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function getProgressReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  const { from, to } = query;
  const customers = await loadCustomerStageDates(query.projectId || undefined, currentUser);

  const emptyCounts = () => Object.fromEntries(PROGRESS_STAGES.map((stage) => [stage.key, 0])) as Record<ProgressStageKey, number>;

  const periodTotals = emptyCounts();
  const doneSoFar = emptyCounts();
  const days = eachDay(from, to);
  const daily = new Map(days.map((day) => [day, emptyCounts()]));
  const byProject = new Map<string, { projectId: string | null; projectName: string; customers: number; counts: Record<ProgressStageKey, number> }>();

  for (const customer of customers) {
    const projectKey = customer.projectId ?? "none";
    const project = byProject.get(projectKey) ?? {
      projectId: customer.projectId,
      projectName: customer.projectName ?? "No project",
      customers: 0,
      counts: emptyCounts(),
    };
    project.customers += 1;
    byProject.set(projectKey, project);

    if (customer.jmrDone) doneSoFar.jmr += 1;
    for (const key of DATED_STAGES) {
      const date = customer.dates[key];
      if (!date) continue;
      if (date <= to) doneSoFar[key] += 1;
      if (inRange(date, from, to)) {
        periodTotals[key] += 1;
        project.counts[key] += 1;
        const day = daily.get(date);
        if (day) day[key] += 1;
      }
    }
  }

  // Who completed work in the period, from the app's stage updates (only
  // updates a supervisor marked "completed").
  const supervisorRows = await loadSupervisorCompletions(query, currentUser);

  return {
    from,
    to,
    stages: PROGRESS_STAGES,
    totalCustomers: customers.length,
    periodTotals,
    doneSoFar,
    daily: days.map((day) => ({ date: day, ...daily.get(day)! })),
    byProject: Array.from(byProject.values()).sort((a, b) => a.projectName.localeCompare(b.projectName)),
    bySupervisor: supervisorRows,
  };
}

const WORK_STAGE_LABEL: Record<string, string> = {
  survey: "Survey",
  workable: "Workable",
  plumbing_gi: "GI",
  gc: "GC",
  commissioning: "Commissioning",
  conversion: "Conversion",
};

async function loadSupervisorCompletions(query: ReportQuery, currentUser: AuthTokenPayload) {
  const scope = await accessibleProjectIds(currentUser);
  if (scope && !scope.length) return [];
  const conditions = [
    sql`w.status = 'completed'`,
    sql`(w.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${query.from}::date AND ${query.to}::date`,
    query.projectId ? sql`c.project_id = ${query.projectId}` : undefined,
    scope ? sql`c.project_id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})` : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const result = await getDb().execute(sql`
    SELECT w.supervisor_id AS "supervisorId", COALESCE(u.name, 'Unknown') AS "name", w.stage AS "stage",
      COUNT(DISTINCT w.customer_id)::int AS "customers"
    FROM work_progress_updates w
    JOIN customers c ON c.id = w.customer_id
    LEFT JOIN users u ON u.id = w.supervisor_id
    WHERE ${sql.join(conditions, sql` AND `)}
    GROUP BY w.supervisor_id, u.name, w.stage
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as {
    supervisorId: string | null;
    name: string;
    stage: string;
    customers: number;
  }[];

  const bySupervisor = new Map<string, { supervisorId: string | null; name: string; total: number; stages: Record<string, number> }>();
  for (const row of rows) {
    const key = row.supervisorId ?? "none";
    const entry = bySupervisor.get(key) ?? { supervisorId: row.supervisorId, name: row.name, total: 0, stages: {} };
    const label = WORK_STAGE_LABEL[row.stage] ?? row.stage;
    entry.stages[label] = (entry.stages[label] ?? 0) + Number(row.customers);
    entry.total += Number(row.customers);
    bySupervisor.set(key, entry);
  }
  return Array.from(bySupervisor.values()).sort((a, b) => b.total - a.total);
}
