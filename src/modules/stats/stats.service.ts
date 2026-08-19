import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, customers, users } from "@db/schema";
import { buildCustomerCompletionAudit, type CustomerCompletionAudit, customerStatCondition } from "@modules/customers/customer-completion";
import { buildPaginationMeta, parsePagination } from "@utils";
import type { AuthTokenPayload } from "@types";
import type { SupervisorStat, SupervisorStatDetailRow, SupervisorStatId, SupervisorStatTone } from "./stats.types";

// Roles that are meant to see system-wide customer stats. Everyone else is
// scoped to the customers assigned to them, so a supervisor never sees global
// counts on their device.
const GLOBAL_STATS_ROLES = new Set(["super_admin", "admin"]);

function supervisorScope(currentUser: AuthTokenPayload | null): string | undefined {
  if (!currentUser) return undefined;
  return GLOBAL_STATS_ROLES.has(currentUser.role) ? undefined : currentUser.id;
}

const STAT_DEFINITIONS: Record<SupervisorStatId, { label: string; suffix: string; tone: SupervisorStatTone }> = {
  "survey-done": { label: "Survey Done", suffix: "Customers", tone: "green" },
  "conversion-done": { label: "Conversion Done", suffix: "Customers", tone: "orange" },
  "gi-done": { label: "GI Done", suffix: "Customers", tone: "blue" },
  "jmr-done": { label: "JMR Done", suffix: "Customers", tone: "blue" },
  "gc-done": { label: "GC Done", suffix: "Customers", tone: "orange" },
  "site-expenses-done": { label: "Site Expenses Done", suffix: "Customers", tone: "red" },
  laying: { label: "Laying", suffix: "Customers", tone: "blue" },
  "flushing-testing": { label: "Flushing / Testing", suffix: "Customers", tone: "blue" },
  "valve-chamber": { label: "Valve Chamber", suffix: "Customers", tone: "orange" },
  "pre-commissioning": { label: "Pre Commissioning", suffix: "Customers", tone: "green" },
  commissioning: { label: "Commissioning", suffix: "Customers", tone: "green" },
  dpr: { label: "DPR", suffix: "Completed", tone: "blue" },
  planning: { label: "Planning", suffix: "Plans", tone: "orange" },
  "pole-marker": { label: "Pole Marker", suffix: "Customers", tone: "blue" },
  "route-marker": { label: "Route Marker", suffix: "Customers", tone: "blue" },
  "complaint-customer": { label: "Complaint Customer", suffix: "Open", tone: "red" },
  "total-pbg-assignment": { label: "Total PBG Assignment", suffix: "Assigned", tone: "blue" },
  "total-connection-done": { label: "Total Connection Done", suffix: "Customers", tone: "green" },
  "total-connection-remark": { label: "Total Connection Remark", suffix: "Customers", tone: "orange" },
  "needs-attention": { label: "Needs Attention", suffix: "On Hold", tone: "red" },
  "total-conversion-done": { label: "Total Conversion Done", suffix: "Customers", tone: "green" },
  "customer-resolve": { label: "Customer Resolve", suffix: "Customers", tone: "blue" },
};

const STAT_ORDER: SupervisorStatId[] = [
  "survey-done",
  "conversion-done",
  "gi-done",
  "jmr-done",
  "gc-done",
  "site-expenses-done",
  "laying",
  "flushing-testing",
  "valve-chamber",
  "pre-commissioning",
  "commissioning",
  "dpr",
  "planning",
  "pole-marker",
  "route-marker",
  "complaint-customer",
  "total-pbg-assignment",
  "total-connection-done",
  "total-connection-remark",
  "needs-attention",
  "total-conversion-done",
  "customer-resolve",
];

// "Total Conversion Done" is a UI-label alias of "conversion-done" - same
// canonical condition, kept as its own card only because it already shipped
// under this id; not a second source of truth (see CUSTOMER_STAT_KEY below,
// where both ids map to the same "conversion-done" canonical key).
const HIDDEN_STAT_IDS = new Set<SupervisorStatId>(["total-conversion-done"]);

const VISIBLE_STAT_ORDER: SupervisorStatId[] = STAT_ORDER.filter((id) => !HIDDEN_STAT_IDS.has(id));

// Counts that aren't a subset of the customer base (DPR records, site plans)
// are shown as a bare number; every other stat is a customer count and shown
// as "x/total".
const BARE_COUNT_STAT_IDS = new Set<SupervisorStatId>(["dpr", "planning"]);

function isStatId(value: string): value is SupervisorStatId {
  return (STAT_ORDER as string[]).includes(value);
}

