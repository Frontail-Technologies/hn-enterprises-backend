import type ExcelJS from "exceljs";
import { customers } from "@db/schema";
import { CUSTOMER_COLUMN_CATALOG } from "@modules/customers/customer-columns.catalog";
import { resolveSectionCompletion } from "@modules/customers/customer-completion";
import { boolOf, dateOf, numOf, textOf, writeValueMatrixSheet, type ColType } from "./flat-register";

/**
 * Value-getters for the Customer Register export, keyed by the SAME `key`s as
 * `customer-columns.catalog.ts` (the shared config §) - the Web master sheet's
 * own resolver (`customers.service.ts` frontend) reads the identical keys off
 * its flattened row shape. Order/visibility/label/width are never decided
 * here - `customer-export.service.ts` resolves those from the user's saved
 * preference and reorders/filters this map at request time. This file only
 * answers "given a key, how do I read that value off a DB customer row".
 */

export type { ColType };

type CustomerBase = typeof customers.$inferSelect;

type LmcPipeRecordRow = {
  pipeSize: string;
  lengthMetres: string | null;
  layingDate: Date | string | null;
  testingDate: Date | string | null;
  purgingDate: Date | string | null;
};

type CustomerDocumentRow = {
  category: string | null;
  status: string;
};

export type CustomerExportRow = CustomerBase & {
  project?: { name: string | null } | null;
  site?: { name: string | null } | null;
  lmcPipeRecords?: LmcPipeRecordRow[];
  documents?: CustomerDocumentRow[];
};

export type ColumnContext = {
  /** Resolves a user id (e.g. a section's completedBy) to a display name. */
  resolveUser: (id: string | null | undefined) => string | null;
};

export type CustomerColumnGetter = (row: CustomerExportRow, rowNumber: number, ctx: ColumnContext) => ExcelJS.CellValue;

function pipeRecord(row: CustomerExportRow, size: LmcPipeRecordRow["pipeSize"]) {
  return row.lmcPipeRecords?.find((record) => record.pipeSize === size);
}

// Mirrors the frontend master sheet's own derivation (customers.service.ts:
// "ID / Address Proof" + "Approved") - see that file for the source of truth
// this was ported from, kept identical so Web and Excel never disagree.
function kycVerified(row: CustomerExportRow): boolean {
  return Boolean(row.documents?.some((doc) => doc.category === "ID / Address Proof" && doc.status === "approved"));
}

// "Completed" (capitalized) matches the value the customer form's Payment
// Status dropdown actually writes - see customers.service.ts (frontend)'s
// identical `billing.paymentStatus === "Completed"` check.
function lastPaymentDate(row: CustomerExportRow) {
  return row.billingCompletion?.paymentStatus === "Completed" ? row.commissioningConversion?.conversionDate : null;
}

/**
 * One getter per catalog key that has a real, non-fabricated backend value.
 * A catalog key with no entry here (there should be none among the static
 * fields - this is checked at startup by `assertCustomerColumnGettersComplete`)
 * would be a genuine gap, not silently rendered as 0/false.
 */
