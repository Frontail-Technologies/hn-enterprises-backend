import ExcelJS from "exceljs";
import type { NormalizedImportRow, NormalizedLmcPipeRecord, RawSheetRow, SheetCellValue } from "./master-import.types";

type FieldTarget =
  | "projectName"
  | "projectCode"
  | "city"
  | "siteName"
  | "siteCode"
  | "siteAddress"
  | "customerName"
  | "trBpNumber"
  | "mobileNumber"
  | "fullAddress"
  | "connectionType"
  | "houseType"
  | "scheme"
  | "plumberName"
  | "supervisorName"
  | "giReportNumber"
  | "gcReportNumber"
  | "conversionReportNumber"
  | "customerStatus"
  | `survey.${string}`
  | `giMeasurements.${string}`
  | `valvesRegulators.${string}`
  | `fittingsAccessories.${string}`
  | `lmcPipelineWork.${string}`
  | `mdpeFittings.${string}`
  | `commissioningConversion.${string}`
  | `billingCompletion.${string}`
  | `lmcPipe.${"20_mm" | "32_mm" | "63_mm" | "90_mm" | "125_mm" | "other"}.${string}`;

const HEADER_ALIASES: Record<string, FieldTarget> = {
  project: "projectName",
  projectname: "projectName",
  projectsite: "projectName",
  projectcode: "projectCode",
  contractid: "projectCode",
  city: "city",
  site: "siteName",
  sitearea: "siteName",
  area: "siteName",
  areasite: "siteName",
  sitename: "siteName",
  sitecode: "siteCode",
  address: "fullAddress",
  fulladdress: "fullAddress",
  siteaddress: "siteAddress",
  reportnogi: "giReportNumber",
  gireportno: "giReportNumber",
  reportnogc: "gcReportNumber",
  gcreportno: "gcReportNumber",
  reportnoconversion: "conversionReportNumber",
  conversionreportno: "conversionReportNumber",
  trno: "trBpNumber",
  bpno: "trBpNumber",
  trbpno: "trBpNumber",
  bptrno: "trBpNumber",
  trnobpno: "trBpNumber",
  mobile: "mobileNumber",
  mobileno: "mobileNumber",
  mobilenumber: "mobileNumber",
  phoneno: "mobileNumber",
  phone: "mobileNumber",
  name: "customerName",
  customername: "customerName",
  paymentstatus: "billingCompletion.paymentStatus",
  paymentmode: "billingCompletion.paymentMode",
  initialamount: "billingCompletion.initialAmount",
  scheme: "scheme",
  plumber: "plumberName",
  plumbername: "plumberName",
  supervisor: "supervisorName",
  supervisorname: "supervisorName",
  customerstatus: "customerStatus",
  status: "customerStatus",
  jobcarddone: "billingCompletion.jobCardDone",
  connectiontype: "connectionType",
  housetype: "houseType",
  surveydate: "survey.surveyDate",
  workablestatus: "survey.workableStatus",
  surveyremarks: "survey.obstaclesRemarks",
  siteaccessibility: "survey.siteAccessibility",
  meterplacement: "survey.meterPlacement",
  pipelineroute: "survey.pipelineRoute",
  civilworkrequired: "survey.civilWorkRequired",
  initialmeasurements: "survey.initialMeasurements",
  tftoregulator: "giMeasurements.tfToRegulator",
  inlet: "giMeasurements.inlet",
  outlet: "giMeasurements.outlet",
  totalgipipehalfinch: "giMeasurements.totalGiPipeHalfInch",
  totalgipipe12inch: "giMeasurements.totalGiPipeHalfInch",
  gipipe34inch: "giMeasurements.giPipeThreeQuarterInch",
  gipipe1inch: "giMeasurements.giPipeOneInch",
  gipipe15inch: "giMeasurements.giPipeOneAndHalfInch",
  gipipe2inch: "giMeasurements.giPipeTwoInch",
  isolationvalve12inch: "valvesRegulators.isolationValveHalfInch",
  isolationvalve34inch: "valvesRegulators.isolationValveThreeQuarterInch",
  isolationvalve1inch: "valvesRegulators.isolationValveOneInch",
  isolationvalve15inch: "valvesRegulators.isolationValveOneAndHalfInch",
  isolationvalve2inch: "valvesRegulators.isolationValveTwoInch",
  appliancevalve12inch: "valvesRegulators.applianceValveHalfInch",
  regulator6bar100mbar: "valvesRegulators.regulator6BarTo100Mbar",
  regulator6bar21mbar: "valvesRegulators.regulator6BarTo21Mbar",
  regulator100mbar21mbar: "valvesRegulators.regulator100MbarTo21Mbar",
  warningplate: "valvesRegulators.warningPlate",
  clamp12inch: "fittingsAccessories.clampHalfInch",
  clamp3inch12inch: "fittingsAccessories.clamp3InchToHalfInch",
  elbow12inch: "fittingsAccessories.elbowHalfInch",
  mfelbow12inch: "fittingsAccessories.mfElbowHalfInch",
  socket12inch: "fittingsAccessories.socketHalfInch",
  tee12inch: "fittingsAccessories.teeHalfInch",
  nipple2inch: "fittingsAccessories.nipple2Inch",
  nipple3inch: "fittingsAccessories.nipple3Inch",
  nipple4inch: "fittingsAccessories.nipple4Inch",
  reducerelbow34inch12inch: "fittingsAccessories.reducerElbowThreeQuarterToHalfInch",
  union12inch: "fittingsAccessories.unionHalfInch",
  plug12inch: "fittingsAccessories.plugHalfInch",
  extragiabove10metres: "fittingsAccessories.extraGiAbove10Metres",
  fourmetresundergc: "lmcPipelineWork.fourMetresUnderGc",
  fourmetresabovegc: "lmcPipelineWork.fourMetresAboveGc",
  tf12inch: "lmcPipelineWork.tfHalfInch",
  tf1inch: "lmcPipelineWork.tfOneInch",
  pcc: "lmcPipelineWork.pcc",
  rccnalacrossing: "lmcPipelineWork.rccNalaCrossing",
  paverblocks: "lmcPipelineWork.paverBlocks",
  malua: "lmcPipelineWork.malua",
  hardrock: "lmcPipelineWork.hardRock",
  saddle9032mm: "mdpeFittings.saddle90To32Mm",
  saddle90mm: "mdpeFittings.saddle90Mm",
  saddle6332mm: "mdpeFittings.saddle63To32Mm",
  saddle3220mm: "mdpeFittings.saddle32To20Mm",
  tee90mm: "mdpeFittings.tee90Mm",
  tee32mm: "mdpeFittings.tee32Mm",
  tee20mm: "mdpeFittings.tee20Mm",
  reducercoupler9063mm: "mdpeFittings.reducerCoupler90To63Mm",
  reducercoupler6332mm: "mdpeFittings.reducerCoupler63To32Mm",
  reducercoupler3220mm: "mdpeFittings.reducerCoupler32To20Mm",
  coupler90mm: "mdpeFittings.coupler90Mm",
  coupler32mm: "mdpeFittings.coupler32Mm",
  coupler20mm: "mdpeFittings.coupler20Mm",
  endcap90mm: "mdpeFittings.endCap90Mm",
  meterno: "commissioningConversion.meterNo",
  installationdate: "commissioningConversion.installationDate",
  commissioningdate: "commissioningConversion.commissioningDate",
  conversiondate: "commissioningConversion.conversionDate",
  regulatorpressure: "commissioningConversion.regulatorPressure",
  regulatorno: "commissioningConversion.regulatorNo",
  metertype: "commissioningConversion.meterType",
  meterreading: "commissioningConversion.meterReading",
  nonconversionremark: "commissioningConversion.nonConversionRemark",
  jmrdone: "billingCompletion.jmrDone",
  jmrsubmittedinpbg: "billingCompletion.jmrSubmittedInPbg",
  gibilldone: "billingCompletion.giBillDone",
  gcbilldone: "billingCompletion.gcBillDone",
  conversionbilldone: "billingCompletion.conversionBillDone",
  remark: "billingCompletion.remark",
};