// Maps every mobile-visible customer stat to its canonical STAT_CONDITION_SQL
// key in customer-completion.ts - the exact same resolver the web dashboard
// summary and drill-down already share. This is the single place mobile and
// web can ever disagree, and it's a straight lookup, not a reimplementation -
// do not add bespoke per-field predicates back into this file.
const CUSTOMER_STAT_KEY: Partial<Record<SupervisorStatId, string>> = {
  "survey-done": "survey-done",
  "gi-done": "gi-done",
  "gc-done": "gc-done",
  "conversion-done": "conversion-done",
  "total-conversion-done": "conversion-done",
  "jmr-done": "jmr-done",
  "total-pbg-assignment": "total-pbg-assignment",
  "site-expenses-done": "site-expenses-done",
  laying: "laying-done",
  "flushing-testing": "flushing-testing-done",
  "valve-chamber": "valve-chamber-done",
  "pre-commissioning": "pre-commissioning-done",
  commissioning: "commissioning",
  "pole-marker": "pole-marker-done",
  "route-marker": "route-marker-done",
  "total-connection-done": "connection-done",
  // BUSINESS-CONFIRMATION-PENDING: mapped to billingCompletion.remark, the
  // closest existing field - see customer-completion.ts's STAT_CONDITION_SQL.
  "total-connection-remark": "total-connection-remark",
  // The condition this id used to (incorrectly) carry under "Total Connection
  // Remark" - an on-hold / sent-back / rejected workflow flag, not a remark.
  "needs-attention": "connection-remark",
  "complaint-customer": "complaint-customer",
  "customer-resolve": "customer-resolved",
};

