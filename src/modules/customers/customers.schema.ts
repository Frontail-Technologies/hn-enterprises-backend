import { t } from "elysia";
import { customerDocumentStatusEnum, customerStatusEnum, lmcPipeSizeEnum, lmcPipeStatusEnum } from "@db/schema";

const customerStatusSchema = t.Union(customerStatusEnum.enumValues.map((value) => t.Literal(value)));
const customerDocumentStatusSchema = t.Union(
  customerDocumentStatusEnum.enumValues.map((value) => t.Literal(value)),
);
const lmcPipeSizeSchema = t.Union(lmcPipeSizeEnum.enumValues.map((value) => t.Literal(value)));
const lmcPipeStatusSchema = t.Union(lmcPipeStatusEnum.enumValues.map((value) => t.Literal(value)));

export const customerListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  status: t.Optional(customerStatusSchema),
  projectId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
});

const jsonSection = t.Optional(t.Record(t.String(), t.Unknown()));

const customerJsonSectionsSchema = t.Object({
  survey: jsonSection,
  giMeasurements: jsonSection,
  valvesRegulators: jsonSection,
  fittingsAccessories: jsonSection,
  lmcPipelineWork: jsonSection,
  mdpeFittings: jsonSection,
  commissioningConversion: jsonSection,
  billingCompletion: jsonSection,
  customFields: jsonSection,
});

export const createCustomerBodySchema = t.Composite([
  t.Object({
    projectId: t.String({ minLength: 1 }),
    siteId: t.String({ minLength: 1 }),
    trBpNumber: t.String({ minLength: 1 }),
    mobileNumber: t.Optional(t.String()),
    customerName: t.String({ minLength: 1 }),
    fullAddress: t.Optional(t.String()),
    city: t.Optional(t.String()),
    connectionType: t.Optional(t.String()),
    houseType: t.Optional(t.String()),
    scheme: t.Optional(t.String()),
    plumberName: t.Optional(t.String()),
    supervisorName: t.Optional(t.String()),
    giReportNumber: t.Optional(t.String()),
    gcReportNumber: t.Optional(t.String()),
    conversionReportNumber: t.Optional(t.String()),
    status: t.Optional(customerStatusSchema),
  }),
  customerJsonSectionsSchema,
]);

export const updateCustomerBodySchema = t.Composite([
  t.Partial(createCustomerBodySchema),
  customerJsonSectionsSchema,
]);

export const upsertLmcPipeRecordBodySchema = t.Object({
  pipeSize: lmcPipeSizeSchema,
  lengthMetres: t.Optional(t.Union([t.Number(), t.String()])),
  layingDate: t.Optional(t.String()),
  testingDate: t.Optional(t.String()),
  purgingDate: t.Optional(t.String()),
  layingStatus: t.Optional(lmcPipeStatusSchema),
  testingStatus: t.Optional(lmcPipeStatusSchema),
  purgingStatus: t.Optional(lmcPipeStatusSchema),
  jointFittingDetails: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
  evidence: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
});

export const createCustomerDocumentBodySchema = t.Object({
  documentType: t.String({ minLength: 1 }),
  category: t.Optional(t.String()),
  referenceNumber: t.Optional(t.String()),
  issueDate: t.Optional(t.String()),
  expiryDate: t.Optional(t.String()),
  amount: t.Optional(t.Number()),
  fileUrl: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1 }),
  mimeType: t.Optional(t.String()),
  status: t.Optional(customerDocumentStatusSchema),
  remarks: t.Optional(t.String()),
});
