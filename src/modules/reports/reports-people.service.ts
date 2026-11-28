import { sql } from "drizzle-orm";
import { getDb } from "@db";
import { accessibleProjectIds, accessiblePlumberIds } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";
import { inRange, loadCustomerStageDates, PROGRESS_STAGES, type ProgressStageKey } from "./reports-progress.service";
import type { ReportQuery } from "./reports.types";

/**
 * Plumbers & Labour report: per person, the customers assigned to them, the
 * stages those customers reached in the period, material they took / used /
 * returned in the period, and wages for the months the period touches.
 */

type Row = Record<string, unknown>;
const rowsOf = (result: unknown) => (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Row[];

const DATED = PROGRESS_STAGES.filter((stage) => stage.dated).map((stage) => stage.key);

/** "YYYY-MM" or "MM-YYYY" / "M/YYYY" month text as YYYY-MM (null when unreadable). */
function normalizeMonth(value: string) {
  const text = value.trim();
  let match = /^(\d{4})[-/](\d{1,2})$/.exec(text);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  match = /^(\d{1,2})[-/](\d{4})$/.exec(text);
  if (match) return `${match[2]}-${match[1].padStart(2, "0")}`;
  return null;
}

export async function getPeopleReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  const { from, to } = query;
  const db = getDb();
  const plumberScope = await accessiblePlumberIds(currentUser);
  const projectScope = await accessibleProjectIds(currentUser);
  if (plumberScope && !plumberScope.length) return { from, to, people: [], materials: [] };

  // People: everyone visible, or only those on the chosen project.
  const peopleConditions = [
    plumberScope ? sql`pl.id IN (${sql.join(plumberScope.map((id) => sql`${id}`), sql`, `)})` : undefined,
    query.projectId
      ? sql`(pl.id IN (SELECT pm.plumber_id FROM project_members pm WHERE pm.project_id = ${query.projectId} AND pm.removed_at IS NULL)
             OR pl.id IN (SELECT c.plumber_id FROM customers c WHERE c.project_id = ${query.projectId} AND c.plumber_id IS NOT NULL)
             OR pl.id IN (SELECT mt.plumber_id FROM material_transactions mt WHERE mt.project_id = ${query.projectId} AND mt.plumber_id IS NOT NULL))`
      : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const peopleRows = rowsOf(
    await db.execute(sql`
      SELECT pl.id, pl.name, pl.category, pl.status,
        COALESCE((
          SELECT array_agg(DISTINCT p.name ORDER BY p.name)
          FROM project_members pm JOIN projects p ON p.id = pm.project_id
          WHERE pm.plumber_id = pl.id AND pm.removed_at IS NULL
        ), ARRAY[]::text[]) AS "projectNames"
      FROM plumbers pl
      ${peopleConditions.length ? sql`WHERE ${sql.join(peopleConditions, sql` AND `)}` : sql``}
      ORDER BY pl.name
    `),
  );

  // Stages reached in the period by each person's assigned customers.
  const customers = await loadCustomerStageDates(query.projectId || undefined, currentUser);
  const work = new Map<string, { assigned: number; stages: Record<ProgressStageKey, number>; done: number }>();
  for (const customer of customers) {
    if (!customer.plumberId) continue;
    const entry =
      work.get(customer.plumberId) ??
      { assigned: 0, done: 0, stages: Object.fromEntries(PROGRESS_STAGES.map((stage) => [stage.key, 0])) as Record<ProgressStageKey, number> };
    entry.assigned += 1;
    for (const key of DATED) {
      if (inRange(customer.dates[key], from, to)) {
        entry.stages[key] += 1;
        entry.done += 1;
      }
    }
    work.set(customer.plumberId, entry);
  }

  // Material in the period, per person and material (same rules as the plumber balance).
  const materialConditions = [
    sql`mt.plumber_id IS NOT NULL`,
    sql`(mt.transaction_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${from}::date AND ${to}::date`,
    query.projectId ? sql`mt.project_id = ${query.projectId}` : undefined,
    projectScope
      ? projectScope.length
        ? sql`mt.project_id IN (${sql.join(projectScope.map((id) => sql`${id}`), sql`, `)})`
        : sql`FALSE`
      : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const materialRows = rowsOf(
    await db.execute(sql`
      SELECT mt.plumber_id AS "plumberId", m.id AS "materialId", m.name AS "materialName", m.unit AS "unit",
        COALESCE(SUM(CASE WHEN mt.type = 'issue' THEN mt.quantity ELSE 0 END), 0)::float AS "issued",
        COALESCE(SUM(CASE WHEN mt.type IN ('consumption', 'pbg_consumption') THEN mt.quantity ELSE 0 END), 0)::float AS "consumed",
        COALESCE(SUM(CASE WHEN mt.type = 'return' THEN mt.quantity ELSE 0 END), 0)::float AS "returned",
        COALESCE(SUM(CASE WHEN mt.type = 'adjustment' THEN mt.quantity_delta ELSE 0 END), 0)::float AS "adjusted",
        COUNT(*)::int AS "entries"
      FROM material_transactions mt
      JOIN materials m ON m.id = mt.material_id
      WHERE ${sql.join(materialConditions, sql` AND `)}
      GROUP BY mt.plumber_id, m.id, m.name, m.unit
    `),
  );
  const materialEntries = new Map<string, number>();
  for (const row of materialRows) {
    const id = String(row.plumberId);
    materialEntries.set(id, (materialEntries.get(id) ?? 0) + Number(row.entries));
  }

  // Wages for the months the period touches.
  const months = new Set<string>();
  for (let cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); cursor.toISOString().slice(0, 7) <= to.slice(0, 7) && months.size < 60; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.add(cursor.toISOString().slice(0, 7));
  }
  const wageRows = rowsOf(
    await db.execute(sql`SELECT plumber_id AS "plumberId", month, wage_rate::float AS "wageRate", days_worked::float AS "daysWorked", pf::float AS pf, esic::float AS esic FROM wage_records`),
  );
  const wages = new Map<string, { days: number; net: number }>();
  for (const row of wageRows) {
    const month = normalizeMonth(String(row.month ?? ""));
    if (!month || !months.has(month)) continue;
    const id = String(row.plumberId);
    const basic = Math.round(Number(row.wageRate) * Number(row.daysWorked));
    const entry = wages.get(id) ?? { days: 0, net: 0 };
    entry.days += Number(row.daysWorked);
    entry.net += basic - Number(row.pf) - Number(row.esic);
    wages.set(id, entry);
  }

  const people = peopleRows.map((row) => {
    const id = String(row.id);
    const done = work.get(id);
    const wage = wages.get(id);
    return {
      id,
      name: String(row.name ?? ""),
      category: row.category === "labour" ? ("labour" as const) : ("plumber" as const),
      status: String(row.status ?? "active"),
      projectNames: (row.projectNames as string[] | null) ?? [],
      assignedCustomers: done?.assigned ?? 0,
      stagesDone: done?.done ?? 0,
      stages: done?.stages ?? null,
      materialEntries: materialEntries.get(id) ?? 0,
      daysWorked: wage?.days ?? 0,
      netWages: wage?.net ?? 0,
    };
  });

  const names = new Map(people.map((person) => [person.id, person.name]));
  const materials = materialRows.map((row) => {
    const issued = Number(row.issued);
    const consumed = Number(row.consumed);
    const returned = Number(row.returned);
    const adjusted = Number(row.adjusted);
    return {
      plumberId: String(row.plumberId),
      plumberName: names.get(String(row.plumberId)) ?? "Unknown",
      materialId: String(row.materialId),
      materialName: String(row.materialName ?? ""),
      unit: String(row.unit ?? ""),
      issued,
      consumed,
      returned,
      adjusted,
      /** Net change for the period (not the all-time balance). */
      net: issued - consumed - returned + adjusted,
    };
  });

  return { from, to, months: Array.from(months), stages: PROGRESS_STAGES.filter((stage) => stage.dated), people, materials };
}
