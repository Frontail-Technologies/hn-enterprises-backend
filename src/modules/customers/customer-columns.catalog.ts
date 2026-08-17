/**
 * Single authoritative Customer column catalog (§ shared column config). Every
 * static/relational/section field either the Web Customer master sheet or the
 * Customer Register Excel export can show is listed here exactly once, keyed by
 * a stable camelCase `key` - the same key both consumers (and the saved
 * per-user preference) use to identify a column. Dynamic/custom fields are NOT
 * listed here (they come from `custom_field_definitions` at request time and
 * are appended after this catalog by the resolver) but participate in the same
 * order/visibility mechanism once appended.
 *
 * This file only carries metadata (label/group/type/default width/default
 * order/default visibility) - it deliberately has no value-getter functions.
 * How to pull a value for a given key off a row is necessarily separate per
 * runtime (a DB row on the backend export vs. an already-flattened API
 * response on the frontend table), so each side keeps its own small resolver
 * keyed by these same `key`s. What must never fork is the label/order/
 * visibility - that's exactly what this catalog plus the saved preference
 * settle once, for both consumers.
 */

export type CustomerColumnType = "text" | "num" | "money" | "date" | "bool";

export type CustomerColumnCatalogEntry = {
  key: string;
  label: string;
  group: string;
  type: CustomerColumnType;
  width: number;
  /** Hidden by default for new users/no saved preference - still fully configurable. */
  defaultVisible?: boolean;
};

