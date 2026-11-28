import { sql } from "drizzle-orm";
import { getDb } from "@db";
import { bills } from "@db/schema";
import { NET_PAYABLE_SQL } from "@modules/bills/bills.service";
import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/**
 * Billing report. Bills are picked by bill date (created date when a bill has
 * none) inside the period; "received" is money that came in during the
 * period by payment date (bounced payments left out), on any bill of the
 * selected project(s). Pending / overdue / ageing are as of today for the
 * bills in the period.
 */

type Money = number;

export type BillingReportTotals = {
  bills: number;
  billed: Money; // total + tax
  tdsIncome: Money;
  tdsGst: Money;
  prs: Money;
  bgKept: Money;
  bgReleased: Money;
  holdKept: Money;
  holdReleased: Money;
  netPayable: Money;
  paidOnBills: Money; // everything paid so far against these bills
  pending: Money;
  overdue: Money;
  receivedInPeriod: Money; // payments dated inside the period (any bill)
};

export type BillingReportProjectRow = {
  projectId: string;
  projectName: string;
  bills: number;
  billed: Money;
  deductions: Money; // TDS + PRS
  held: Money; // BG + hold still kept back
  netPayable: Money;
  paid: Money;
  pending: Money;
  overdue: Money;
};

export type BillingReportMonth = { month: string; billed: Money; received: Money };

export type BillingReportAgeing = { bucket: "not_due" | "0_30" | "31_60" | "61_90" | "90_plus"; label: string; bills: number; amount: Money };

export type BillingReport = {
  totals: BillingReportTotals;
  projects: BillingReportProjectRow[];
  months: BillingReportMonth[];
  ageing: BillingReportAgeing[];
};