const CUSTOMER_STAT_ENTRIES = Object.entries(CUSTOMER_STAT_KEY) as [SupervisorStatId, string][];

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function latestDate(dates: (string | Date | null | undefined)[]) {
  const valid = dates.map((d) => toIso(d)).filter((d): d is string => Boolean(d)).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

async function fetchDprDetailRows() {
  const db = getDb();
  const rows = await db.query.dprRecords.findMany({
    with: { project: true, site: true },
    orderBy: (fields, { desc: descOrder }) => [descOrder(fields.date)],
  });

  return rows.map((record) => ({
    id: record.id,
    title: record.site?.name ?? "Site",
    reference: record.project?.name ?? "-",
    site: record.site?.name ?? "-",
    address: record.site?.address || "-",
    status:
      record.status === "approved" ? ("Done" as const) : record.status === "submitted" ? ("In Progress" as const) : ("Pending" as const),
    updatedOn: record.date,
    helper: record.remarks || `${record.tasks.length} task(s) logged`,
  }));
}

async function fetchPlanningDetailRows() {
  const db = getDb();
  const rows = await db.query.sitePlans.findMany({
    with: { project: true, site: true },
    orderBy: (fields, { desc: descOrder }) => [descOrder(fields.date)],
  });

  return rows.map((record) => ({
    id: record.id,
    title: record.site?.name ?? "Site",
    reference: record.project?.name ?? "-",
    site: record.site?.name ?? "-",
    address: record.site?.address || "-",
    status: "Planned" as const,
    updatedOn: record.date,
    helper: `${record.tasks.length} task(s) planned`,
  }));
}

type CustomerRow = Awaited<ReturnType<typeof fetchMatchingCustomers>>[number];
type LatestComplaint = { status: string; createdAt: Date | string; resolvedAt: Date | string | null; supervisorRemark: string | null };

async function fetchMatchingCustomers(scopeId: string | undefined, canonicalKey: string) {
  const db = getDb();
  const conditions = [
    scopeId ? eq(customers.supervisorId, scopeId) : undefined,
    customerStatCondition(canonicalKey),
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const where = conditions.length ? and(...conditions) : undefined;

  return db.query.customers.findMany({
    where,
    with: { site: true, lmcPipeRecords: true },
  });
}

async function fetchLatestComplaintByCustomer(customerIds: string[]) {
  if (!customerIds.length) return new Map<string, LatestComplaint>();
  const db = getDb();
  const rows = await db.query.complaints.findMany({
    where: inArray(complaints.customerId, customerIds),
    orderBy: (fields, { desc: descOrder }) => [descOrder(fields.createdAt)],
  });

  const latestByCustomer = new Map<string, LatestComplaint>();
  for (const row of rows) {
    if (!latestByCustomer.has(row.customerId)) {
      latestByCustomer.set(row.customerId, {
        status: row.status,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        supervisorRemark: row.supervisorRemark,
      });
    }
  }
  return latestByCustomer;
}

function buildDetailRow(
  customer: CustomerRow,
  statId: SupervisorStatId,
  audit: CustomerCompletionAudit,
  latestComplaint: LatestComplaint | null,
): SupervisorStatDetailRow {
  const base = {
    id: `${statId}-${customer.id}`,
    customerId: customer.id,
    title: customer.customerName,
    reference: customer.trBpNumber,
    site: customer.site?.name ?? customer.city ?? "-",
    address: customer.fullAddress || "-",
    updatedOn: toIso(customer.createdAt),
  };

  switch (statId) {
    case "survey-done":
      return {
        ...base,
        status: "Done",
        updatedOn: customer.survey?.surveyDate || base.updatedOn,
        helper: customer.survey?.workableStatus ?? "-",
      };

    case "gi-done":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.giCompletedOn || base.updatedOn,
        helper: audit.giCompletedBy
          ? `Completed by ${audit.giCompletedBy}`
          : customer.billingCompletion?.giBillDone
            ? "Via GI Bill Done"
            : "-",
      };

    case "gc-done":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.gcCompletedOn || base.updatedOn,
        helper: audit.gcCompletedBy
          ? `Completed by ${audit.gcCompletedBy}`
          : customer.billingCompletion?.gcBillDone
            ? "Via GC Bill Done"
            : "-",
      };

    case "conversion-done":
    case "total-conversion-done":
      return {
        ...base,
        status: "Done",
        updatedOn: customer.commissioningConversion?.conversionDate || base.updatedOn,
        helper: customer.commissioningConversion?.conversionDate
          ? customer.commissioningConversion?.meterNo || "-"
          : customer.billingCompletion?.conversionBillDone
            ? "Via Conversion Bill Done"
            : "-",
      };

    case "jmr-done":
      return {
        ...base,
        status: "Done",
        helper: customer.billingCompletion?.jmrSubmittedInPbg ? "Submitted in PBG" : "Not submitted",
      };

    case "total-pbg-assignment":
      return { ...base, status: "Done", helper: "Submitted" };

    case "commissioning":
      return {
        ...base,
        status: "Done",
        updatedOn: customer.commissioningConversion?.commissioningDate || base.updatedOn,
        helper: customer.commissioningConversion?.meterNo || "-",
      };

    case "site-expenses-done":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.siteExpensesCompletedOn || base.updatedOn,
        helper: audit.siteExpensesCompletedBy ? `Completed by ${audit.siteExpensesCompletedBy}` : "-",
      };

    case "valve-chamber":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.valveChamberCompletedOn || base.updatedOn,
        helper: audit.valveChamberCompletedBy ? `Completed by ${audit.valveChamberCompletedBy}` : "-",
      };

    case "pre-commissioning":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.preCommissioningCompletedOn || base.updatedOn,
        helper: audit.preCommissioningCompletedBy ? `Completed by ${audit.preCommissioningCompletedBy}` : "-",
      };

    case "pole-marker":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.poleMarkerCompletedOn || base.updatedOn,
        helper: audit.poleMarkerCompletedBy ? `Completed by ${audit.poleMarkerCompletedBy}` : "-",
      };

    case "route-marker":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.routeMarkerCompletedOn || base.updatedOn,
        helper: audit.routeMarkerCompletedBy ? `Completed by ${audit.routeMarkerCompletedBy}` : "-",
      };

    case "total-connection-done":
      return {
        ...base,
        status: "Done",
        updatedOn: audit.connectionCompletedOn || base.updatedOn,
        helper: customer.commissioningConversion?.meterNo || "-",
      };

    case "laying": {
      const dates = customer.lmcPipeRecords.map((pipe) => pipe.layingDate);
      return {
        ...base,
        status: "Done",
        updatedOn: latestDate(dates) || base.updatedOn,
        helper: customer.lmcPipeRecords.map((pipe) => pipe.pipeSize).join(", ") || "-",
      };
    }

    case "flushing-testing": {
      const dates = customer.lmcPipeRecords.flatMap((pipe) => [pipe.testingDate, pipe.purgingDate]);
      return {
        ...base,
        status: "Done",
        updatedOn: latestDate(dates) || base.updatedOn,
        helper: customer.lmcPipeRecords.map((pipe) => pipe.pipeSize).join(", ") || "-",
      };
    }

    case "total-connection-remark":
      return { ...base, status: "Done", helper: customer.billingCompletion?.remark || "-" };

    case "needs-attention": {
      const reason =
        customer.status === "on_hold"
          ? "Customer on hold"
          : customer.survey?.approvalStatus === "Sent Back" || customer.survey?.approvalStatus === "Rejected"
            ? `Survey ${customer.survey.approvalStatus}`
            : "LMC pipe on hold";
      return { ...base, status: "On Hold", helper: reason };
    }

    case "complaint-customer":
      return {
        ...base,
        status: latestComplaint?.status === "in_progress" ? "In Progress" : "Pending",
        updatedOn: latestComplaint ? toIso(latestComplaint.createdAt) : base.updatedOn,
        helper: latestComplaint?.supervisorRemark || "-",
      };

    case "customer-resolve":
      return {
        ...base,
        status: "Done",
        updatedOn: latestComplaint?.resolvedAt ? toIso(latestComplaint.resolvedAt) : base.updatedOn,
        helper: latestComplaint?.supervisorRemark || "-",
      };

    default:
      return { ...base, status: "Done", helper: "-" };
  }
}

