import { desc, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, workProgressUpdates } from "@db/schema";
import type { SupervisorStat, SupervisorStatDetailRow, SupervisorStatId, SupervisorStatTone } from "./stats.types";

const STAT_DEFINITIONS: Record<SupervisorStatId, { label: string; suffix: string; tone: SupervisorStatTone }> = {
  "survey-done": { label: "Survey Done", suffix: "Customers", tone: "green" },
  "conversion-done": { label: "Conversion Done", suffix: "Customers", tone: "orange" },
  "gi-done": { label: "GI Done", suffix: "Customers", tone: "blue" },
  "jmr-done": { label: "JMR Done", suffix: "Customers", tone: "blue" },
  "gc-done": { label: "GC Done", suffix: "Customers", tone: "orange" },
  "site-expenses-done": { label: "Site Expenses Done", suffix: "Customers", tone: "red" },
  laying: { label: "Laying", suffix: "Customers", tone: "blue" },
  "flushing-testing": { label: "Flushing / Testing", suffix: "Records", tone: "blue" },
  "valve-chamber": { label: "Valve Chamber", suffix: "Customers", tone: "orange" },
  "pre-commissioning": { label: "Pre Commissioning", suffix: "Customers", tone: "green" },
  commissioning: { label: "Commissioning", suffix: "Customers", tone: "green" },
  dpr: { label: "DPR", suffix: "Completed", tone: "blue" },
  planning: { label: "Planning", suffix: "Plans", tone: "orange" },
  "pole-marker": { label: "Pole Marker", suffix: "Customers", tone: "blue" },
  "route-marker": { label: "Route Marker", suffix: "Customers", tone: "orange" },
  "complaint-customer": { label: "Complaint Customer", suffix: "Open", tone: "red" },
  "total-pbg-assignment": { label: "Total PBG Assignment", suffix: "Assigned", tone: "blue" },
  "total-connection-done": { label: "Total Connection Done", suffix: "Customers", tone: "green" },
  "total-connection-remark": { label: "Total Connection Remark", suffix: "Pending", tone: "orange" },
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
  "total-conversion-done",
  "customer-resolve",
];

// These don't have a real backing concept anywhere in the schema yet (no pole/route marker
// tracking, no PBG assignment tracking - Pre-Commissioning is a whole unbuilt module per the
// product spec). Restored to the list per explicit request; they report 0 rather than a
// fabricated non-zero count until real tracking exists. ("complaint-customer" used to be here
// too, but now has a real complaints table backing it - see fetchComplaintDetailRows.)
const UNTRACKED_STAT_IDS: SupervisorStatId[] = [
  "pole-marker",
  "route-marker",
  "total-pbg-assignment",
  "total-connection-done",
  "total-connection-remark",
  "customer-resolve",
];

function isStatId(value: string): value is SupervisorStatId {
  return (STAT_ORDER as string[]).includes(value);
}

async function fetchCustomers() {
  const db = getDb();
  return db.query.customers.findMany({
    with: { lmcPipeRecords: true, project: true, site: true },
  });
}

type CustomerWithContext = Awaited<ReturnType<typeof fetchCustomers>>[number];

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function boolStatus(done: boolean): SupervisorStatDetailRow["status"] {
  return done ? "Done" : "Pending";
}

