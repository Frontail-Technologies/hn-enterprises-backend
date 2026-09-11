import { sql, type SQL } from "drizzle-orm";

export type SectionStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

export type SectionCompletionResult = {
  status: SectionStatus;
  requiredFields: string[];
  missingRequiredFields: string[];
};

export type SectionCompletionKey =
  | "survey"
  | "giMeasurements"
  | "valvesRegulators"
  | "fittingsAccessories"
  | "mdpeFittings"
  | "lmc"
  | "commissioning"
  | "gc"
  | "valveChamber"
  | "preCommissioning"
  | "poleMarker"
  | "routeMarker"
  | "connection"
  | "siteExpenses";

export const PROGRESS_MILESTONE_KEYS = [
  "gc",
  "valveChamber",
  "preCommissioning",
  "poleMarker",
  "routeMarker",
  "connection",
  "siteExpenses",
] as const;
export type ProgressMilestoneKey = (typeof PROGRESS_MILESTONE_KEYS)[number];

export type CustomerSectionCompletion = Record<
  SectionCompletionKey,
  SectionCompletionResult
>;

export type SectionCompletionMeta = {
  completedAt?: string | null;
  completedBy?: string | null;
};

type Dict = Record<string, unknown> | null | undefined;

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const SURVEY_REQUIRED = ["surveyDate", "workableStatus"];
const SURVEY_MEANINGFUL = [
  "surveyDate",
  "assignedSurveyor",
  "workableStatus",
  "initialMeasurements",
  "siteAccessibility",
  "meterPlacement",
  "pipelineRoute",
  "civilWorkRequired",
  "obstaclesRemarks",
  "notes",
];

const COMMISSIONING_REQUIRED = [
  "meterNo",
  "installationDate",
  "commissioningDate",
  "conversionDate",
  "meterType",
  "meterReading",
];
const COMMISSIONING_MEANINGFUL = [
  ...COMMISSIONING_REQUIRED,
  "regulatorPressure",
  "regulatorNo",
  "nonConversionRemark",
];

const GI_MEANINGFUL = [
  "tfToRegulator",
  "inlet",
  "outlet",
  "totalGiPipeHalfInch",
  "giPipeThreeQuarterInch",
  "giPipeOneInch",
  "giPipeOneAndHalfInch",
  "giPipeTwoInch",
];
const VALVES_MEANINGFUL = [
  "isolationValveHalfInch",
  "isolationValveThreeQuarterInch",
  "isolationValveOneInch",
  "isolationValveOneAndHalfInch",
  "isolationValveTwoInch",
  "applianceValveHalfInch",
  "regulator6BarTo100Mbar",
  "regulator6BarTo21Mbar",
  "regulator100MbarTo21Mbar",
  "warningPlate",
];
const FITTINGS_MEANINGFUL = [
  "clampHalfInch",
  "clamp3InchToHalfInch",
  "elbowHalfInch",
  "mfElbowHalfInch",
  "socketHalfInch",
  "teeHalfInch",
  "nipple2Inch",
  "nipple3Inch",
  "nipple4Inch",
  "reducerElbowThreeQuarterToHalfInch",
  "threeQuarterInchTo3Inch",
  "unionHalfInch",
  "plugHalfInch",
  "fittingsOneAndHalfInchQuantity",
  "fittingsTwoInchQuantity",
  "extraGiAbove10Metres",
];
const MDPE_MEANINGFUL = [
  "saddle90To32Mm",
  "saddle90Mm",
  "saddle63To32Mm",
  "saddle32To20Mm",
  "tee90Mm",
  "tee32Mm",
  "tee20Mm",
  "reducerCoupler90To63Mm",
  "reducerCoupler63To32Mm",
  "reducerCoupler32To20Mm",
  "coupler90Mm",
  "coupler32Mm",
  "coupler20Mm",
  "endCap90Mm",
];
const LMC_CIVIL_MEANINGFUL = [
  "fourMetresUnderGc",
  "fourMetresAboveGc",
  "tfHalfInch",
  "tfOneInch",
  "pcc",
  "rccNalaCrossing",
  "paverBlocks",
  "malua",
  "hardRock",
  "civilRemarks",
];

function completedAtOf(section: Dict): unknown {
  const completion = (section ?? {})["completion"] as Dict;
  return completion ? completion["completedAt"] : undefined;
}

export type ResolvedSectionCompletion = {
  completedOn: string | null;
  completedBy: string | null;
};

export function resolveSectionCompletion(
  section: Dict,
  resolveUserName: (id: string | null | undefined) => string | null,
): ResolvedSectionCompletion {
  const completion = (section ?? {})["completion"] as
    | SectionCompletionMeta
    | undefined;
  return {
    completedOn: (completion?.completedAt as string | null | undefined) ?? null,
    completedBy: resolveUserName(completion?.completedBy ?? null),
  };
}