export const CUSTOMER_COLUMN_CATALOG: CustomerColumnCatalogEntry[] = [
  // --- Reports ---
  { key: "reportNoGi", label: "Report No-GI", group: "Reports", type: "text", width: 150 },
  { key: "reportNoGc", label: "Report No-GC", group: "Reports", type: "text", width: 150 },
  { key: "reportNoConversion", label: "Report No-Conversion", group: "Reports", type: "text", width: 180 },
  // --- Customer ---
  { key: "trBpNo", label: "TR / BP No.", group: "Customer", type: "text", width: 150 },
  { key: "customerName", label: "Customer Name", group: "Customer", type: "text", width: 190 },
  { key: "mobileNo", label: "Mobile No.", group: "Customer", type: "text", width: 130 },
  { key: "fullAddress", label: "Full Address", group: "Customer", type: "text", width: 260 },
  { key: "projectName", label: "Project", group: "Customer", type: "text", width: 190 },
  { key: "siteArea", label: "Site / Area", group: "Customer", type: "text", width: 170 },
  { key: "city", label: "City", group: "Customer", type: "text", width: 120, defaultVisible: false },
  { key: "status", label: "Status", group: "Customer", type: "text", width: 120, defaultVisible: false },
  { key: "scheme", label: "Scheme", group: "Customer", type: "text", width: 130 },
  { key: "jobCardDone", label: "Job Card Done", group: "Customer", type: "text", width: 140 },
  { key: "connectionType", label: "Connection Type", group: "Customer", type: "text", width: 150 },
  { key: "houseType", label: "House Type", group: "Customer", type: "text", width: 140 },
  { key: "kycVerified", label: "KYC Verified", group: "Customer", type: "text", width: 120, defaultVisible: false },
  // --- Payment ---
  { key: "paymentStatus", label: "Payment Status", group: "Payment", type: "text", width: 140 },
  { key: "paymentMode", label: "Payment Mode", group: "Payment", type: "text", width: 130 },
  { key: "initialAmount", label: "Initial Amount", group: "Payment", type: "money", width: 140 },
  { key: "lastPaymentDate", label: "Last Payment Date", group: "Payment", type: "date", width: 150, defaultVisible: false },
  // --- Assignment ---
  { key: "plumberName", label: "Plumber Name", group: "Assignment", type: "text", width: 150 },
  { key: "supervisorName", label: "Supervisor Name", group: "Assignment", type: "text", width: 160 },
  // --- Meter ---
  { key: "meterNo", label: "Meter No.", group: "Meter", type: "text", width: 140 },
  { key: "installationDate", label: "Installation Date", group: "Meter", type: "date", width: 150 },
  // --- Commissioning ---
  { key: "commissioningDate", label: "Commissioning Date", group: "Commissioning", type: "date", width: 160 },
  { key: "conversionDate", label: "Conversion Date", group: "Commissioning", type: "date", width: 150 },
  { key: "regulatorPressure", label: "Regulator Pressure", group: "Commissioning", type: "text", width: 160 },
  { key: "regulatorNo", label: "Regulator No.", group: "Commissioning", type: "text", width: 140 },
  { key: "meterType", label: "Meter Type", group: "Commissioning", type: "text", width: 130 },
  { key: "meterReading", label: "Meter Reading", group: "Commissioning", type: "num", width: 140 },
  { key: "nonConversionRemark", label: "Non Conversion Remark", group: "Commissioning", type: "text", width: 220 },
  // --- GI ---
  { key: "tfToRegulator", label: "TF to Regulator GI Measurement", group: "GI", type: "num", width: 210 },
  { key: "inlet", label: "Inlet GI Measurement", group: "GI", type: "num", width: 180 },
  { key: "outlet", label: "Outlet GI Measurement", group: "GI", type: "num", width: 180 },
  { key: "totalGiPipeHalfInch", label: "Total GI Pipe 1/2 inch", group: "GI", type: "num", width: 180 },
  { key: "giPipeThreeQuarterInch", label: "GI Pipe 3/4 inch", group: "GI", type: "num", width: 160 },
  { key: "giPipeOneInch", label: "GI Pipe 1 inch", group: "GI", type: "num", width: 140 },
  { key: "giPipeOneAndHalfInch", label: "GI Pipe 1.5 inch Welded", group: "GI", type: "num", width: 190 },
  { key: "giPipeTwoInch", label: "GI Pipe 2 inch Welded", group: "GI", type: "num", width: 180 },
  { key: "giApprovalStatus", label: "GI Approval Status", group: "GI", type: "text", width: 150, defaultVisible: false },
  { key: "giApprovalComments", label: "GI Approval Comments", group: "GI", type: "text", width: 200, defaultVisible: false },
  // --- Valves ---
  { key: "isolationValveHalfInch", label: "Isolation Valve 1/2 inch", group: "Valves", type: "num", width: 190 },
  { key: "isolationValveThreeQuarterInch", label: "Isolation Valve 3/4 inch", group: "Valves", type: "num", width: 190 },
  { key: "isolationValveOneInch", label: "Isolation Valve 1 inch", group: "Valves", type: "num", width: 170 },
  { key: "isolationValveOneAndHalfInch", label: "Isolation Valve 1.5 inch", group: "Valves", type: "num", width: 180 },
  { key: "isolationValveTwoInch", label: "Isolation Valve 2 inch", group: "Valves", type: "num", width: 170 },
  { key: "applianceValveHalfInch", label: "Appliance Valve 1/2 inch", group: "Valves", type: "num", width: 190 },
  // --- Regulators ---
  { key: "regulator6BarTo100Mbar", label: "Regulator 6Bar-100mBar", group: "Regulators", type: "num", width: 190 },
  { key: "regulator6BarTo21Mbar", label: "Regulator 6Bar-21mBar", group: "Regulators", type: "num", width: 180 },
  { key: "regulator100MbarTo21Mbar", label: "Regulator 100mBar-21mBar", group: "Regulators", type: "num", width: 200 },
  { key: "warningPlate", label: "Warning Plate", group: "Regulators", type: "num", width: 140 },
  // --- Fittings ---
  { key: "clampHalfInch", label: "Clamp 1/2 inch", group: "Fittings", type: "num", width: 140 },
  { key: "clamp3InchToHalfInch", label: "Clamp 3 inch-1/2 inch", group: "Fittings", type: "num", width: 180 },
  { key: "elbowHalfInch", label: "Elbow 1/2 inch", group: "Fittings", type: "num", width: 140 },
  { key: "mfElbowHalfInch", label: "M/F Elbow 1/2 inch", group: "Fittings", type: "num", width: 160 },
  { key: "socketHalfInch", label: "Socket 1/2 inch", group: "Fittings", type: "num", width: 150 },
  { key: "teeHalfInch", label: "Tee 1/2 inch", group: "Fittings", type: "num", width: 130 },
  { key: "nipple2Inch", label: "Nipple 2 inch", group: "Fittings", type: "num", width: 130 },
  { key: "nipple3Inch", label: "Nipple 3 inch", group: "Fittings", type: "num", width: 130 },
  { key: "nipple4Inch", label: "Nipple 4 inch", group: "Fittings", type: "num", width: 130 },
  { key: "reducerElbowThreeQuarterToHalfInch", label: "Reducer Elbow 3/4-1/2 inch", group: "Fittings", type: "num", width: 210 },
  { key: "threeQuarterInchTo3Inch", label: "3/4 inch-3 inch", group: "Fittings", type: "num", width: 150 },
  { key: "unionHalfInch", label: "Union 1/2 inch", group: "Fittings", type: "num", width: 140 },
  { key: "plugHalfInch", label: "Plug 1/2 inch", group: "Fittings", type: "num", width: 130 },
  { key: "fittingsOneAndHalfInchQuantity", label: "Fittings Qty 1.5 inch", group: "Fittings", type: "num", width: 160, defaultVisible: false },
  { key: "fittingsTwoInchQuantity", label: "Fittings Qty 2 inch", group: "Fittings", type: "num", width: 150, defaultVisible: false },
  { key: "extraGiAbove10Metres", label: "Extra GI Above 10 Metres", group: "Fittings", type: "num", width: 200 },
  // --- LMC ---
  { key: "pipe20Length", label: "20 mm Pipe Length", group: "LMC", type: "num", width: 160 },
  { key: "pipe20LayingDate", label: "20 mm Laying Date", group: "LMC", type: "date", width: 160 },
  { key: "pipe20TestingDate", label: "20 mm Testing Date", group: "LMC", type: "date", width: 160 },
  { key: "pipe20PurgingDate", label: "20 mm Purging Date", group: "LMC", type: "date", width: 160 },
  { key: "pipe32Length", label: "32 mm Pipe Length", group: "LMC", type: "num", width: 160 },
  { key: "pipe63Length", label: "63 mm Pipe Length", group: "LMC", type: "num", width: 160 },
  { key: "pipe90Length", label: "90 mm Pipe Length", group: "LMC", type: "num", width: 160 },
  { key: "pipe125Length", label: "125 mm Pipe Length", group: "LMC", type: "num", width: 170 },
  { key: "fourMetresUnderGc", label: "4 Metres Under GC", group: "LMC", type: "num", width: 160 },
  { key: "fourMetresAboveGc", label: "4 Metres Above GC", group: "LMC", type: "num", width: 160 },
  { key: "tfHalfInch", label: "TF 1/2 inch", group: "LMC", type: "num", width: 130 },
  { key: "tfOneInch", label: "TF 1 inch", group: "LMC", type: "num", width: 120 },
  { key: "lmcApprovalStatus", label: "LMC Approval Status", group: "LMC", type: "text", width: 160, defaultVisible: false },
  { key: "lmcApprovalComments", label: "LMC Approval Comments", group: "LMC", type: "text", width: 200, defaultVisible: false },
  // --- Civil ---
  { key: "pcc", label: "PCC", group: "Civil", type: "num", width: 100 },
  { key: "rccNalaCrossing", label: "RCC / Nala Crossing", group: "Civil", type: "num", width: 170 },
  { key: "paverBlocks", label: "Paver Blocks", group: "Civil", type: "num", width: 140 },
  { key: "malua", label: "Malua", group: "Civil", type: "num", width: 110 },
  { key: "hardRock", label: "Hard Rock", group: "Civil", type: "num", width: 120 },
  { key: "civilRemarks", label: "Civil Remarks", group: "Civil", type: "text", width: 200, defaultVisible: false },
  // --- MDPE ---
  { key: "saddle90To32Mm", label: "Saddle 90-32 mm", group: "MDPE", type: "num", width: 150 },
  { key: "saddle90Mm", label: "Saddle 90 mm", group: "MDPE", type: "num", width: 140, defaultVisible: false },
  { key: "saddle63To32Mm", label: "Saddle 63-32 mm", group: "MDPE", type: "num", width: 150 },
  { key: "saddle32To20Mm", label: "Saddle 32-20 mm", group: "MDPE", type: "num", width: 150 },
  { key: "tee90Mm", label: "90 mm Tee", group: "MDPE", type: "num", width: 120 },
  { key: "tee32Mm", label: "Tee 32 mm", group: "MDPE", type: "num", width: 120 },
  { key: "tee20Mm", label: "Tee 20 mm", group: "MDPE", type: "num", width: 120 },
  { key: "reducerCoupler90To63Mm", label: "90-63 mm Reducer Coupler", group: "MDPE", type: "num", width: 210 },
  { key: "reducerCoupler63To32Mm", label: "Reducer Coupler 63-32 mm", group: "MDPE", type: "num", width: 210 },
  { key: "reducerCoupler32To20Mm", label: "Reducer Coupler 32-20 mm", group: "MDPE", type: "num", width: 210 },
  { key: "coupler90Mm", label: "90 mm Coupler", group: "MDPE", type: "num", width: 140 },
  { key: "coupler32Mm", label: "Coupler 32 mm", group: "MDPE", type: "num", width: 140 },
  { key: "coupler20Mm", label: "Coupler 20 mm", group: "MDPE", type: "num", width: 140 },
  { key: "endCap90Mm", label: "90 mm End Cap", group: "MDPE", type: "num", width: 140 },
  // --- Billing ---
  { key: "jmrDone", label: "JMR Done", group: "Billing", type: "bool", width: 120 },
  { key: "jmrSubmittedInPbg", label: "JMR Submitted in PBG", group: "Billing", type: "bool", width: 180 },
  { key: "giBillDone", label: "GI Bill Done", group: "Billing", type: "bool", width: 130 },
  { key: "gcBillDone", label: "GC Bill Done", group: "Billing", type: "bool", width: 130 },
  { key: "conversionBillDone", label: "Conversion Bill Done", group: "Billing", type: "bool", width: 170 },
  { key: "billingRemark", label: "Billing Remark", group: "Billing", type: "text", width: 220 },
  // --- Survey ---
  { key: "surveyId", label: "Survey ID", group: "Survey", type: "text", width: 140, defaultVisible: false },
  { key: "surveyDate", label: "Survey Date", group: "Survey", type: "date", width: 130 },
  { key: "assignedSurveyor", label: "Assigned Surveyor", group: "Survey", type: "text", width: 160, defaultVisible: false },
  { key: "submittedBy", label: "Submitted By", group: "Survey", type: "text", width: 150, defaultVisible: false },
  { key: "submissionDate", label: "Submission Date", group: "Survey", type: "date", width: 140, defaultVisible: false },
  { key: "latitude", label: "Latitude", group: "Survey", type: "num", width: 110, defaultVisible: false },
  { key: "longitude", label: "Longitude", group: "Survey", type: "num", width: 110, defaultVisible: false },
  { key: "captureAccuracy", label: "Capture Accuracy", group: "Survey", type: "text", width: 140, defaultVisible: false },
  { key: "workableStatus", label: "Workable Status", group: "Survey", type: "text", width: 150 },
  { key: "surveyApprovalStatus", label: "Survey Approval Status", group: "Survey", type: "text", width: 160, defaultVisible: false },
  { key: "initialMeasurements", label: "Initial Measurements", group: "Survey", type: "text", width: 200, defaultVisible: false },
  { key: "siteAccessibility", label: "Site Accessibility", group: "Survey", type: "text", width: 160, defaultVisible: false },
  { key: "meterPlacement", label: "Meter Placement", group: "Survey", type: "text", width: 150, defaultVisible: false },
  { key: "pipelineRoute", label: "Pipeline Route", group: "Survey", type: "text", width: 160, defaultVisible: false },
  { key: "civilWorkRequired", label: "Civil Work Required", group: "Survey", type: "text", width: 160, defaultVisible: false },
  { key: "obstaclesRemarks", label: "Obstacles / Remarks", group: "Survey", type: "text", width: 220 },
  { key: "surveyNotes", label: "Survey Notes", group: "Survey", type: "text", width: 200, defaultVisible: false },
  { key: "surveyReason", label: "Reason", group: "Survey", type: "text", width: 180, defaultVisible: false },
  { key: "surveyRecommendedAction", label: "Recommended Action", group: "Survey", type: "text", width: 200, defaultVisible: false },
  { key: "surveyExpectedResolutionDate", label: "Expected Resolution Date", group: "Survey", type: "date", width: 170, defaultVisible: false },
  { key: "surveyApprovalComments", label: "Survey Approval Comments", group: "Survey", type: "text", width: 200, defaultVisible: false },
  // --- Completion Audit ---
  { key: "giCompletedOn", label: "GI Completed On", group: "Completion Audit", type: "date", width: 150, defaultVisible: false },
  { key: "giCompletedBy", label: "GI Completed By", group: "Completion Audit", type: "text", width: 160, defaultVisible: false },
  { key: "valvesCompletedOn", label: "Valves Completed On", group: "Completion Audit", type: "date", width: 160, defaultVisible: false },
  { key: "valvesCompletedBy", label: "Valves Completed By", group: "Completion Audit", type: "text", width: 170, defaultVisible: false },
  { key: "fittingsCompletedOn", label: "Fittings Completed On", group: "Completion Audit", type: "date", width: 160, defaultVisible: false },
  { key: "fittingsCompletedBy", label: "Fittings Completed By", group: "Completion Audit", type: "text", width: 170, defaultVisible: false },
  { key: "lmcCompletedOn", label: "LMC Completed On", group: "Completion Audit", type: "date", width: 160, defaultVisible: false },
  { key: "lmcCompletedBy", label: "LMC Completed By", group: "Completion Audit", type: "text", width: 160, defaultVisible: false },
  { key: "mdpeCompletedOn", label: "MDPE Completed On", group: "Completion Audit", type: "date", width: 160, defaultVisible: false },
  { key: "mdpeCompletedBy", label: "MDPE Completed By", group: "Completion Audit", type: "text", width: 160, defaultVisible: false },
  // --- Audit ---
  { key: "createdAt", label: "Created On", group: "Audit", type: "date", width: 150, defaultVisible: false },
  { key: "updatedAt", label: "Updated On", group: "Audit", type: "date", width: 150, defaultVisible: false },
];

export const CUSTOMER_COLUMN_KEYS = new Set(CUSTOMER_COLUMN_CATALOG.map((entry) => entry.key));
