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
  siteId: string;
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
};

export type UpdateCustomerBody = Partial<CreateCustomerBody> & CustomerJsonSections;

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
};

export type CreateCustomerDocumentBody = {
  documentType: string;
  category?: string;
  referenceNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  amount?: number;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  status?: CustomerDocumentStatus;
  remarks?: string;
};