const PIPE_HEADER_ALIASES: Record<string, NormalizedLmcPipeRecord["pipeSize"]> = {
  "20mm": "20_mm",
  "20mmpipe": "20_mm",
  total20mmlaying: "20_mm",
  "32mm": "32_mm",
  "32mmpipe": "32_mm",
  "63mm": "63_mm",
  "63mmpipe": "63_mm",
  "90mm": "90_mm",
  "90mmpipe": "90_mm",
  "125mm": "125_mm",
  "125mmpipe": "125_mm",
};

const PIPE_PROPERTY_ALIASES: Record<string, keyof Omit<NormalizedLmcPipeRecord, "pipeSize">> = {
  length: "lengthMetres",
  quantity: "lengthMetres",
  qty: "lengthMetres",
  laying: "lengthMetres",
  layingdate: "layingDate",
  testingdate: "testingDate",
  purgingdate: "purgingDate",
  layingstatus: "layingStatus",
  testingstatus: "testingStatus",
  purgingstatus: "purgingStatus",
  joint: "jointFittingDetails",
  jointdetails: "jointFittingDetails",
  fittingdetails: "jointFittingDetails",
  jointfittingdetails: "jointFittingDetails",
  remarks: "remarks",
  remark: "remarks",
};

export function canonicalHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/½/g, "12")
    .replace(/¾/g, "34")
    .replace(/1½/g, "15")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export async function readSheetRows(file: File): Promise<RawSheetRow[]> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (fileName.endsWith(".csv")) {
    return parseCsvRows(buffer.toString("utf8"));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("No worksheet found in uploaded file");
  }

  const matrix: SheetCellValue[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values;
    const cells = Array.isArray(values) ? values.slice(1).map(extractCellValue) : [];
    matrix.push(cells);
  });

  return matrixToRows(matrix);
}