function buildCustomerRow(customer: CustomerWithContext, statId: SupervisorStatId): {
  matches: boolean;
  row: SupervisorStatDetailRow;
} {
  const base = {
    id: `${statId}-${customer.id}`,
    customerId: customer.id,
    title: customer.customerName,
    reference: customer.trBpNumber,
    site: customer.site?.name ?? customer.city ?? "-",
    updatedOn: toIso(customer.createdAt),
  };

  if (statId === "survey-done") {
    const approvalStatus = customer.survey?.approvalStatus;
    const done = approvalStatus === "Approved";
    return {
      matches: done,
      row: {
        ...base,
        status: done ? "Done" : approvalStatus === "Sent Back" ? "Sent Back" : "Pending",
        updatedOn: customer.survey?.surveyDate || base.updatedOn,
        helper: customer.survey?.workableStatus ?? "-",
      },
    };
  }

  if (statId === "gi-done") {
    const done = Boolean(customer.giMeasurements?.totalGiPipeHalfInch);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        updatedOn: customer.commissioningConversion?.installationDate || base.updatedOn,
        helper: `GI: ${customer.giMeasurements?.totalGiPipeHalfInch || "-"} m`,
      },
    };
  }

  if (statId === "gc-done") {
    const done = Boolean(customer.billingCompletion?.gcBillDone);
    return { matches: done, row: { ...base, status: boolStatus(done), helper: customer.billingCompletion?.remark ?? "-" } };
  }

  if (statId === "laying") {
    const activePipe = customer.lmcPipeRecords.find((pipe) => pipe.layingStatus !== "not_required");
    const done = activePipe?.layingStatus === "laying_completed";
    const status: SupervisorStatDetailRow["status"] =
      done ? "Done" : activePipe?.layingStatus === "in_progress" ? "In Progress" : "Pending";
    return {
      matches: done,
      row: {
        ...base,
        status,
        updatedOn: toIso(activePipe?.layingDate) || base.updatedOn,
        helper: activePipe ? `${activePipe.pipeSize} : ${activePipe.lengthMetres ?? "-"} m` : "No laying required",
      },
    };
  }

  if (statId === "valve-chamber") {
    const done = Boolean(customer.lmcPipelineWork?.pcc || customer.lmcPipelineWork?.rccNalaCrossing);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        helper: `PCC ${customer.lmcPipelineWork?.pcc || "-"} / RCC ${customer.lmcPipelineWork?.rccNalaCrossing || "-"}`,
      },
    };
  }

  if (statId === "pre-commissioning") {
    // Fixed from a copy-paste bug in the old mock stats helper, which used the exact same
    // predicate as `commissioning` - "installed and ready" is a real, distinct signal from
    // "actually commissioned".
    const done = Boolean(customer.commissioningConversion?.installationDate);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        updatedOn: customer.commissioningConversion?.installationDate || base.updatedOn,
        helper: customer.commissioningConversion?.meterNo || "-",
      },
    };
  }

  if (statId === "commissioning") {
    const done = Boolean(customer.commissioningConversion?.commissioningDate);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        updatedOn: customer.commissioningConversion?.commissioningDate || base.updatedOn,
        helper: customer.commissioningConversion?.regulatorPressure || "-",
      },
    };
  }

  if (statId === "conversion-done") {
    const done = Boolean(customer.commissioningConversion?.conversionDate);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        updatedOn: customer.commissioningConversion?.conversionDate || base.updatedOn,
        helper: customer.commissioningConversion?.nonConversionRemark || "-",
      },
    };
  }

  if (statId === "jmr-done") {
    const done = Boolean(customer.billingCompletion?.jmrDone);
    return {
      matches: done,
      row: {
        ...base,
        status: boolStatus(done),
        helper: customer.billingCompletion?.jmrSubmittedInPbg ? "Submitted in PBG" : "Not submitted",
      },
    };
  }

  // site-expenses-done
  const done = customer.billingCompletion?.paymentStatus === "Paid";
  return {
    matches: done,
    row: {
      ...base,
      status: boolStatus(done),
      helper: `${customer.billingCompletion?.paymentMode ?? "-"} : Rs. ${customer.billingCompletion?.initialAmount ?? "-"}`,
    },
  };
}

const WORK_PROGRESS_STATUS_TO_DETAIL: Record<string, SupervisorStatDetailRow["status"]> = {
  not_started: "Not Started",
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Done",
  sent_back: "Sent Back",
  on_hold: "On Hold",
};

async function fetchLatestWorkProgress() {
  const db = getDb();
  return db
    .selectDistinctOn([workProgressUpdates.customerId], {
      customerId: workProgressUpdates.customerId,
      stage: workProgressUpdates.stage,
      status: workProgressUpdates.status,
      nextRequiredAction: workProgressUpdates.nextRequiredAction,
      createdAt: workProgressUpdates.createdAt,
    })
    .from(workProgressUpdates)
    .orderBy(workProgressUpdates.customerId, desc(workProgressUpdates.createdAt));
}

function buildFlushingTestingRows(customers: CustomerWithContext[], latestByCustomer: Map<string, Awaited<ReturnType<typeof fetchLatestWorkProgress>>[number]>) {
  const rows: SupervisorStatDetailRow[] = [];

  for (const customer of customers) {
    const latest = latestByCustomer.get(customer.id);
    if (!latest) continue;

    const isFlushingTesting =
      latest.stage === "gc" || (latest.nextRequiredAction ?? "").toLowerCase().includes("testing");
    if (!isFlushingTesting) continue;

    rows.push({
      id: `flushing-testing-${customer.id}`,
      customerId: customer.id,
      title: customer.customerName,
      reference: customer.trBpNumber,
      site: customer.site?.name ?? customer.city ?? "-",
      status: WORK_PROGRESS_STATUS_TO_DETAIL[latest.status] ?? "Pending",
      updatedOn: toIso(latest.createdAt),
      helper: latest.nextRequiredAction || "-",
    });
  }

  return rows;
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
    status: "Planned" as const,
    updatedOn: record.date,
    helper: `${record.tasks.length} task(s) planned`,
  }));
}

