import type {
  customerDocumentStatusEnum,
  customerStatusEnum,
  lmcPipeSizeEnum,
  lmcPipeStatusEnum,
} from "@db/schema";

export type CustomerStatus = (typeof customerStatusEnum.enumValues)[number];
export type CustomerDocumentStatus = (typeof customerDocumentStatusEnum.enumValues)[number];
export type LmcPipeSize = (typeof lmcPipeSizeEnum.enumValues)[number];
export type LmcPipeStatus = (typeof lmcPipeStatusEnum.enumValues)[number];

export type CustomerListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: CustomerStatus;
  projectId?: string;
  siteId?: string;
  statKey?: string;
  city?: string;
  // Only applied alongside statKey - filters by THAT stat's own real event
  // date (see customer-completion.ts's customerStatDateCondition), so the
  // drill-down list always matches the summary tile's count exactly.
  month?: number | string;
  year?: number | string;
};

export type CustomerJsonSections = {
  survey?: Record<string, unknown>;
  giMeasurements?: Record<string, unknown>;
  valvesRegulators?: Record<string, unknown>;
  fittingsAccessories?: Record<string, unknown>;
  lmcPipelineWork?: Record<string, unknown>;
  mdpeFittings?: Record<string, unknown>;
  commissioningConversion?: Record<string, unknown>;
  billingCompletion?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
};

export type CreateCustomerBody = CustomerJsonSections & {
  projectId: string;
  siteId?: string;
  trBpNumber: string;
  mobileNumber?: string;
  customerName: string;
  fullAddress?: string;
  city?: string;
  connectionType?: string;
  houseType?: string;
  scheme?: string;
  plumberId: string;
  supervisorId?: string;
  giReportNumber?: string;
  gcReportNumber?: string;
  conversionReportNumber?: string;
  status?: CustomerStatus;
  files?: File[];
};

export type UpdateCustomerBody = Partial<CreateCustomerBody> & CustomerJsonSections & { files?: File[] };

export type UpsertLmcPipeRecordBody = {
  pipeSize: LmcPipeSize;
  lengthMetres?: number | string;
  layingDate?: string;
  testingDate?: string;
  purgingDate?: string;
  layingStatus?: LmcPipeStatus;
  testingStatus?: LmcPipeStatus;
  purgingStatus?: LmcPipeStatus;
  jointFittingDetails?: string;
  remarks?: string;
  evidence?: Record<string, unknown>[];
  files?: File[];
};

export type CreateCustomerNoteBody = {
  note: string;
};

export type CreateCustomerDocumentBody = {
  documentType: string;
  category?: string;
  referenceNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  amount?: number;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  file?: File;
  status?: CustomerDocumentStatus;
  remarks?: string;
};

// The controller resolves `file`/`fileUrl` down to a guaranteed fileUrl+fileName
// (uploading `file` if present) before calling the service - this is what the
// service actually persists.
export type ResolvedCustomerDocumentInput = Omit<CreateCustomerDocumentBody, "file" | "fileUrl" | "fileName"> & {
  fileUrl: string;
  fileName: string;
};
