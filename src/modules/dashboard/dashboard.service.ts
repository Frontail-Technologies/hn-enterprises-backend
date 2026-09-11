import { and, count, desc, eq, gte, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@db";
import {
  attendance,
  auditLogs,
  bills,
  customers,
  dprRecords,
  materials,
  payments,
  projects,
  projectSites,
  workProgressUpdates,
} from "@db/schema";
import { dashboardStatsService } from "@modules/stats/dashboard-stats.service";
import { projectPaymentCondition } from "@modules/payments/payments.service";

export type DashboardPeriod = "today" | "this-month" | "this-year" | "custom-month" | "custom-year";

export type DashboardOverviewQuery = {
  projectId?: string;
  period?: DashboardPeriod;
  month?: number;
  year?: number;
};

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  helperText: string;
  href: string;
};

const WORKFLOW_METRIC_ITEMS: Array<{ key: string; label: string; helperText: string }> = [
  { key: "total-customers", label: "Total Customers", helperText: "Master records" },
  { key: "survey-done", label: "Survey Done", helperText: "Survey records" },
  { key: "gi-done", label: "GI Done", helperText: "Installation / report" },
  { key: "gc-done", label: "GC Done", helperText: "GC report / evidence" },
  { key: "conversion-done", label: "Conversion Done", helperText: "Customer conversion" },
  { key: "jmr-done", label: "JMR Done", helperText: "Measurement records" },
  { key: "gi-bill-done", label: "GI Bill Done", helperText: "GI invoice completed" },
  { key: "gc-bill-done", label: "GC Bill Done", helperText: "GC invoice completed" },
  { key: "conversion-bill-done", label: "Conversion Bill Done", helperText: "Conversion invoice completed" },
  { key: "connection-remark", label: "Total Connection Remark", helperText: "Sent back / on hold" },
  { key: "total-pbg-assignment", label: "Total PBG Assignment", helperText: "JMR submitted in PBG" },
];

function humanize(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getPeriodRange(period: DashboardPeriod | undefined, month?: number, year?: number) {
  const now = new Date();

  if (period === "today") {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
  }

  if (period === "custom-month" && month && year) {
    return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0, 23, 59, 59) };
  }

  if (period === "custom-year" && year) {
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59) };
  }

  if (period === "this-year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }

  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

async function getFilterProjects() {
  const db = getDb();
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name);
}

async function getProjectsCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(projects)
    .where(projectId ? eq(projects.id, projectId) : undefined);
  return row?.value ?? 0;
}

async function getActiveSitesCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(projectSites)
    .where(
      and(ne(projectSites.status, "not_started"), projectId ? eq(projectSites.projectId, projectId) : undefined),
    );
  return row?.value ?? 0;
}

async function getOverdueBillsCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(bills)
    .where(and(eq(bills.status, "overdue"), projectId ? eq(bills.projectId, projectId) : undefined));
  return row?.value ?? 0;
}

async function getSubmittedBillsCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(bills)
    .where(and(eq(bills.status, "submitted"), projectId ? eq(bills.projectId, projectId) : undefined));
  return row?.value ?? 0;
}

async function getStockAlertsCount() {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(materials)
    .where(lte(materials.currentBalance, materials.reorderLevel));
  return row?.value ?? 0;
}

async function getPendingSurveysCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db.execute<{ value: string }>(sql`
    SELECT COUNT(*) as value
    FROM customers
    WHERE survey->>'approvalStatus' IN ('Submitted', 'In Review', 'Sent Back')
    ${projectId ? sql`AND project_id = ${projectId}` : sql``}
  `);
  return Number(row?.value ?? 0);
}

async function getSubmittedPaymentsCount(projectId: string | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(payments)
    .where(and(eq(payments.status, "submitted"), projectId ? projectPaymentCondition(projectId) : undefined));
  return row?.value ?? 0;
}

async function getBillingPendingAmount(projectId: string | undefined, range: { from: Date; to: Date }) {
  const db = getDb();
  const [row] = await db.execute<{ value: string }>(sql`
    SELECT COALESCE(SUM(total_amount + tax - paid_amount), 0) as value
    FROM bills
    WHERE bill_date >= ${range.from.toISOString()} AND bill_date <= ${range.to.toISOString()}
    ${projectId ? sql`AND project_id = ${projectId}` : sql``}
  `);
  return Number(row?.value ?? 0);
}