async function fetchComplaintDetailRows() {
  const db = getDb();
  const rows = await db.query.complaints.findMany({
    where: inArray(complaints.status, ["open", "in_progress"]),
    with: { customer: { with: { site: true } } },
    orderBy: (fields, { desc: descOrder }) => [descOrder(fields.createdAt)],
  });

  return rows.map((complaint) => ({
    id: complaint.id,
    customerId: complaint.customerId,
    title: complaint.title,
    reference: complaint.customer?.customerName ?? "-",
    site: complaint.customer?.site?.name ?? "-",
    status: complaint.status === "in_progress" ? ("In Progress" as const) : ("Pending" as const),
    updatedOn: toIso(complaint.createdAt),
    helper: complaint.description,
  }));
}

export const statsService = {
  async getSummary(): Promise<SupervisorStat[]> {
    const [customers, dprRows, planningRows, latestWorkProgress, complaintRows] = await Promise.all([
      fetchCustomers(),
      fetchDprDetailRows(),
      fetchPlanningDetailRows(),
      fetchLatestWorkProgress(),
      fetchComplaintDetailRows(),
    ]);

    const latestByCustomer = new Map(latestWorkProgress.map((row) => [row.customerId, row]));
    const flushingTestingRows = buildFlushingTestingRows(customers, latestByCustomer);

    const customerStatIds: SupervisorStatId[] = [
      "survey-done",
      "conversion-done",
      "gi-done",
      "jmr-done",
      "gc-done",
      "site-expenses-done",
      "laying",
      "valve-chamber",
      "pre-commissioning",
      "commissioning",
    ];

    const counts: Partial<Record<SupervisorStatId, number>> = {};
    for (const statId of customerStatIds) {
      counts[statId] = customers.filter((customer) => buildCustomerRow(customer, statId).matches).length;
    }
    counts["dpr"] = dprRows.filter((row) => row.status === "Done").length;
    counts["planning"] = planningRows.length;
    counts["flushing-testing"] = flushingTestingRows.length;
    // "Total Conversion Done" duplicates "Conversion Done" under a different label (that's
    // real, already-tracked data) rather than a fabricated number, unlike the other 7 restored
    // ids in UNTRACKED_STAT_IDS which have no backing concept and stay at 0.
    counts["total-conversion-done"] = counts["conversion-done"];
    counts["complaint-customer"] = complaintRows.length;

    const totalCustomers = customers.length;
    const bareCountStatIds: SupervisorStatId[] = [
      "dpr",
      "planning",
      "flushing-testing",
      "complaint-customer",
      "total-pbg-assignment",
      "total-connection-remark",
    ];

    return STAT_ORDER.map((statId) => {
      const definition = STAT_DEFINITIONS[statId];
      const count = counts[statId] ?? 0;
      const value = bareCountStatIds.includes(statId) ? String(count) : `${count}/${totalCustomers}`;

      return { id: statId, label: definition.label, value, suffix: definition.suffix, tone: definition.tone };
    });
  },

  async getDetails(type: string): Promise<SupervisorStatDetailRow[]> {
    if (!isStatId(type)) throw new Error("Stat not found");

    if (type === "dpr") return fetchDprDetailRows();
    if (type === "planning") return fetchPlanningDetailRows();
    if (type === "complaint-customer") return fetchComplaintDetailRows();
    if ((UNTRACKED_STAT_IDS as string[]).includes(type)) return [];

    const customers = await fetchCustomers();

    if (type === "flushing-testing") {
      const latestWorkProgress = await fetchLatestWorkProgress();
      const latestByCustomer = new Map(latestWorkProgress.map((row) => [row.customerId, row]));
      return buildFlushingTestingRows(customers, latestByCustomer);
    }

    const detailStatId = type === "total-conversion-done" ? "conversion-done" : type;
    return customers.map((customer) => buildCustomerRow(customer, detailStatId).row);
  },
};