export const CUSTOMER_COLUMN_GETTERS: Record<string, CustomerColumnGetter> = {
  reportNoGi: (r) => textOf(r.giReportNumber),
  reportNoGc: (r) => textOf(r.gcReportNumber),
  reportNoConversion: (r) => textOf(r.conversionReportNumber),
  trBpNo: (r) => textOf(r.trBpNumber),
  customerName: (r) => textOf(r.customerName),
  mobileNo: (r) => textOf(r.mobileNumber),
  fullAddress: (r) => textOf(r.fullAddress),
  projectName: (r) => textOf(r.project?.name),
  siteArea: (r) => textOf(r.site?.name),
  city: (r) => textOf(r.city),
  status: (r) => textOf(r.status),
  scheme: (r) => textOf(r.scheme),
  jobCardDone: (r) => textOf(r.billingCompletion?.jobCardDone),
  connectionType: (r) => textOf(r.connectionType),
  houseType: (r) => textOf(r.houseType),
  kycVerified: (r) => (kycVerified(r) ? "Yes" : "No"),
  paymentStatus: (r) => textOf(r.billingCompletion?.paymentStatus),
  paymentMode: (r) => textOf(r.billingCompletion?.paymentMode),
  initialAmount: (r) => numOf(r.billingCompletion?.initialAmount),
  lastPaymentDate: (r) => dateOf(lastPaymentDate(r)),
  plumberName: (r) => textOf(r.plumberName),
  supervisorName: (r) => textOf(r.supervisorName),
  meterNo: (r) => textOf(r.commissioningConversion?.meterNo),
  installationDate: (r) => dateOf(r.commissioningConversion?.installationDate),
  commissioningDate: (r) => dateOf(r.commissioningConversion?.commissioningDate),
  conversionDate: (r) => dateOf(r.commissioningConversion?.conversionDate),
  regulatorPressure: (r) => textOf(r.commissioningConversion?.regulatorPressure),
  regulatorNo: (r) => textOf(r.commissioningConversion?.regulatorNo),
  meterType: (r) => textOf(r.commissioningConversion?.meterType),
  meterReading: (r) => numOf(r.commissioningConversion?.meterReading),
  nonConversionRemark: (r) => textOf(r.commissioningConversion?.nonConversionRemark),
  tfToRegulator: (r) => numOf(r.giMeasurements?.tfToRegulator),
  inlet: (r) => numOf(r.giMeasurements?.inlet),
  outlet: (r) => numOf(r.giMeasurements?.outlet),
  totalGiPipeHalfInch: (r) => numOf(r.giMeasurements?.totalGiPipeHalfInch),
  giPipeThreeQuarterInch: (r) => numOf(r.giMeasurements?.giPipeThreeQuarterInch),
  giPipeOneInch: (r) => numOf(r.giMeasurements?.giPipeOneInch),
  giPipeOneAndHalfInch: (r) => numOf(r.giMeasurements?.giPipeOneAndHalfInch),
  giPipeTwoInch: (r) => numOf(r.giMeasurements?.giPipeTwoInch),
  giApprovalStatus: (r) => textOf(r.giMeasurements?.approvalStatus),
  giApprovalComments: (r) => textOf(r.giMeasurements?.approvalComments),
  isolationValveHalfInch: (r) => numOf(r.valvesRegulators?.isolationValveHalfInch),
  isolationValveThreeQuarterInch: (r) => numOf(r.valvesRegulators?.isolationValveThreeQuarterInch),
  isolationValveOneInch: (r) => numOf(r.valvesRegulators?.isolationValveOneInch),
  isolationValveOneAndHalfInch: (r) => numOf(r.valvesRegulators?.isolationValveOneAndHalfInch),
  isolationValveTwoInch: (r) => numOf(r.valvesRegulators?.isolationValveTwoInch),
  applianceValveHalfInch: (r) => numOf(r.valvesRegulators?.applianceValveHalfInch),
  regulator6BarTo100Mbar: (r) => numOf(r.valvesRegulators?.regulator6BarTo100Mbar),
  regulator6BarTo21Mbar: (r) => numOf(r.valvesRegulators?.regulator6BarTo21Mbar),
  regulator100MbarTo21Mbar: (r) => numOf(r.valvesRegulators?.regulator100MbarTo21Mbar),
  warningPlate: (r) => numOf(r.valvesRegulators?.warningPlate),
  clampHalfInch: (r) => numOf(r.fittingsAccessories?.clampHalfInch),
  clamp3InchToHalfInch: (r) => numOf(r.fittingsAccessories?.clamp3InchToHalfInch),
  elbowHalfInch: (r) => numOf(r.fittingsAccessories?.elbowHalfInch),
  mfElbowHalfInch: (r) => numOf(r.fittingsAccessories?.mfElbowHalfInch),
  socketHalfInch: (r) => numOf(r.fittingsAccessories?.socketHalfInch),
  teeHalfInch: (r) => numOf(r.fittingsAccessories?.teeHalfInch),
  nipple2Inch: (r) => numOf(r.fittingsAccessories?.nipple2Inch),
  nipple3Inch: (r) => numOf(r.fittingsAccessories?.nipple3Inch),
  nipple4Inch: (r) => numOf(r.fittingsAccessories?.nipple4Inch),
  reducerElbowThreeQuarterToHalfInch: (r) => numOf(r.fittingsAccessories?.reducerElbowThreeQuarterToHalfInch),
  threeQuarterInchTo3Inch: (r) => numOf(r.fittingsAccessories?.threeQuarterInchTo3Inch),
  unionHalfInch: (r) => numOf(r.fittingsAccessories?.unionHalfInch),
  plugHalfInch: (r) => numOf(r.fittingsAccessories?.plugHalfInch),
  fittingsOneAndHalfInchQuantity: (r) => numOf(r.fittingsAccessories?.fittingsOneAndHalfInchQuantity),
  fittingsTwoInchQuantity: (r) => numOf(r.fittingsAccessories?.fittingsTwoInchQuantity),
  extraGiAbove10Metres: (r) => numOf(r.fittingsAccessories?.extraGiAbove10Metres),
  pipe20Length: (r) => numOf(pipeRecord(r, "20_mm")?.lengthMetres),
  pipe20LayingDate: (r) => dateOf(pipeRecord(r, "20_mm")?.layingDate),
  pipe20TestingDate: (r) => dateOf(pipeRecord(r, "20_mm")?.testingDate),
  pipe20PurgingDate: (r) => dateOf(pipeRecord(r, "20_mm")?.purgingDate),
  pipe32Length: (r) => numOf(pipeRecord(r, "32_mm")?.lengthMetres),
  pipe63Length: (r) => numOf(pipeRecord(r, "63_mm")?.lengthMetres),
  pipe90Length: (r) => numOf(pipeRecord(r, "90_mm")?.lengthMetres),
  pipe125Length: (r) => numOf(pipeRecord(r, "125_mm")?.lengthMetres),
  fourMetresUnderGc: (r) => numOf(r.lmcPipelineWork?.fourMetresUnderGc),
  fourMetresAboveGc: (r) => numOf(r.lmcPipelineWork?.fourMetresAboveGc),
  tfHalfInch: (r) => numOf(r.lmcPipelineWork?.tfHalfInch),
  tfOneInch: (r) => numOf(r.lmcPipelineWork?.tfOneInch),
  lmcApprovalStatus: (r) => textOf(r.lmcPipelineWork?.approvalStatus),
  lmcApprovalComments: (r) => textOf(r.lmcPipelineWork?.approvalComments),
  pcc: (r) => numOf(r.lmcPipelineWork?.pcc),
  rccNalaCrossing: (r) => numOf(r.lmcPipelineWork?.rccNalaCrossing),
  paverBlocks: (r) => numOf(r.lmcPipelineWork?.paverBlocks),
  malua: (r) => numOf(r.lmcPipelineWork?.malua),
  hardRock: (r) => numOf(r.lmcPipelineWork?.hardRock),
  civilRemarks: (r) => textOf(r.lmcPipelineWork?.civilRemarks),
  saddle90To32Mm: (r) => numOf(r.mdpeFittings?.saddle90To32Mm),
  saddle90Mm: (r) => numOf(r.mdpeFittings?.saddle90Mm),
  saddle63To32Mm: (r) => numOf(r.mdpeFittings?.saddle63To32Mm),
  saddle32To20Mm: (r) => numOf(r.mdpeFittings?.saddle32To20Mm),
  tee90Mm: (r) => numOf(r.mdpeFittings?.tee90Mm),
  tee32Mm: (r) => numOf(r.mdpeFittings?.tee32Mm),
  tee20Mm: (r) => numOf(r.mdpeFittings?.tee20Mm),
  reducerCoupler90To63Mm: (r) => numOf(r.mdpeFittings?.reducerCoupler90To63Mm),
  reducerCoupler63To32Mm: (r) => numOf(r.mdpeFittings?.reducerCoupler63To32Mm),
  reducerCoupler32To20Mm: (r) => numOf(r.mdpeFittings?.reducerCoupler32To20Mm),
  coupler90Mm: (r) => numOf(r.mdpeFittings?.coupler90Mm),
  coupler32Mm: (r) => numOf(r.mdpeFittings?.coupler32Mm),
  coupler20Mm: (r) => numOf(r.mdpeFittings?.coupler20Mm),
  endCap90Mm: (r) => numOf(r.mdpeFittings?.endCap90Mm),
  jmrDone: (r) => boolOf(r.billingCompletion?.jmrDone),
  jmrSubmittedInPbg: (r) => boolOf(r.billingCompletion?.jmrSubmittedInPbg),
  giBillDone: (r) => boolOf(r.billingCompletion?.giBillDone),
  gcBillDone: (r) => boolOf(r.billingCompletion?.gcBillDone),
  conversionBillDone: (r) => boolOf(r.billingCompletion?.conversionBillDone),
  billingRemark: (r) => textOf(r.billingCompletion?.remark),
  surveyId: (r) => textOf(r.survey?.surveyId),
  surveyDate: (r) => dateOf(r.survey?.surveyDate),
  assignedSurveyor: (r) => textOf(r.survey?.assignedSurveyor),
  submittedBy: (r) => textOf(r.survey?.submittedBy),
  submissionDate: (r) => dateOf(r.survey?.submissionDate),
  latitude: (r) => numOf(r.survey?.latitude),
  longitude: (r) => numOf(r.survey?.longitude),
  captureAccuracy: (r) => textOf(r.survey?.captureAccuracy),
  workableStatus: (r) => textOf(r.survey?.workableStatus),
  surveyApprovalStatus: (r) => textOf(r.survey?.approvalStatus),
  initialMeasurements: (r) => textOf(r.survey?.initialMeasurements),
  siteAccessibility: (r) => textOf(r.survey?.siteAccessibility),
  meterPlacement: (r) => textOf(r.survey?.meterPlacement),
  pipelineRoute: (r) => textOf(r.survey?.pipelineRoute),
  civilWorkRequired: (r) => textOf(r.survey?.civilWorkRequired),
  obstaclesRemarks: (r) => textOf(r.survey?.obstaclesRemarks),
  surveyNotes: (r) => textOf(r.survey?.notes),
  surveyReason: (r) => textOf(r.survey?.reason),
  surveyRecommendedAction: (r) => textOf(r.survey?.recommendedAction),
  surveyExpectedResolutionDate: (r) => dateOf(r.survey?.expectedResolutionDate),
  surveyApprovalComments: (r) => textOf(r.survey?.approvalComments),
  // Same resolveSectionCompletion() used for the Web table's completionAudit
  // projection (customers.service.ts list()) - completedBy resolves through
  // the identical id->name lookup, so Web and Excel can never disagree here.
  giCompletedOn: (r, _n, ctx) => dateOf(resolveSectionCompletion(r.giMeasurements, ctx.resolveUser).completedOn),
  giCompletedBy: (r, _n, ctx) => resolveSectionCompletion(r.giMeasurements, ctx.resolveUser).completedBy,
  valvesCompletedOn: (r, _n, ctx) => dateOf(resolveSectionCompletion(r.valvesRegulators, ctx.resolveUser).completedOn),
  valvesCompletedBy: (r, _n, ctx) => resolveSectionCompletion(r.valvesRegulators, ctx.resolveUser).completedBy,
  fittingsCompletedOn: (r, _n, ctx) =>
    dateOf(resolveSectionCompletion(r.fittingsAccessories, ctx.resolveUser).completedOn),
  fittingsCompletedBy: (r, _n, ctx) => resolveSectionCompletion(r.fittingsAccessories, ctx.resolveUser).completedBy,
  lmcCompletedOn: (r, _n, ctx) => dateOf(resolveSectionCompletion(r.lmcPipelineWork, ctx.resolveUser).completedOn),
  lmcCompletedBy: (r, _n, ctx) => resolveSectionCompletion(r.lmcPipelineWork, ctx.resolveUser).completedBy,
  mdpeCompletedOn: (r, _n, ctx) => dateOf(resolveSectionCompletion(r.mdpeFittings, ctx.resolveUser).completedOn),
  mdpeCompletedBy: (r, _n, ctx) => resolveSectionCompletion(r.mdpeFittings, ctx.resolveUser).completedBy,
  createdAt: (r) => dateOf(r.createdAt),
  updatedAt: (r) => dateOf(r.updatedAt),
};

// Fails loudly at import time (module load, i.e. server start) rather than
// silently rendering a blank column if the catalog and this getter map ever
// drift - a missing getter here is a real gap, never worth guessing at.
const missingGetters = CUSTOMER_COLUMN_CATALOG.map((entry) => entry.key).filter((key) => !CUSTOMER_COLUMN_GETTERS[key]);
if (missingGetters.length) {
  throw new Error(`customer-register-columns.ts is missing value getters for: ${missingGetters.join(", ")}`);
}

/** Number of leading identity columns kept frozen while scrolling right. */
const FROZEN_IDENTITY_COLS = 5;

export function writeCustomerRegisterSheet(sheet: ExcelJS.Worksheet, columns: { header: string; type: ColType }[], valueRows: ExcelJS.CellValue[][]) {
  writeValueMatrixSheet(sheet, columns, valueRows, {
    frozenCols: Math.min(FROZEN_IDENTITY_COLS, columns.length),
    wrapHeader: false,
  });
}