const COMPLAINT_BASED_STAT_IDS = new Set<SupervisorStatId>(["complaint-customer", "customer-resolve"]);

export const statsService = {
  async getSummary(currentUser: AuthTokenPayload | null): Promise<SupervisorStat[]> {
    const scopeId = supervisorScope(currentUser);
    const db = getDb();

    const scope = scopeId ? sql`WHERE supervisor_id = ${scopeId}` : sql``;

    // One SQL query, one condition per stat, all sourced from the same
    // canonical registry the web dashboard uses - see dashboard-stats.service.ts's
    // getAdminCounts for the identical pattern (project/site/city-scoped there,
    // supervisor-scoped here).
    const filters = CUSTOMER_STAT_ENTRIES.map(([mobileId, canonicalKey]) => {
      const alias = sql.raw(mobileId.replace(/-/g, "_"));
      const condition = customerStatCondition(canonicalKey) ?? sql`FALSE`;
      return sql`COUNT(*) FILTER (WHERE ${condition}) AS ${alias}`;
    });

    const [countsResult, dprRows, planningRows] = await Promise.all([
      db.execute<Record<string, string>>(sql`
        SELECT COUNT(*) AS total_customers, ${sql.join(filters, sql`, `)}
        FROM customers
        ${scope}
      `),
      fetchDprDetailRows(),
      fetchPlanningDetailRows(),
    ]);

    const row = countsResult[0];
    const totalCustomers = Number(row.total_customers);

    const counts: Partial<Record<SupervisorStatId, number>> = {};
    for (const [mobileId] of CUSTOMER_STAT_ENTRIES) {
      counts[mobileId] = Number(row[mobileId.replace(/-/g, "_")]);
    }
    counts["dpr"] = dprRows.filter((r) => r.status === "Done").length;
    counts["planning"] = planningRows.length;

    return VISIBLE_STAT_ORDER.map((statId) => {
      const definition = STAT_DEFINITIONS[statId];
      const count = counts[statId] ?? 0;
      const value = BARE_COUNT_STAT_IDS.has(statId) ? String(count) : `${count}/${totalCustomers}`;
      return { id: statId, label: definition.label, value, suffix: definition.suffix, tone: definition.tone };
    });
  },

  async getDetails(type: string, query: { page?: string; limit?: string } = {}, currentUser: AuthTokenPayload | null = null) {
    if (!isStatId(type)) throw new Error("Stat not found");
    const scopeId = supervisorScope(currentUser);

    let allRows: SupervisorStatDetailRow[];

    if (type === "dpr") {
      allRows = await fetchDprDetailRows();
    } else if (type === "planning") {
      allRows = await fetchPlanningDetailRows();
    } else {
      const canonicalKey = CUSTOMER_STAT_KEY[type];
      if (!canonicalKey) throw new Error("Stat not found");

      const db = getDb();
      const [matchingCustomers, userRows] = await Promise.all([
        fetchMatchingCustomers(scopeId, canonicalKey),
        db.select({ id: users.id, name: users.name }).from(users),
      ]);

      const userNames = new Map(userRows.map((u) => [u.id, u.name]));
      const resolveUserName = (id: string | null | undefined) => (id ? (userNames.get(id) ?? id) : null);

      const latestComplaintByCustomer = COMPLAINT_BASED_STAT_IDS.has(type)
        ? await fetchLatestComplaintByCustomer(matchingCustomers.map((c) => c.id))
        : null;

      allRows = matchingCustomers.map((customer) => {
        const audit = buildCustomerCompletionAudit(customer, resolveUserName);
        return buildDetailRow(customer, type, audit, latestComplaintByCustomer?.get(customer.id) ?? null);
      });
    }

    const { page, limit, offset } = parsePagination(query);
    const rows = allRows.slice(offset, offset + limit);
    return { rows, pagination: buildPaginationMeta(page, limit, allRows.length) };
  },
};