export type CustomerCompletionAudit = {
  giCompletedOn: string | null;
  giCompletedBy: string | null;
  valvesCompletedOn: string | null;
  valvesCompletedBy: string | null;
  fittingsCompletedOn: string | null;
  fittingsCompletedBy: string | null;
  lmcCompletedOn: string | null;
  lmcCompletedBy: string | null;
  mdpeCompletedOn: string | null;
  mdpeCompletedBy: string | null;
  gcCompletedOn: string | null;
  gcCompletedBy: string | null;
  valveChamberCompletedOn: string | null;
  valveChamberCompletedBy: string | null;
  preCommissioningCompletedOn: string | null;
  preCommissioningCompletedBy: string | null;
  poleMarkerCompletedOn: string | null;
  poleMarkerCompletedBy: string | null;
  routeMarkerCompletedOn: string | null;
  routeMarkerCompletedBy: string | null;
  connectionCompletedOn: string | null;
  connectionCompletedBy: string | null;
  siteExpensesCompletedOn: string | null;
  siteExpensesCompletedBy: string | null;
};

export function buildCustomerCompletionAudit(
  customer: {
    giMeasurements?: Dict;
    valvesRegulators?: Dict;
    fittingsAccessories?: Dict;
    lmcPipelineWork?: Dict;
    mdpeFittings?: Dict;
    progressMilestones?: Dict;
  },
  resolveUserName: (id: string | null | undefined) => string | null,
): CustomerCompletionAudit {
  const gi = resolveSectionCompletion(customer.giMeasurements, resolveUserName);
  const valves = resolveSectionCompletion(
    customer.valvesRegulators,
    resolveUserName,
  );
  const fittings = resolveSectionCompletion(
    customer.fittingsAccessories,
    resolveUserName,
  );
  const lmc = resolveSectionCompletion(
    customer.lmcPipelineWork,
    resolveUserName,
  );
  const mdpe = resolveSectionCompletion(customer.mdpeFittings, resolveUserName);
  const milestones = (customer.progressMilestones ?? {}) as Record<
    string,
    SectionCompletionMeta | undefined
  >;
  const resolveMilestone = (meta: SectionCompletionMeta | undefined) => ({
    completedOn: meta?.completedAt ?? null,
    completedBy: resolveUserName(meta?.completedBy ?? null),
  });
  const gc = resolveMilestone(milestones.gc);
  const valveChamber = resolveMilestone(milestones.valveChamber);
  const preCommissioning = resolveMilestone(milestones.preCommissioning);
  const poleMarker = resolveMilestone(milestones.poleMarker);
  const routeMarker = resolveMilestone(milestones.routeMarker);
  const connection = resolveMilestone(milestones.connection);
  const siteExpenses = resolveMilestone(milestones.siteExpenses);
  return {
    giCompletedOn: gi.completedOn,
    giCompletedBy: gi.completedBy,
    valvesCompletedOn: valves.completedOn,
    valvesCompletedBy: valves.completedBy,
    fittingsCompletedOn: fittings.completedOn,
    fittingsCompletedBy: fittings.completedBy,
    lmcCompletedOn: lmc.completedOn,
    lmcCompletedBy: lmc.completedBy,
    mdpeCompletedOn: mdpe.completedOn,
    mdpeCompletedBy: mdpe.completedBy,
    gcCompletedOn: gc.completedOn,
    gcCompletedBy: gc.completedBy,
    valveChamberCompletedOn: valveChamber.completedOn,
    valveChamberCompletedBy: valveChamber.completedBy,
    preCommissioningCompletedOn: preCommissioning.completedOn,
    preCommissioningCompletedBy: preCommissioning.completedBy,
    poleMarkerCompletedOn: poleMarker.completedOn,
    poleMarkerCompletedBy: poleMarker.completedBy,
    routeMarkerCompletedOn: routeMarker.completedOn,
    routeMarkerCompletedBy: routeMarker.completedBy,
    connectionCompletedOn: connection.completedOn,
    connectionCompletedBy: connection.completedBy,
    siteExpensesCompletedOn: siteExpenses.completedOn,
    siteExpensesCompletedBy: siteExpenses.completedBy,
  };
}

function evaluateFieldDriven(
  section: Dict,
  required: string[],
  meaningful: string[],
): SectionCompletionResult {
  const data = section ?? {};
  const missing = required.filter((field) => !hasValue(data[field]));
  if (missing.length === 0)
    return {
      status: "DONE",
      requiredFields: required,
      missingRequiredFields: [],
    };
  const started = meaningful.some((field) => hasValue(data[field]));
  return {
    status: started ? "IN_PROGRESS" : "NOT_STARTED",
    requiredFields: required,
    missingRequiredFields: missing,
  };
}

