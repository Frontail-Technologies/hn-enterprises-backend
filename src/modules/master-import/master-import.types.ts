export type SheetCellValue = string | number | boolean | Date | null;

export type RawSheetRow = {
  rowNumber: number;
  values: Record<string, SheetCellValue>;
};

export type NormalizedImportRow = {
  rowNumber: number;
  rawData: Record<string, SheetCellValue>;
  projectName: string;
  projectCode: string;
  city: string;
  siteName: string;
  siteCode: string;
  siteAddress: string;
  customerName: string;
  trBpNumber: string;
  mobileNumber: string;
  fullAddress: string;
  connectionType: string;
  houseType: string;
  scheme: string;
  plumberName: string;
  supervisorName: string;
  giReportNumber: string;
  gcReportNumber: string;
  conversionReportNumber: string;
  customerStatus: string;
  survey: Record<string, unknown>;
  giMeasurements: Record<string, unknown>;
  valvesRegulators: Record<string, unknown>;
  fittingsAccessories: Record<string, unknown>;
  lmcPipelineWork: Record<string, unknown>;
  lmcPipeRecords: NormalizedLmcPipeRecord[];
  mdpeFittings: Record<string, unknown>;
  commissioningConversion: Record<string, unknown>;
  billingCompletion: Record<string, unknown>;
  customFields: Record<string, unknown>;
  issues: string[];
  warnings: string[];
  matchedProjectId?: string;
  matchedSiteId?: string;
  existingCustomerId?: string;
};

export type NormalizedLmcPipeRecord = {
  pipeSize: "20_mm" | "32_mm" | "63_mm" | "90_mm" | "125_mm" | "other";
  lengthMetres?: string;
  layingDate?: string;
  testingDate?: string;
  purgingDate?: string;
  layingStatus?: string;
  testingStatus?: string;
  purgingStatus?: string;
  jointFittingDetails?: string;
  remarks?: string;
};

export type ImportRowStatus = "valid" | "warning" | "invalid";

export type ImportPreviewIssue = {
  rowNumber: number;
  customerName: string;
  trBpNumber: string;
  projectName: string;
  siteName: string;
  issues: string[];
  warnings: string[];
};

export type ImportPreviewSiteGroup = {
  key: string;
  siteName: string;
  siteCode: string;
  city: string;
  status: "matched" | "new";
  matchedSiteId?: string;
  customerCount: number;
  validCustomerCount: number;
  issueCount: number;
};

export type ImportPreviewProjectGroup = {
  key: string;
  projectName: string;
  projectCode: string;
  city: string;
  status: "matched" | "new";
  matchedProjectId?: string;
  siteCount: number;
  customerCount: number;
  validCustomerCount: number;
  issueCount: number;
  sites: ImportPreviewSiteGroup[];
};

export type ImportPreviewSummary = {
  batchId?: string;
  fileName: string;
  totals: {
    rows: number;
    validRows: number;
    warningRows: number;
    invalidRows: number;
    projects: number;
    newProjects: number;
    matchedProjects: number;
    sites: number;
    newSites: number;
    matchedSites: number;
    customers: number;
    duplicateCustomers: number;
  };
  groups: ImportPreviewProjectGroup[];
  issues: ImportPreviewIssue[];
};

export type ConfirmImportResult = {
  batchId: string;
  projectsCreated: number;
  sitesCreated: number;
  customersCreated: number;
  rowsRejected: number;
};