// Calendar days in India time (timestamps are stored in UTC).
const BILL_DAY = sql`(coalesce(${bills.billDate}, ${bills.createdAt}) AT TIME ZONE 'Asia/Kolkata')`;
const TODAY = sql`(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const DUE_DAY = sql`(${bills.dueDate} AT TIME ZONE 'Asia/Kolkata')::date`;

const n = (value: unknown) => Number(value ?? 0) || 0;
const round = (value: number) => Math.round(value * 100) / 100;

export async function getBillingReport(query: ReportQuery, currentUser: AuthTokenPayload): Promise<BillingReport> {
  void currentUser; // admins only (route guard); no project scoping needed
  const db = getDb();
  const projectFilter = query.projectId ? sql`AND ${bills.projectId} = ${query.projectId}::uuid` : sql``;
  const inPeriod = sql`(${BILL_DAY})::date BETWEEN ${query.from}::date AND ${query.to}::date ${projectFilter}`;
  const pendingExpr = sql`(${NET_PAYABLE_SQL} - ${bills.paidAmount})`;
  const overdueExpr = sql`CASE WHEN ${bills.dueDate} IS NOT NULL AND ${DUE_DAY} < ${TODAY} AND ${pendingExpr} > 0.005 THEN ${pendingExpr} ELSE 0 END`;

  const [totalsRows, projectRows, billedMonths, receivedMonths, ageingRows, receivedRows] = await Promise.all([
    db.execute<Record<string, string>>(sql`
      SELECT count(*)::int AS bills,
        coalesce(sum(${bills.totalAmount} + ${bills.tax}), 0) AS billed,
        coalesce(sum(${bills.tdsIncome}), 0) AS tds_income,
        coalesce(sum(${bills.tdsGst}), 0) AS tds_gst,
        coalesce(sum(${bills.prs}), 0) AS prs,
        coalesce(sum(${bills.bankGuarantee}), 0) AS bg_kept,
        coalesce(sum(${bills.bgReleased}), 0) AS bg_released,
        coalesce(sum(${bills.holdAmount}), 0) AS hold_kept,
        coalesce(sum(${bills.holdReleased}), 0) AS hold_released,
        coalesce(sum(${NET_PAYABLE_SQL}), 0) AS net_payable,
        coalesce(sum(${bills.paidAmount}), 0) AS paid,
        coalesce(sum(GREATEST(${pendingExpr}, 0)), 0) AS pending,
        coalesce(sum(${overdueExpr}), 0) AS overdue
      FROM ${bills} WHERE ${inPeriod}
    `),
    db.execute<Record<string, string>>(sql`
      SELECT ${bills.projectId} AS project_id, coalesce(p.name, 'Unknown project') AS project_name,
        count(*)::int AS bills,
        coalesce(sum(${bills.totalAmount} + ${bills.tax}), 0) AS billed,
        coalesce(sum(${bills.tdsIncome} + ${bills.tdsGst} + ${bills.prs}), 0) AS deductions,
        coalesce(sum((${bills.bankGuarantee} - ${bills.bgReleased}) + (${bills.holdAmount} - ${bills.holdReleased})), 0) AS held,
        coalesce(sum(${NET_PAYABLE_SQL}), 0) AS net_payable,
        coalesce(sum(${bills.paidAmount}), 0) AS paid,
        coalesce(sum(GREATEST(${pendingExpr}, 0)), 0) AS pending,
        coalesce(sum(${overdueExpr}), 0) AS overdue
      FROM ${bills} LEFT JOIN projects p ON p.id = ${bills.projectId}
      WHERE ${inPeriod}
      GROUP BY ${bills.projectId}, p.name
      ORDER BY sum(${bills.totalAmount} + ${bills.tax}) DESC
    `),
    db.execute<Record<string, string>>(sql`
      SELECT to_char(date_trunc('month', ${BILL_DAY}), 'YYYY-MM') AS month,
        coalesce(sum(${bills.totalAmount} + ${bills.tax}), 0) AS amount
      FROM ${bills} WHERE ${inPeriod}
      GROUP BY 1
    `),
    db.execute<Record<string, string>>(sql`
      SELECT to_char(date_trunc('month', bp.payment_date AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month, coalesce(sum(bp.amount), 0) AS amount
      FROM bill_payments bp JOIN ${bills} ON ${bills.id} = bp.bill_id
      WHERE bp.status <> 'bounced' AND (bp.payment_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${query.from}::date AND ${query.to}::date ${projectFilter}
      GROUP BY 1
    `),
    db.execute<Record<string, string>>(sql`
      SELECT bucket, count(*)::int AS bills, coalesce(sum(pending), 0) AS amount FROM (
        SELECT ${pendingExpr} AS pending,
          CASE
            WHEN ${bills.dueDate} IS NOT NULL AND ${DUE_DAY} >= ${TODAY} THEN 'not_due'
            WHEN ${TODAY} - coalesce(${DUE_DAY}, (${BILL_DAY})::date) <= 30 THEN '0_30'
            WHEN ${TODAY} - coalesce(${DUE_DAY}, (${BILL_DAY})::date) <= 60 THEN '31_60'
            WHEN ${TODAY} - coalesce(${DUE_DAY}, (${BILL_DAY})::date) <= 90 THEN '61_90'
            ELSE '90_plus'
          END AS bucket
        FROM ${bills} WHERE ${inPeriod} AND ${pendingExpr} > 0.005
      ) aged GROUP BY bucket
    `),
    db.execute<Record<string, string>>(sql`
      SELECT coalesce(sum(bp.amount), 0) AS amount
      FROM bill_payments bp JOIN ${bills} ON ${bills.id} = bp.bill_id
      WHERE bp.status <> 'bounced' AND (bp.payment_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${query.from}::date AND ${query.to}::date ${projectFilter}
    `),
  ]);

  const t = totalsRows[0] ?? {};
  const totals: BillingReportTotals = {
    bills: n(t.bills),
    billed: round(n(t.billed)),
    tdsIncome: round(n(t.tds_income)),
    tdsGst: round(n(t.tds_gst)),
    prs: round(n(t.prs)),
    bgKept: round(n(t.bg_kept)),
    bgReleased: round(n(t.bg_released)),
    holdKept: round(n(t.hold_kept)),
    holdReleased: round(n(t.hold_released)),
    netPayable: round(n(t.net_payable)),
    paidOnBills: round(n(t.paid)),
    pending: round(n(t.pending)),
    overdue: round(n(t.overdue)),
    receivedInPeriod: round(n(receivedRows[0]?.amount)),
  };

  const projects: BillingReportProjectRow[] = projectRows.map((row) => ({
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    bills: n(row.bills),
    billed: round(n(row.billed)),
    deductions: round(n(row.deductions)),
    held: round(n(row.held)),
    netPayable: round(n(row.net_payable)),
    paid: round(n(row.paid)),
    pending: round(n(row.pending)),
    overdue: round(n(row.overdue)),
  }));

  // Every month of the period, so the chart has no gaps.
  const billedBy = new Map(billedMonths.map((row) => [String(row.month), n(row.amount)]));
  const receivedBy = new Map(receivedMonths.map((row) => [String(row.month), n(row.amount)]));
  const months: BillingReportMonth[] = monthsBetween(query.from, query.to).map((month) => ({
    month,
    billed: round(billedBy.get(month) ?? 0),
    received: round(receivedBy.get(month) ?? 0),
  }));

  const AGEING: Array<{ bucket: BillingReportAgeing["bucket"]; label: string }> = [
    { bucket: "not_due", label: "Not due yet" },
    { bucket: "0_30", label: "0-30 days" },
    { bucket: "31_60", label: "31-60 days" },
    { bucket: "61_90", label: "61-90 days" },
    { bucket: "90_plus", label: "90+ days" },
  ];
  const ageingBy = new Map(ageingRows.map((row) => [String(row.bucket), row]));
  const ageing = AGEING.map(({ bucket, label }) => ({
    bucket,
    label,
    bills: n(ageingBy.get(bucket)?.bills),
    amount: round(n(ageingBy.get(bucket)?.amount)),
  }));

  return { totals, projects, months, ageing };
}

/** "YYYY-MM" for every month from `from` to `to` (inclusive); at most 36. */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return [];
  const result: string[] = [];
  let year = fy;
  let month = fm;
  while ((year < ty || (year === ty && month <= tm)) && result.length < 36) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}
