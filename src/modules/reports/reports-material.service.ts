import { sql } from "drizzle-orm";
import { getDb } from "@db";
import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/**
 * Material report for a period, from the material transaction history.
 *
 * Store stock = purchases + PBG received - issued to plumbers + returned
 * (the same rule the stock check uses). With plumbers = issued - returned -
 * consumed (+/- adjustments, which are always against a plumber).
 * Reversals and corrections are stored as opposite rows, so sums net out.
 * With a project filter only transactions tagged to that project count, so
 * store figures then mean "for this project" (purchases are often untagged).
 */

export type MaterialReportRow = {
  materialId: string;
  name: string;
  unit: string;
  category: string | null;
  storeOpening: number;
  purchased: number;
  pbgReceived: number;
  issued: number;
  returned: number;
  consumed: number;
  adjusted: number;
  storeClosing: number;
  withPlumbersClosing: number;
  /** Set when plumbers' net holding is below zero: more used / returned than issued. */
  flag: string | null;
};

export type MaterialHoldingRow = {
  plumberId: string;
  plumberName: string;
  category: "plumber" | "labour";
  materialId: string;
  materialName: string;
  unit: string;
  balance: number;
  flag: string | null;
};

export type MaterialReport = {
  /** Counts only: quantities are in different units, so they are never added across materials. */
  totals: { materials: number; movements: number; flagged: number; holders: number; lowStock: number };
  rows: MaterialReportRow[];
  holdings: MaterialHoldingRow[];
};

const NEGATIVE_FLAG = "Used or returned more than issued - check the entries";
const DAY = sql`(t.transaction_date AT TIME ZONE 'Asia/Kolkata')::date`;
const STORE_DELTA = sql`CASE WHEN t.type::text IN ('purchase', 'pbg_issue', 'issue', 'return') THEN t.quantity_delta ELSE 0 END`;
const HELD_DELTA = sql`CASE t.type::text
  WHEN 'issue' THEN t.quantity
  WHEN 'return' THEN -t.quantity
  WHEN 'consumption' THEN -t.quantity
  WHEN 'pbg_consumption' THEN -t.quantity
  WHEN 'adjustment' THEN t.quantity_delta
  ELSE 0 END`;

const n = (value: unknown) => Number(value ?? 0) || 0;
const qty = (value: number) => Math.round(value * 1000) / 1000;

export async function getMaterialReport(query: ReportQuery, currentUser: AuthTokenPayload): Promise<MaterialReport> {
  void currentUser; // admins only (route guard)
  const db = getDb();
  const project = query.projectId ? sql`AND t.project_id = ${query.projectId}::uuid` : sql``;
  const inPeriod = (expr: ReturnType<typeof sql>) =>
    sql`coalesce(sum(CASE WHEN ${DAY} BETWEEN ${query.from}::date AND ${query.to}::date THEN ${expr} ELSE 0 END), 0)`;
  const q = (type: string) => sql`CASE WHEN t.type::text = ${type} THEN t.quantity ELSE 0 END`;

  const [materialRows, holdingRows] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT m.id, m.name, m.unit, m.category,
        coalesce(sum(CASE WHEN ${DAY} < ${query.from}::date THEN ${STORE_DELTA} ELSE 0 END), 0) AS store_opening,
        coalesce(sum(CASE WHEN ${DAY} <= ${query.to}::date THEN ${STORE_DELTA} ELSE 0 END), 0) AS store_closing,
        coalesce(sum(CASE WHEN ${DAY} <= ${query.to}::date THEN ${HELD_DELTA} ELSE 0 END), 0) AS held_closing,
        ${inPeriod(q("purchase"))} AS purchased,
        ${inPeriod(q("pbg_issue"))} AS pbg_received,
        ${inPeriod(q("issue"))} AS issued,
        ${inPeriod(q("return"))} AS returned,
        ${inPeriod(sql`CASE WHEN t.type::text IN ('consumption', 'pbg_consumption') THEN t.quantity ELSE 0 END`)} AS consumed,
        ${inPeriod(sql`CASE WHEN t.type::text = 'adjustment' THEN t.quantity_delta ELSE 0 END`)} AS adjusted,
        count(*) FILTER (WHERE ${DAY} BETWEEN ${query.from}::date AND ${query.to}::date)::int AS movements
      FROM materials m
      JOIN material_transactions t ON t.material_id = m.id ${project}
      GROUP BY m.id, m.name, m.unit, m.category
      ORDER BY m.name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT t.plumber_id, coalesce(p.name, 'Deleted plumber') AS plumber_name, coalesce(p.category::text, 'plumber') AS category,
        m.id AS material_id, m.name AS material_name, m.unit,
        coalesce(sum(${HELD_DELTA}), 0) AS balance
      FROM material_transactions t
      JOIN materials m ON m.id = t.material_id
      LEFT JOIN plumbers p ON p.id = t.plumber_id
      WHERE t.plumber_id IS NOT NULL AND ${DAY} <= ${query.to}::date ${project}
      GROUP BY t.plumber_id, p.name, p.category, m.id, m.name, m.unit
      HAVING abs(coalesce(sum(${HELD_DELTA}), 0)) > 0.0005
      ORDER BY p.name, m.name
    `),
  ]);

  const rows: MaterialReportRow[] = materialRows
    .map((row) => {
      const withPlumbersClosing = qty(n(row.held_closing));
      return {
        materialId: String(row.id),
        name: String(row.name),
        unit: String(row.unit ?? ""),
        category: row.category ?? null,
        storeOpening: qty(n(row.store_opening)),
        purchased: qty(n(row.purchased)),
        pbgReceived: qty(n(row.pbg_received)),
        issued: qty(n(row.issued)),
        returned: qty(n(row.returned)),
        consumed: qty(n(row.consumed)),
        adjusted: qty(n(row.adjusted)),
        storeClosing: qty(n(row.store_closing)),
        withPlumbersClosing,
        flag: withPlumbersClosing < -0.0005 ? NEGATIVE_FLAG : null,
        movements: n(row.movements),
      };
    })
    // Materials with nothing before or during the period add only noise.
    .filter((row) => row.movements > 0 || Math.abs(row.storeClosing) > 0.0005 || Math.abs(row.withPlumbersClosing) > 0.0005)
    .map(({ movements: _movements, ...row }) => row);

  const holdings: MaterialHoldingRow[] = holdingRows.map((row) => {
    const balance = qty(n(row.balance));
    return {
      plumberId: String(row.plumber_id),
      plumberName: String(row.plumber_name),
      category: row.category === "labour" ? "labour" : "plumber",
      materialId: String(row.material_id),
      materialName: String(row.material_name),
      unit: String(row.unit ?? ""),
      balance,
      flag: balance < -0.0005 ? NEGATIVE_FLAG : null,
    };
  });

  const movements = materialRows.reduce((sum, row) => sum + n(row.movements), 0);
  return {
    totals: {
      materials: rows.length,
      movements,
      lowStock: rows.filter((row) => row.storeClosing <= 0.0005 && row.withPlumbersClosing <= 0.0005).length,
      flagged: rows.filter((row) => row.flag).length + holdings.filter((row) => row.flag).length,
      holders: new Set(holdings.filter((row) => row.balance > 0).map((row) => row.plumberId)).size,
    },
    rows,
    holdings,
  };
}