export function mapRows(rows: RawSheetRow[]): NormalizedImportRow[] {
  const seenTrBp = new Map<string, number>();

  return rows.map((row) => {
    const normalized = createEmptyNormalizedRow(row);

    for (const [label, value] of Object.entries(row.values)) {
      const cleanValue = normalizeText(value);
      if (!cleanValue) continue;

      const target = resolveHeaderTarget(label);
      if (!target) {
        normalized.customFields[label] = value instanceof Date ? value.toISOString() : value;
        continue;
      }

      setMappedValue(normalized, target, value);
    }

    if (!normalized.projectName) normalized.issues.push("Project is required");
    if (!normalized.siteName) normalized.issues.push("Site / area is required");
    if (!normalized.customerName) normalized.issues.push("Customer name is required");
    if (!normalized.trBpNumber) normalized.issues.push("BP/TR number is required");

    const trBpKey = normalizeKey(normalized.trBpNumber);
    if (trBpKey) {
      const duplicateRow = seenTrBp.get(trBpKey);
      if (duplicateRow) {
        normalized.issues.push(`Duplicate BP/TR number in row ${duplicateRow}`);
      } else {
        seenTrBp.set(trBpKey, row.rowNumber);
      }
    }

    const mobileDigits = normalized.mobileNumber.replace(/\D/g, "");
    if (normalized.mobileNumber && mobileDigits.length < 10) {
      normalized.warnings.push("Mobile number looks incomplete");
    }

    return normalized;
  });
}

function parseCsvRows(content: string) {
  const matrix = content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);

  return matrixToRows(matrix);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function matrixToRows(matrix: SheetCellValue[][]): RawSheetRow[] {
  const headerIndex = findHeaderIndex(matrix);
  const headers = (matrix[headerIndex] ?? []).map((cell) => normalizeText(cell));

  return matrix
    .slice(headerIndex + 1)
    .map((cells, index) => {
      const values: Record<string, SheetCellValue> = {};
      headers.forEach((header, cellIndex) => {
        if (!header) return;
        const value = cells[cellIndex] ?? null;
        if (normalizeText(value)) values[header] = value;
      });
      return {
        rowNumber: headerIndex + index + 2,
        values,
      };
    })
    .filter((row) => Object.keys(row.values).length > 0);
}

