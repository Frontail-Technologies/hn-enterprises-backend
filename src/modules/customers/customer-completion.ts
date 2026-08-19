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

// Keys whose completion marker lives in the grouped `progressMilestones`
// jsonb column rather than inside an existing section's own payload - see
// customer.schema.ts's CustomerProgressMilestonesPayload.
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
    progressMilestones?: Dict;
  },
  resolveUserName: (id: string | null | undefined) => string | null,
): CustomerCompletionAudit {
  const gi = resolveSectionCompletion(customer.giMeasurements, resolveUserName);
  const valves = resolveSectionCompletion(customer.valvesRegulators, resolveUserName);
  const fittings = resolveSectionCompletion(customer.fittingsAccessories, resolveUserName);
  const lmc = resolveSectionCompletion(customer.lmcPipelineWork, resolveUserName);
  const mdpe = resolveSectionCompletion(customer.mdpeFittings, resolveUserName);
  const milestones = (customer.progressMilestones ?? {}) as Record<string, SectionCompletionMeta | undefined>;
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

// Pure completion-toggle milestones (no other section data alongside them) -
// DONE once completedAt is set, otherwise NOT_STARTED. No IN_PROGRESS state:
// there's nothing partial to be "in progress" on for a single mark-complete action.
function evaluateMilestone(meta: SectionCompletionMeta | null | undefined): SectionCompletionResult {
  if (hasValue(meta?.completedAt)) return { status: "DONE", requiredFields: [], missingRequiredFields: [] };
  return { status: "NOT_STARTED", requiredFields: [], missingRequiredFields: [] };
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
    progressMilestones?: Dict;
  },
  pipeRecords: LmcPipe[],
): CustomerSectionCompletion {
  const milestones = (customer.progressMilestones ?? {}) as Record<string, SectionCompletionMeta | undefined>;
  return {
    survey: evaluateFieldDriven(customer.survey, SURVEY_REQUIRED, SURVEY_MEANINGFUL),
    commissioning: evaluateFieldDriven(customer.commissioningConversion, COMMISSIONING_REQUIRED, COMMISSIONING_MEANINGFUL),
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

// Terminal-status SQL lists shared with evaluateLmc's LAYING_TERMINAL/
// TESTING_TERMINAL/PURGING_TERMINAL sets above - kept as string literals here
// since these conditions run in the DB, not in JS, but the values must stay
// identical to those sets or the summary count and the section-completion
// badge could disagree.
const LAYING_TERMINAL_SQL = "('laying_completed', 'not_required')";
const TESTING_TERMINAL_SQL = "('testing_completed', 'not_required')";
const PURGING_TERMINAL_SQL = "('purging_completed', 'not_required')";
const UNRESOLVED_COMPLAINT_SQL = "('open', 'in_progress')";

// Classification of every key below (kept here, next to the conditions
// themselves, so it can't drift out of sync):
//
// CLIENT-FACING PROGRESS STATS (19 - the canonical set from the Customer
// Progress Stats spec, each with its own dashboard tile + drill-down table):
//   survey-done, gi-done, gc-done, conversion-done, jmr-done,
//   total-pbg-assignment, commissioning, valve-chamber-done,
//   pre-commissioning-done, pole-marker-done, route-marker-done, connection-done,
//   site-expenses-done, laying-done, flushing-testing-done,
//   complaint-customer, customer-resolved, total-connection-remark,
//   connection-remark ("Needs Attention" tile - pre-existing workflow flag).
//   (Pole Marker and Route Marker are two separate milestones/stats, not one
//   combined condition - each has its own progress_milestones key.)
//
// PRE-EXISTING BILLING-HELPER CARDS (3 - already live on the dashboard before
// this stats pass; kept for continuity, not newly introduced, not part of the
// spec's 18-item list. Do not add further billing-flag tiles like these
// unless a client explicitly asks for one):
//   gi-bill-done, gc-bill-done, conversion-bill-done.
//
// INTERNAL/SUPPORTING ONLY (1 - never a dashboard tile; consumed by another
// feature instead):
//   commissioning-done -> used only by dpr-planning-export.service.ts. Distinct
//   from the client-facing `commissioning` stat (which reuses commissioningDate);
//   this one matches the full field-driven Commissioning section-completion rule.
//
// ALIASES (UI label only, same backend condition, no duplicate key):
//   "Total Conversion Done" -> conversion-done
//   "Total Connection Done" -> connection-done
//
// BUSINESS-CONFIRMATION-PENDING: total-connection-remark maps to
// billing_completion->>'remark' as the closest existing field - there is no
// field literally named "Connection Remark" in the schema. Left unchanged
// per instruction; needs sign-off from the business owner, not a guess.
const STAT_CONDITION_SQL: Record<string, string> = {
  "survey-done": `${present("survey->>'surveyDate'")} AND ${present("survey->>'workableStatus'")}`,
  // GI Done reflects the GI Measurements section's explicit completion, OR a
  // GI bill already marked Done (billing implies the work is done, even if
  // nobody separately hit "Mark Complete" - see the write-time sync in
  // customers.service.ts#update, which is the primary path; this OR is a
  // read-time safety net for any write path that sync doesn't cover, e.g.
  // bulk import). Never the reverse: GI completion never sets the bill flag.
  "gi-done": `${present("gi_measurements->'completion'->>'completedAt'")} OR billing_completion->>'giBillDone' = 'true'`,
  // Conversion has no explicit completion marker by design (reuses conversionDate
  // per the existing canonical source) - a Conversion bill marked Done counts as
  // complete even with no conversionDate yet, since fabricating a date would be
  // worse than an honest OR here.
  "conversion-done": `${present("commissioning_conversion->>'conversionDate'")} OR billing_completion->>'conversionBillDone' = 'true'`,
  // GC Done now reflects its own explicit completion marker (progress_milestones.gc),
  // OR a GC bill already marked Done - replacing the previous LEGACY/UNCONFIRMED
  // condition that conflated GC with the unrelated commissioningDate/meterNo fields.
  "gc-done": `${present("progress_milestones->'gc'->>'completedAt'")} OR billing_completion->>'gcBillDone' = 'true'`,
  // Commissioning is its own stat (distinct from GC and Conversion) - the one
  // authoritative event date already on the customer record.
  commissioning: present("commissioning_conversion->>'commissioningDate'"),
  "jmr-done": "billing_completion->>'jmrDone' = 'true'",
  "gi-bill-done": "billing_completion->>'giBillDone' = 'true'",
  "gc-bill-done": "billing_completion->>'gcBillDone' = 'true'",
  "conversion-bill-done": "billing_completion->>'conversionBillDone' = 'true'",
  "total-pbg-assignment": "billing_completion->>'jmrSubmittedInPbg' = 'true'",
  // Existing "needs attention" workflow flag (on_hold / sent-back / rejected /
  // an on-hold LMC pipe) - kept unchanged, NOT the same thing as the free-text
  // Connection Remark stat below. Do not conflate the two.
  "connection-remark":
    "status = 'on_hold' OR survey->>'approvalStatus' IN ('Sent Back', 'Rejected') OR EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status = 'on_hold')",
  // Total Connection Remark: BUSINESS-CONFIRMATION-PENDING. Customers carrying a
  // meaningful free-text remark on the billing/connection completion payload.
  // `billingCompletion.remark` is the best-match existing field (there is no
  // field literally named "connection remark" in the schema) - left unchanged
  // per instruction, but this mapping is an assumption, not a confirmed one.
  "total-connection-remark": present("billing_completion->>'remark'"),
  // Internal - matches the section-completion rule (all commissioning fields
  // present), distinct from the single-field `commissioning` stat above.
  "commissioning-done": COMMISSIONING_REQUIRED.map((field) => present(`commissioning_conversion->>'${field}'`)).join(" AND "),

  // --- New explicit milestones (progress_milestones jsonb) ---
  "valve-chamber-done": present("progress_milestones->'valveChamber'->>'completedAt'"),
  "pre-commissioning-done": present("progress_milestones->'preCommissioning'->>'completedAt'"),
  "pole-marker-done": present("progress_milestones->'poleMarker'->>'completedAt'"),
  "route-marker-done": present("progress_milestones->'routeMarker'->>'completedAt'"),
  "connection-done": present("progress_milestones->'connection'->>'completedAt'"),
  "site-expenses-done": present("progress_milestones->'siteExpenses'->>'completedAt'"),

  // --- LMC-derived: laying and flushing/testing as their own stats, split out
  // of the combined `lmc` section-completion rule. "Done" = at least one pipe
  // record exists AND every pipe record for this customer has reached a
  // terminal status for the relevant stage - matches evaluateLmc's own
  // terminal-status sets so the stat and the section badge can't disagree.
  "laying-done": `EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status NOT IN ${LAYING_TERMINAL_SQL})`,
  "flushing-testing-done": `EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND (testing_status NOT IN ${TESTING_TERMINAL_SQL} OR purging_status NOT IN ${PURGING_TERMINAL_SQL}))`,

  // --- Complaints: DISTINCT customers, never complaint-row counts ---
  "complaint-customer": `EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id AND status IN ${UNRESOLVED_COMPLAINT_SQL})`,
  "customer-resolved": `EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id) AND NOT EXISTS (SELECT 1 FROM complaints WHERE customer_id = customers.id AND status IN ${UNRESOLVED_COMPLAINT_SQL})`,
};

export function customerStatCondition(statKey: string): SQL | undefined {
  const expr = STAT_CONDITION_SQL[statKey];
  if (!expr) return undefined;
  return sql`(${sql.raw(expr)})`;
}

// -------------------------------------------------------------------------
// Each stat's real business-event date, for date/month/year filtering. Never
// customer.createdAt as a generic stand-in - a stat with no reliable date
// (e.g. Total Connection Remark, a free-text field with no associated date)
// is simply absent here, and callers must treat that as "not date-filterable"
// rather than inventing one.
// -------------------------------------------------------------------------
const STAT_DATE_SQL: Record<string, string> = {
  "survey-done": "survey->>'surveyDate'",
  "gi-done": "gi_measurements->'completion'->>'completedAt'",
  "gc-done": "progress_milestones->'gc'->>'completedAt'",
  "conversion-done": "commissioning_conversion->>'conversionDate'",
  commissioning: "commissioning_conversion->>'commissioningDate'",
  // jmr-done intentionally omitted: billingCompletion.jmrDone has no associated date field.
  "valve-chamber-done": "progress_milestones->'valveChamber'->>'completedAt'",
  "pre-commissioning-done": "progress_milestones->'preCommissioning'->>'completedAt'",
  "pole-marker-done": "progress_milestones->'poleMarker'->>'completedAt'",
  "route-marker-done": "progress_milestones->'routeMarker'->>'completedAt'",
  "connection-done": "progress_milestones->'connection'->>'completedAt'",
  "site-expenses-done": "progress_milestones->'siteExpenses'->>'completedAt'",
};

/** Which stats have a real, filterable event date - see STAT_DATE_SQL's comment. */
export function statHasEventDate(statKey: string): boolean {
  return typeof STAT_DATE_SQL[statKey] === "string";
}

/**
 * Month/year filter for one stat, using THAT stat's own real event date
 * column (never a generic customer.createdAt). Returns undefined when the
 * stat has no reliable date (caller should not apply a date filter to it) or
 * when no month/year was requested.
 */
export function customerStatDateCondition(statKey: string, month?: number, year?: number): SQL | undefined {
  if (!month && !year) return undefined;
  const dateExpr = STAT_DATE_SQL[statKey];
  if (!dateExpr) return undefined;

  const parts: string[] = [];
  if (month) parts.push(`EXTRACT(MONTH FROM NULLIF(${dateExpr}, '')::date) = ${Number(month)}`);
  if (year) parts.push(`EXTRACT(YEAR FROM NULLIF(${dateExpr}, '')::date) = ${Number(year)}`);
  return sql`(${sql.raw(parts.join(" AND "))})`;
}