function evaluateExplicit(section: Dict): SectionCompletionResult {
  if (hasValue(completedAtOf(section)))
    return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  const data = section ?? {};
  const started =
    Object.keys(data).some(
      (key) =>
        key !== "completion" && key !== "evidence" && hasValue(data[key]),
    ) || hasValue(data["evidence"]);
  return {
    status: started ? "IN_PROGRESS" : "NOT_STARTED",
    requiredFields: [],
    missingRequiredFields: [],
  };
}

function evaluateMilestone(
  meta: SectionCompletionMeta | null | undefined,
): SectionCompletionResult {
  if (hasValue(meta?.completedAt))
    return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  return {
    status: "NOT_STARTED",
    requiredFields: [],
    missingRequiredFields: [],
  };
}

const LAYING_TERMINAL = new Set(["laying_completed", "not_required"]);
const TESTING_TERMINAL = new Set(["testing_completed", "not_required"]);
const PURGING_TERMINAL = new Set(["purging_completed", "not_required"]);

type LmcPipe = {
  layingStatus: string;
  testingStatus: string;
  purgingStatus: string;
};

function evaluateLmc(
  pipeRecords: LmcPipe[],
  civil: Dict,
): SectionCompletionResult {
  const hasCivil = LMC_CIVIL_MEANINGFUL.some((field) =>
    hasValue((civil ?? {})[field]),
  );

  if (pipeRecords.length === 0) {
    if (hasValue(completedAtOf(civil)))
      return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
    return {
      status: hasCivil ? "IN_PROGRESS" : "NOT_STARTED",
      requiredFields: [],
      missingRequiredFields: [],
    };
  }

  const allTerminal = pipeRecords.every(
    (pipe) =>
      LAYING_TERMINAL.has(pipe.layingStatus) &&
      TESTING_TERMINAL.has(pipe.testingStatus) &&
      PURGING_TERMINAL.has(pipe.purgingStatus),
  );

  if (allTerminal || hasValue(completedAtOf(civil)))
    return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  return {
    status: "IN_PROGRESS",
    requiredFields: [],
    missingRequiredFields: [],
  };
}

export function evaluateCustomerCompletion(
  customer: {
    survey?: Dict;
    giMeasurements?: Dict;
    valvesRegulators?: Dict;
    fittingsAccessories?: Dict;
    mdpeFittings?: Dict;
    lmcPipelineWork?: Dict;
    commissioningConversion?: Dict;
    progressMilestones?: Dict;
  },
  pipeRecords: LmcPipe[],
): CustomerSectionCompletion {
  const milestones = (customer.progressMilestones ?? {}) as Record<
    string,
    SectionCompletionMeta | undefined
  >;
  return {
    survey: evaluateFieldDriven(
      customer.survey,
      SURVEY_REQUIRED,
      SURVEY_MEANINGFUL,
    ),
    commissioning: evaluateFieldDriven(
      customer.commissioningConversion,
      COMMISSIONING_REQUIRED,
      COMMISSIONING_MEANINGFUL,
    ),
    giMeasurements: evaluateExplicit(customer.giMeasurements),
    valvesRegulators: evaluateExplicit(customer.valvesRegulators),
    fittingsAccessories: evaluateExplicit(customer.fittingsAccessories),
    mdpeFittings: evaluateExplicit(customer.mdpeFittings),
    lmc: evaluateLmc(pipeRecords, customer.lmcPipelineWork),
    gc: evaluateMilestone(milestones.gc),
    valveChamber: evaluateMilestone(milestones.valveChamber),
    preCommissioning: evaluateMilestone(milestones.preCommissioning),
    poleMarker: evaluateMilestone(milestones.poleMarker),
    routeMarker: evaluateMilestone(milestones.routeMarker),
    connection: evaluateMilestone(milestones.connection),
    siteExpenses: evaluateMilestone(milestones.siteExpenses),
  };
}

function present(expr: string): string {
  return `NULLIF(TRIM(${expr}), '') IS NOT NULL`;
}

const LAYING_TERMINAL_SQL = "('laying_completed', 'not_required')";
const TESTING_TERMINAL_SQL = "('testing_completed', 'not_required')";
const PURGING_TERMINAL_SQL = "('purging_completed', 'not_required')";
const UNRESOLVED_COMPLAINT_SQL = "('open', 'in_progress')";