function findHeaderIndex(matrix: SheetCellValue[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  matrix.forEach((row, index) => {
    const score = row.reduce<number>((currentScore, cell) => {
      const header = normalizeText(cell);
      if (!header) return currentScore;
      return currentScore + (resolveHeaderTarget(header) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function extractCellValue(value: unknown): SheetCellValue {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (value && typeof value === "object") {
    const maybeFormula = value as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (maybeFormula.result !== undefined) return extractCellValue(maybeFormula.result);
    if (maybeFormula.text) return maybeFormula.text;
    if (Array.isArray(maybeFormula.richText)) {
      return maybeFormula.richText.map((part) => part.text).join("");
    }
  }

  return normalizeText(value);
}

function resolveHeaderTarget(label: string): FieldTarget | null {
  const canonical = canonicalHeader(label);
  const direct = HEADER_ALIASES[canonical];
  if (direct) return direct;

  for (const [pipeAlias, pipeSize] of Object.entries(PIPE_HEADER_ALIASES)) {
    if (!canonical.includes(pipeAlias)) continue;

    const remaining = canonical.replace(pipeAlias, "");
    const property = PIPE_PROPERTY_ALIASES[remaining] ?? PIPE_PROPERTY_ALIASES.laying;
    return `lmcPipe.${pipeSize}.${property}`;
  }

  return null;
}

function createEmptyNormalizedRow(row: RawSheetRow): NormalizedImportRow {
  return {
    rowNumber: row.rowNumber,
    rawData: row.values,
    projectName: "",
    projectCode: "",
    city: "",
    siteName: "",
    siteCode: "",
    siteAddress: "",
    customerName: "",
    trBpNumber: "",
    mobileNumber: "",
    fullAddress: "",
    connectionType: "",
    houseType: "",
    scheme: "",
    plumberName: "",
    supervisorName: "",
    giReportNumber: "",
    gcReportNumber: "",
    conversionReportNumber: "",
    customerStatus: "",
    survey: {},
    giMeasurements: {},
    valvesRegulators: {},
    fittingsAccessories: {},
    lmcPipelineWork: {},
    lmcPipeRecords: [],
    mdpeFittings: {},
    commissioningConversion: {},
    billingCompletion: {},
    customFields: {},
    issues: [],
    warnings: [],
  };
}

function setMappedValue(row: NormalizedImportRow, target: FieldTarget, value: SheetCellValue) {
  const normalizedValue = normalizeFieldValue(value);

  if (!target.includes(".")) {
    row[target as keyof Pick<
      NormalizedImportRow,
      | "projectName"
      | "projectCode"
      | "city"
      | "siteName"
      | "siteCode"
      | "siteAddress"
      | "customerName"
      | "trBpNumber"
      | "mobileNumber"
      | "fullAddress"
      | "connectionType"
      | "houseType"
      | "scheme"
      | "plumberName"
      | "supervisorName"
      | "giReportNumber"
      | "gcReportNumber"
      | "conversionReportNumber"
      | "customerStatus"
    >] = normalizedValue;
    return;
  }

  const [group, key, nestedKey] = target.split(".");

  if (group === "lmcPipe" && key && nestedKey) {
    const existing = row.lmcPipeRecords.find((record) => record.pipeSize === key);
    const record = existing ?? { pipeSize: key as NormalizedLmcPipeRecord["pipeSize"] };
    Object.assign(record, { [nestedKey]: normalizedValue });
    if (!existing) row.lmcPipeRecords.push(record);
    return;
  }

  const section = row[group as keyof Pick<
    NormalizedImportRow,
    | "survey"
    | "giMeasurements"
    | "valvesRegulators"
    | "fittingsAccessories"
    | "lmcPipelineWork"
    | "mdpeFittings"
    | "commissioningConversion"
    | "billingCompletion"
  >] as Record<string, unknown>;

  section[key] = normalizeTypedValue(normalizedValue);
}

function normalizeFieldValue(value: SheetCellValue) {
  if (value instanceof Date) return value.toISOString();
  return normalizeText(value);
}

function normalizeTypedValue(value: string) {
  const lower = value.toLowerCase();
  if (["yes", "true", "done", "completed", "1"].includes(lower)) return true;
  if (["no", "false", "not done", "0"].includes(lower)) return false;
  return value;
}

