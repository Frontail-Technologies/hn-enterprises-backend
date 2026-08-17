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
  | "commissioning";

export type CustomerSectionCompletion = Record<SectionCompletionKey, SectionCompletionResult>;

export type SectionCompletionMeta = {
  completedAt?: string | null;
  completedBy?: string | null;
};

type Dict = Record<string, unknown> | null | undefined;

// One rule for "a value the user actually entered": empty and whitespace-only
// strings and empty arrays are missing, but false and 0 are legitimate values.
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

// Single place that reads a section's `completion` marker and resolves its
// `completedBy` user id to a display name - used by BOTH the Customer list
// projection (Web table) and the Excel export getters, so "who completed
// this section and when" can never drift between the two (§ shared column
// config). `resolveUserName` is injected so this module doesn't need its own
// DB access; callers build the id->name map once per request.
export function resolveSectionCompletion(
  section: Dict,
  resolveUserName: (id: string | null | undefined) => string | null,
): ResolvedSectionCompletion {
  const completion = (section ?? {})["completion"] as SectionCompletionMeta | undefined;
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
};

// The Web table's read-only projection of all 10 Completion Audit fields for
// one customer row, keyed identically to the shared column catalog so the
// caller can attach it as-is and the master-sheet mapper can read it via
// `row.values[key]` without re-deriving any of this itself.
export function buildCustomerCompletionAudit(
  customer: {
    giMeasurements?: Dict;
    valvesRegulators?: Dict;
    fittingsAccessories?: Dict;
    lmcPipelineWork?: Dict;
    mdpeFittings?: Dict;
  },
  resolveUserName: (id: string | null | undefined) => string | null,
): CustomerCompletionAudit {
  const gi = resolveSectionCompletion(customer.giMeasurements, resolveUserName);
  const valves = resolveSectionCompletion(customer.valvesRegulators, resolveUserName);
  const fittings = resolveSectionCompletion(customer.fittingsAccessories, resolveUserName);
  const lmc = resolveSectionCompletion(customer.lmcPipelineWork, resolveUserName);
  const mdpe = resolveSectionCompletion(customer.mdpeFittings, resolveUserName);
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
  };
}

function evaluateFieldDriven(section: Dict, required: string[], meaningful: string[]): SectionCompletionResult {
  const data = section ?? {};
  const missing = required.filter((field) => !hasValue(data[field]));
  if (missing.length === 0) return { status: "DONE", requiredFields: required, missingRequiredFields: [] };
  const started = meaningful.some((field) => hasValue(data[field]));
  return { status: started ? "IN_PROGRESS" : "NOT_STARTED", requiredFields: required, missingRequiredFields: missing };
}

function evaluateExplicit(section: Dict): SectionCompletionResult {
  if (hasValue(completedAtOf(section))) return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  const data = section ?? {};
  const started =
    Object.keys(data).some((key) => key !== "completion" && key !== "evidence" && hasValue(data[key])) ||
    hasValue(data["evidence"]);
  return { status: started ? "IN_PROGRESS" : "NOT_STARTED", requiredFields: [], missingRequiredFields: [] };
}

const LAYING_TERMINAL = new Set(["laying_completed", "not_required"]);
const TESTING_TERMINAL = new Set(["testing_completed", "not_required"]);
const PURGING_TERMINAL = new Set(["purging_completed", "not_required"]);

type LmcPipe = { layingStatus: string; testingStatus: string; purgingStatus: string };

function evaluateLmc(pipeRecords: LmcPipe[], civil: Dict): SectionCompletionResult {
  const hasCivil = LMC_CIVIL_MEANINGFUL.some((field) => hasValue((civil ?? {})[field]));

  if (pipeRecords.length === 0) {
    if (hasValue(completedAtOf(civil))) return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
    return { status: hasCivil ? "IN_PROGRESS" : "NOT_STARTED", requiredFields: [], missingRequiredFields: [] };
  }

  const allTerminal = pipeRecords.every(
    (pipe) =>
      LAYING_TERMINAL.has(pipe.layingStatus) &&
      TESTING_TERMINAL.has(pipe.testingStatus) &&
      PURGING_TERMINAL.has(pipe.purgingStatus),
  );

  if (allTerminal || hasValue(completedAtOf(civil))) return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  return { status: "IN_PROGRESS", requiredFields: [], missingRequiredFields: [] };
}