async function getMonthlyExpensesAmount(projectId: string | undefined, range: { from: Date; to: Date }) {
  const db = getDb();
  const [row] = await db
    .select({ value: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        eq(payments.status, "approved"),
        gte(payments.paymentDate, range.from),
        lte(payments.paymentDate, range.to),
        projectId ? projectPaymentCondition(projectId) : undefined,
      ),
    );
  return Number(row?.value ?? 0);
}

async function getDprPendingCount(projectId: string | undefined, range: { from: Date; to: Date }) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(dprRecords)
    .where(
      and(
        ne(dprRecords.status, "approved"),
        gte(dprRecords.date, toDateOnly(range.from)),
        lte(dprRecords.date, toDateOnly(range.to)),
        projectId ? eq(dprRecords.projectId, projectId) : undefined,
      ),
    );
  return row?.value ?? 0;
}

async function getFieldUpdatesCount(projectId: string | undefined, range: { from: Date; to: Date }) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(workProgressUpdates)
    .leftJoin(customers, eq(workProgressUpdates.customerId, customers.id))
    .where(
      and(
        gte(workProgressUpdates.createdAt, range.from),
        lte(workProgressUpdates.createdAt, range.to),
        projectId ? eq(customers.projectId, projectId) : undefined,
      ),
    );
  return row?.value ?? 0;
}

async function getAdminMetrics(
  projectId: string | undefined,
  range: { from: Date; to: Date },
  periodParams: { period?: DashboardPeriod; month?: number; year?: number },
): Promise<DashboardMetric[]> {
  const scopeQuery = `projectId=${encodeURIComponent(projectId ?? "all")}`;
  const hrefPeriod =
    periodParams.period === "custom-month"
      ? "this-month"
      : periodParams.period === "custom-year"
        ? "this-year"
        : (periodParams.period ?? "this-month");
  const periodQuery = `${scopeQuery}&period=${encodeURIComponent(hrefPeriod)}`;

  const [
    projectsCount,
    activeSites,
    overdueBills,
    submittedBills,
    stockAlerts,
    pendingSurveys,
    submittedPayments,
    billingPending,
    monthlyExpenses,
    dprPending,
    fieldUpdates,
  ] = await Promise.all([
    getProjectsCount(projectId),
    getActiveSitesCount(projectId),
    getOverdueBillsCount(projectId),
    getSubmittedBillsCount(projectId),
    getStockAlertsCount(),
    getPendingSurveysCount(projectId),
    getSubmittedPaymentsCount(projectId),
    getBillingPendingAmount(projectId, range),
    getMonthlyExpensesAmount(projectId, range),
    getDprPendingCount(projectId, range),
    getFieldUpdatesCount(projectId, range),
  ]);

  const pendingApprovals = pendingSurveys + submittedPayments + submittedBills;

  return [
    {
      id: "total-projects",
      label: "Total Projects",
      value: String(projectsCount),
      helperText: "Across selected scope",
      href: `/dashboard/summary/total-projects?${scopeQuery}`,
    },
    {
      id: "active-sites",
      label: "Active Sites",
      value: String(activeSites),
      helperText: "Field locations",
      href: `/dashboard/summary/active-sites?${scopeQuery}`,
    },
    {
      id: "overdue-bills",
      label: "Overdue Bills",
      value: String(overdueBills),
      helperText: "Past due date",
      href: `/dashboard/summary/overdue-bills?${scopeQuery}`,
    },
    {
      id: "stock-alerts",
      label: "Stock Alerts",
      value: String(stockAlerts),
      helperText: "Low / out of stock",
      href: `/dashboard/summary/stock-alerts?${scopeQuery}`,
    },
    {
      id: "pending-approvals",
      label: "Pending Approvals",
      value: String(pendingApprovals),
      helperText: "Submitted / sent back",
      href: `/dashboard/summary/pending-approvals?${scopeQuery}`,
    },
    {
      id: "billing-pending",
      label: "Billing Pending",
      value: money(billingPending),
      helperText: "Receivable amount",
      href: `/dashboard/summary/billing-pending?${periodQuery}`,
    },
    {
      id: "monthly-expenses",
      label: "Monthly Expenses",
      value: money(monthlyExpenses),
      helperText: "Approved expenses",
      href: `/dashboard/summary/monthly-expenses?${periodQuery}`,
    },
    {
      id: "dpr-pending",
      label: "DPR Pending",
      value: String(dprPending),
      helperText: "Supervisor submissions",
      href: `/dashboard/summary/dpr-pending?${periodQuery}`,
    },
    {
      id: "field-updates",
      label: "Field Updates",
      value: String(fieldUpdates),
      helperText: "Site progress logged",
      href: `/dashboard/summary/field-updates?${periodQuery}`,
    },
  ];
}