const STAT_CONDITION_SQL: Record<string, string> = {
  "survey-done": `${present("survey->>'surveyDate'")} AND ${present("survey->>'workableStatus'")}`,
  "gi-done": `${present("gi_measurements->'completion'->>'completedAt'")} OR billing_completion->>'giBillDone' = 'true'`,
  "conversion-done": `${present("commissioning_conversion->>'conversionDate'")} OR billing_completion->>'conversionBillDone' = 'true'`,
  "gc-done": `${present("progress_milestones->'gc'->>'completedAt'")} OR billing_completion->>'gcBillDone' = 'true'`,
  commissioning: present("commissioning_conversion->>'commissioningDate'"),
  "jmr-done": "billing_completion->>'jmrDone' = 'true'",
  "gi-bill-done": "billing_completion->>'giBillDone' = 'true'",
  "gc-bill-done": "billing_completion->>'gcBillDone' = 'true'",
  "conversion-bill-done": "billing_completion->>'conversionBillDone' = 'true'",
  "total-pbg-assignment": "billing_completion->>'jmrSubmittedInPbg' = 'true'",
  "connection-remark":
    "status = 'on_hold' OR survey->>'approvalStatus' IN ('Sent Back', 'Rejected') OR EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status = 'on_hold')",
  // Mirrors the dashboard "pending approvals" survey count (dashboard.service.ts) so the
  // drill-down can scope server-side instead of the client loading every customer.
  "pending-survey-approval": "survey->>'approvalStatus' IN ('Submitted', 'In Review', 'Sent Back')",
  "total-connection-remark": present("billing_completion->>'remark'"),
  "commissioning-done": COMMISSIONING_REQUIRED.map((field) =>
    present(`commissioning_conversion->>'${field}'`),
  ).join(" AND "),

  "valve-chamber-done": present(
    "progress_milestones->'valveChamber'->>'completedAt'",
  ),
  "pre-commissioning-done": present(
    "progress_milestones->'preCommissioning'->>'completedAt'",
  ),
  "pole-marker-done": present(
    "progress_milestones->'poleMarker'->>'completedAt'",
  ),
  "route-marker-done": present(
    "progress_milestones->'routeMarker'->>'completedAt'",
  ),
  "connection-done": present(
    "progress_milestones->'connection'->>'completedAt'",
  ),
  "site-expenses-done": present(
    "progress_milestones->'siteExpenses'->>'completedAt'",
  ),

  "laying-done": `EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status NOT IN ${LAYING_TERMINAL_SQL})`,
  "flushing-testing-done": `EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND (testing_status NOT IN ${TESTING_TERMINAL_SQL} OR purging_status NOT IN ${PURGING_TERMINAL_SQL}))`,

  "complaint-customer": `EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id AND status IN ${UNRESOLVED_COMPLAINT_SQL})`,
  "customer-resolved": `EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id AND status IN ${UNRESOLVED_COMPLAINT_SQL})`,
};

export function customerStatCondition(statKey: string): SQL | undefined {
  const expr = STAT_CONDITION_SQL[statKey];
  if (!expr) return undefined;
  return sql`(${sql.raw(expr)})`;
}

const STAT_DATE_SQL: Record<string, string> = {
  "survey-done": "survey->>'surveyDate'",
  "gi-done": "gi_measurements->'completion'->>'completedAt'",
  "gc-done": "progress_milestones->'gc'->>'completedAt'",
  "conversion-done": "commissioning_conversion->>'conversionDate'",
  commissioning: "commissioning_conversion->>'commissioningDate'",
  "valve-chamber-done": "progress_milestones->'valveChamber'->>'completedAt'",
  "pre-commissioning-done":
    "progress_milestones->'preCommissioning'->>'completedAt'",
  "pole-marker-done": "progress_milestones->'poleMarker'->>'completedAt'",
  "route-marker-done": "progress_milestones->'routeMarker'->>'completedAt'",
  "connection-done": "progress_milestones->'connection'->>'completedAt'",
  "site-expenses-done": "progress_milestones->'siteExpenses'->>'completedAt'",
};

export function statHasEventDate(statKey: string): boolean {
  return typeof STAT_DATE_SQL[statKey] === "string";
}

export function customerStatDateCondition(
  statKey: string,
  month?: number,
  year?: number,
): SQL | undefined {
  if (!month && !year) return undefined;
  const dateExpr = STAT_DATE_SQL[statKey];
  if (!dateExpr) return undefined;

  const parts: string[] = [];
  if (month)
    parts.push(
      `EXTRACT(MONTH FROM NULLIF(${dateExpr}, '')::date) = ${Number(month)}`,
    );
  if (year)
    parts.push(
      `EXTRACT(YEAR FROM NULLIF(${dateExpr}, '')::date) = ${Number(year)}`,
    );
  return sql`(${sql.raw(parts.join(" AND "))})`;
}