// The single completion result for a customer, consumed by the customer API and
// (eventually) by both clients - never recomputed independently on Web/Mobile.
export function evaluateCustomerCompletion(
  customer: {
    survey?: Dict;
    giMeasurements?: Dict;
    valvesRegulators?: Dict;
    fittingsAccessories?: Dict;
    mdpeFittings?: Dict;
    lmcPipelineWork?: Dict;
    commissioningConversion?: Dict;
  },
  pipeRecords: LmcPipe[],
): CustomerSectionCompletion {
  return {
    survey: evaluateFieldDriven(customer.survey, SURVEY_REQUIRED, SURVEY_MEANINGFUL),
    commissioning: evaluateFieldDriven(customer.commissioningConversion, COMMISSIONING_REQUIRED, COMMISSIONING_MEANINGFUL),
    giMeasurements: evaluateExplicit(customer.giMeasurements),
    valvesRegulators: evaluateExplicit(customer.valvesRegulators),
    fittingsAccessories: evaluateExplicit(customer.fittingsAccessories),
    mdpeFittings: evaluateExplicit(customer.mdpeFittings),
    lmc: evaluateLmc(pipeRecords, customer.lmcPipelineWork),
  };
}

// -------------------------------------------------------------------------
// Single source of truth for completion-based customer STAT conditions.
// Used by the admin dashboard counts, the customers list `statKey` filter and
// (via the same helpers) the mobile supervisor stats - so there is one SQL
// definition per stat instead of the previous 3-4 drifting copies. Presence is
// empty/whitespace-safe so counts and detail rows agree.
// -------------------------------------------------------------------------
function present(expr: string): string {
  return `NULLIF(TRIM(${expr}), '') IS NOT NULL`;
}

const STAT_CONDITION_SQL: Record<string, string> = {
  "survey-done": `${present("survey->>'surveyDate'")} AND ${present("survey->>'workableStatus'")}`,
  // GI Done now reflects the actual GI Measurements section's explicit completion,
  // not the old, mislabeled `commissioning_conversion.installationDate`.
  "gi-done": present("gi_measurements->'completion'->>'completedAt'"),
  "conversion-done": present("commissioning_conversion->>'conversionDate'"),
  // LEGACY / UNCONFIRMED business definition - isolated here unchanged, pending
  // confirmation of what "GC Done" should mean.
  "gc-done": `${present("commissioning_conversion->>'commissioningDate'")} OR ${present("commissioning_conversion->>'meterNo'")}`,
  "jmr-done": "billing_completion->>'jmrDone' = 'true'",
  "gi-bill-done": "billing_completion->>'giBillDone' = 'true'",
  "gc-bill-done": "billing_completion->>'gcBillDone' = 'true'",
  "conversion-bill-done": "billing_completion->>'conversionBillDone' = 'true'",
  "total-pbg-assignment": "billing_completion->>'jmrSubmittedInPbg' = 'true'",
  "connection-remark":
    "status = 'on_hold' OR survey->>'approvalStatus' IN ('Sent Back', 'Rejected') OR EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status = 'on_hold')",
  // Internal - available for future stats, matches the section-completion rule.
  "commissioning-done": COMMISSIONING_REQUIRED.map((field) => present(`commissioning_conversion->>'${field}'`)).join(" AND "),
};

export function customerStatCondition(statKey: string): SQL | undefined {
  const expr = STAT_CONDITION_SQL[statKey];
  if (!expr) return undefined;
  return sql`(${sql.raw(expr)})`;
}