async function getWorkflowMetrics(projectId: string | undefined): Promise<DashboardMetric[]> {
  const counts = await dashboardStatsService.getAdminCounts(projectId);
  const totalCustomers = counts["total-customers"] ?? 0;

  return WORKFLOW_METRIC_ITEMS.map(({ key, label, helperText }) => {
    const statValue = counts[key] ?? 0;
    const value = key === "total-customers" ? String(statValue) : `${statValue}/${totalCustomers}`;
    return {
      id: key,
      label,
      value,
      helperText,
      href: `/dashboard/stats/${key}?projectId=${encodeURIComponent(projectId ?? "all")}`,
    };
  });
}

async function getAttendanceSummary() {
  const db = getDb();
  const today = toDateOnly(new Date());

  const [row] = await db
    .select({
      present: sql<number>`count(*) filter (where status = 'present')`,
      late: sql<number>`count(*) filter (where status = 'late')`,
      absent: sql<number>`count(*) filter (where status = 'absent')`,
      leave: sql<number>`count(*) filter (where status = 'leave')`,
    })
    .from(attendance)
    .where(eq(attendance.date, today));

  return [
    { id: "present", label: "Present", value: row?.present ?? 0, helper: "Marked on site" },
    { id: "late", label: "Late", value: row?.late ?? 0, helper: "Late check-in" },
    { id: "absent", label: "Absent", value: row?.absent ?? 0, helper: "Needs review" },
    { id: "leave", label: "Leave", value: row?.leave ?? 0, helper: "Approved leave" },
  ];
}

type DashboardAlert = {
  id: string;
  title: string;
  description: string;
  tone: "warning" | "danger" | "info";
};

async function getAlerts(projectId: string | undefined): Promise<DashboardAlert[]> {
  const db = getDb();

  const [lowStockRows, overdueBillRows, submittedPaymentRows, sentBackRows, submittedDprRows] = await Promise.all([
    db
      .select({
        id: materials.id,
        name: materials.name,
        currentBalance: materials.currentBalance,
        unit: materials.unit,
        reorderLevel: materials.reorderLevel,
      })
      .from(materials)
      .where(lte(materials.currentBalance, materials.reorderLevel))
      .limit(6),
    db
      .select({ id: bills.id, billNumber: bills.billNumber, totalAmount: bills.totalAmount, tax: bills.tax, paidAmount: bills.paidAmount })
      .from(bills)
      .where(and(eq(bills.status, "overdue"), projectId ? eq(bills.projectId, projectId) : undefined))
      .limit(6),
    db
      .select({ id: payments.id, paidTo: payments.paidTo, amount: payments.amount, purpose: payments.purpose, category: payments.category })
      .from(payments)
      .where(and(eq(payments.status, "submitted"), projectId ? projectPaymentCondition(projectId) : undefined))
      .limit(6),
    db.execute<{ id: string; customer_name: string }>(sql`
      SELECT id, customer_name FROM customers
      WHERE survey->>'approvalStatus' = 'Sent Back'
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
      LIMIT 6
    `),
    db
      .select({ id: dprRecords.id, evidence: dprRecords.evidence, siteName: projectSites.name })
      .from(dprRecords)
      .leftJoin(projectSites, eq(dprRecords.siteId, projectSites.id))
      .where(and(eq(dprRecords.status, "submitted"), projectId ? eq(dprRecords.projectId, projectId) : undefined))
      .limit(6),
  ]);

  const alerts: DashboardAlert[] = [
    ...lowStockRows.map((material) => {
      const balance = Number(material.currentBalance);
      return {
        id: `stock-${material.id}`,
        title: `${material.name} needs stock attention`,
        description: `${material.currentBalance} ${material.unit} available (reorder at ${material.reorderLevel})`,
        tone: balance <= 0 ? ("danger" as const) : ("warning" as const),
      };
    }),
    ...overdueBillRows.map((bill) => ({
      id: `bill-${bill.id}`,
      title: `${bill.billNumber} is overdue`,
      description: `${money(Number(bill.totalAmount) + Number(bill.tax) - Number(bill.paidAmount))} pending`,
      tone: "danger" as const,
    })),
    ...submittedPaymentRows.map((payment) => ({
      id: `payment-${payment.id}`,
      title: "Expense awaiting approval",
      description: `${payment.paidTo ?? "Unknown"} submitted ${money(Number(payment.amount))} for ${payment.purpose || humanize(payment.category)}`,
      tone: "warning" as const,
    })),
    ...sentBackRows.map((customer) => ({
      id: `survey-${customer.id}`,
      title: "Survey sent back",
      description: `${customer.customer_name} needs field correction`,
      tone: "warning" as const,
    })),
    ...submittedDprRows.map((record) => ({
      id: `dpr-${record.id}`,
      title: "DPR awaiting admin review",
      description: `${record.evidence?.length ?? 0} photos submitted for ${record.siteName ?? "the site"}`,
      tone: "info" as const,
    })),
  ];

  return alerts.slice(0, 6);
}

type DashboardActivityItem = {
  id: string;
  title: string;
  type: "Work" | "Survey" | "DPR" | "Billing" | "System";
  dateTime: string;
};

async function getRecentActivity(): Promise<DashboardActivityItem[]> {
  const db = getDb();

  const [workRows, dprRows, paymentRows, auditRows] = await Promise.all([
    db
      .select({ id: workProgressUpdates.id, stage: workProgressUpdates.stage, status: workProgressUpdates.status, createdAt: workProgressUpdates.createdAt })
      .from(workProgressUpdates)
      .orderBy(desc(workProgressUpdates.createdAt))
      .limit(6),
    db
      .select({ id: dprRecords.id, status: dprRecords.status, date: dprRecords.date })
      .from(dprRecords)
      .orderBy(desc(dprRecords.date))
      .limit(6),
    db
      .select({ id: payments.id, category: payments.category, status: payments.status, paymentDate: payments.paymentDate })
      .from(payments)
      .orderBy(desc(payments.paymentDate))
      .limit(6),
    db
      .select({ id: auditLogs.id, module: auditLogs.module, action: auditLogs.action, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(6),
  ]);

  const items: DashboardActivityItem[] = [
    ...workRows.map((row) => ({
      id: `work-${row.id}`,
      title: `${humanize(row.stage)} : ${humanize(row.status)}`,
      type: (row.stage === "survey" ? "Survey" : "Work") as "Survey" | "Work",
      dateTime: row.createdAt.toISOString(),
    })),
    ...dprRows.map((row) => ({
      id: `dpr-${row.id}`,
      title: `DPR ${humanize(row.status)}`,
      type: "DPR" as const,
      dateTime: row.date,
    })),
    ...paymentRows.map((row) => ({
      id: `payment-${row.id}`,
      title: `${humanize(row.category)} ${row.status}`,
      type: "Billing" as const,
      dateTime: row.paymentDate.toISOString(),
    })),
    ...auditRows.map((row) => ({
      id: `audit-${row.id}`,
      title: `${row.module} - ${row.action}`,
      type: "System" as const,
      dateTime: row.createdAt.toISOString(),
    })),
  ];

  return items
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
    .slice(0, 6);
}

export const dashboardService = {
  async getOverview(query: DashboardOverviewQuery) {
    const projectId = query.projectId && query.projectId !== "all" ? query.projectId : undefined;
    const range = getPeriodRange(query.period, query.month, query.year);

    const [filterProjects, adminMetrics, workflowMetrics, attendanceSummary, alerts, recentActivity] = await Promise.all([
      getFilterProjects(),
      getAdminMetrics(projectId, range, { period: query.period, month: query.month, year: query.year }),
      getWorkflowMetrics(projectId),
      getAttendanceSummary(),
      getAlerts(projectId),
      getRecentActivity(),
    ]);

    return {
      filters: { projects: filterProjects },
      metrics: [...adminMetrics, ...workflowMetrics],
      attendance: attendanceSummary,
      alerts,
      recentActivity,
    };
  },
};
