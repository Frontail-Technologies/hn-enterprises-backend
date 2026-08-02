import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { plumbers } from "./plumber.schema";
import { projects, projectSites } from "./project.schema";

type CustomerSurveyPayload = {
  surveyId?: string;
  surveyDate?: string;
  assignedSurveyor?: string;
  submittedBy?: string;
  submissionDate?: string;
  latitude?: number;
  longitude?: number;
  captureAccuracy?: string;
  workableStatus?: string;
  approvalStatus?: string;
  initialMeasurements?: string;
  siteAccessibility?: string;
  meterPlacement?: string;
  pipelineRoute?: string;
  civilWorkRequired?: string;
  obstaclesRemarks?: string;
  notes?: string;
  reason?: string;
  recommendedAction?: string;
  expectedResolutionDate?: string;
  approvalComments?: string;
  revisions?: Record<string, unknown>[];
  photos?: Record<string, unknown>[];
};

type CustomerGiMeasurementsPayload = {
  tfToRegulator?: string;
  inlet?: string;
  outlet?: string;
  totalGiPipeHalfInch?: string;
  giPipeThreeQuarterInch?: string;
  giPipeOneInch?: string;
  giPipeOneAndHalfInch?: string;
  giPipeTwoInch?: string;
};

type CustomerValvesRegulatorsPayload = {
  isolationValveHalfInch?: string;
  isolationValveThreeQuarterInch?: string;
  isolationValveOneInch?: string;
  isolationValveOneAndHalfInch?: string;
  isolationValveTwoInch?: string;
  applianceValveHalfInch?: string;
  regulator6BarTo100Mbar?: string;
  regulator6BarTo21Mbar?: string;
  regulator100MbarTo21Mbar?: string;
  warningPlate?: string;
};

type CustomerFittingsAccessoriesPayload = {
  clampHalfInch?: string;
  clamp3InchToHalfInch?: string;
  elbowHalfInch?: string;
  mfElbowHalfInch?: string;
  socketHalfInch?: string;
  teeHalfInch?: string;
  nipple2Inch?: string;
  nipple3Inch?: string;
  nipple4Inch?: string;
  reducerElbowThreeQuarterToHalfInch?: string;
  threeQuarterInchTo3Inch?: string;
  unionHalfInch?: string;
  plugHalfInch?: string;
  fittingsOneAndHalfInchQuantity?: string;
  fittingsTwoInchQuantity?: string;
  extraGiAbove10Metres?: string;
};

type CustomerLmcCivilPayload = {
  fourMetresUnderGc?: string;
  fourMetresAboveGc?: string;
  tfHalfInch?: string;
  tfOneInch?: string;
  pcc?: string;
  rccNalaCrossing?: string;
  paverBlocks?: string;
  malua?: string;
  hardRock?: string;
  civilRemarks?: string;
  civilEvidence?: Record<string, unknown>[];
};

type CustomerMdpeFittingsPayload = {
  saddle90To32Mm?: string;
  saddle90Mm?: string;
  saddle63To32Mm?: string;
  saddle32To20Mm?: string;
  tee90Mm?: string;
  tee32Mm?: string;
  tee20Mm?: string;
  reducerCoupler90To63Mm?: string;
  reducerCoupler63To32Mm?: string;
  reducerCoupler32To20Mm?: string;
  coupler90Mm?: string;
  coupler32Mm?: string;
  coupler20Mm?: string;
  endCap90Mm?: string;
};

type CustomerCommissioningConversionPayload = {
  meterNo?: string;
  installationDate?: string;
  commissioningDate?: string;
  conversionDate?: string;
  regulatorPressure?: string;
  regulatorNo?: string;
  meterType?: string;
  meterReading?: string;
  nonConversionRemark?: string;
  evidence?: Record<string, unknown>[];
};

type CustomerBillingCompletionPayload = {
  paymentStatus?: string;
  paymentMode?: string;
  initialAmount?: string;
  jmrDone?: boolean;
  jmrSubmittedInPbg?: boolean;
  giBillDone?: boolean;
  gcBillDone?: boolean;
  conversionBillDone?: boolean;
  remark?: string;
  evidence?: Record<string, unknown>[];
};

export const customerStatusEnum = pgEnum("customer_status", [
  "draft",
  "pending",
  "active",
  "inactive",
  "on_hold",
  "completed",
  "archived",
]);

export const customerDocumentStatusEnum = pgEnum("customer_document_status", [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "sent_back",
  "rejected",
  "completed",
]);

export const lmcPipeSizeEnum = pgEnum("lmc_pipe_size", [
  "20_mm",
  "32_mm",
  "63_mm",
  "90_mm",
  "125_mm",
  "other",
]);

export const lmcPipeStatusEnum = pgEnum("lmc_pipe_status", [
  "not_started",
  "in_progress",
  "laying_completed",
  "testing_pending",
  "testing_completed",
  "purging_completed",
  "not_required",
  "on_hold",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => projectSites.id, { onDelete: "restrict" }),
    trBpNumber: text("tr_bp_number").notNull(),
    normalizedTrBpNumber: text("normalized_tr_bp_number").notNull(),
    mobileNumber: text("mobile_number"),
    customerName: text("customer_name").notNull(),
    normalizedCustomerName: text("normalized_customer_name").notNull(),
    fullAddress: text("full_address"),
    city: text("city"),
    connectionType: text("connection_type"),
    houseType: text("house_type"),
    scheme: text("scheme"),
    plumberName: text("plumber_name"),
    plumberId: uuid("plumber_id").references(() => plumbers.id, { onDelete: "set null" }),
    supervisorName: text("supervisor_name"),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    giReportNumber: text("gi_report_number"),
    gcReportNumber: text("gc_report_number"),
    conversionReportNumber: text("conversion_report_number"),
    status: customerStatusEnum("status").notNull().default("active"),
    survey: jsonb("survey").$type<CustomerSurveyPayload>(),
    giMeasurements: jsonb("gi_measurements").$type<CustomerGiMeasurementsPayload>(),
    valvesRegulators: jsonb("valves_regulators").$type<CustomerValvesRegulatorsPayload>(),
    fittingsAccessories: jsonb("fittings_accessories").$type<CustomerFittingsAccessoriesPayload>(),
    lmcPipelineWork: jsonb("lmc_pipeline_work").$type<CustomerLmcCivilPayload>(),
    mdpeFittings: jsonb("mdpe_fittings").$type<CustomerMdpeFittingsPayload>(),
    commissioningConversion:
      jsonb("commissioning_conversion").$type<CustomerCommissioningConversionPayload>(),
    billingCompletion: jsonb("billing_completion").$type<CustomerBillingCompletionPayload>(),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    importedFields: jsonb("imported_fields").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedTrBpIdx: uniqueIndex("customers_normalized_tr_bp_idx").on(
      table.normalizedTrBpNumber,
    ),
    projectIdx: index("customers_project_idx").on(table.projectId),
    siteIdx: index("customers_site_idx").on(table.siteId),
    mobileIdx: index("customers_mobile_idx").on(table.mobileNumber),
    nameIdx: index("customers_name_idx").on(table.normalizedCustomerName),
    plumberIdx: index("customers_plumber_idx").on(table.plumberId),
    supervisorIdx: index("customers_supervisor_idx").on(table.supervisorId),
  }),
);

export const customerLmcPipeRecords = pgTable(
  "customer_lmc_pipe_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pipeSize: lmcPipeSizeEnum("pipe_size").notNull(),
    lengthMetres: numeric("length_metres", { precision: 12, scale: 3 }),
    layingDate: timestamp("laying_date", { withTimezone: true }),
    testingDate: timestamp("testing_date", { withTimezone: true }),
    purgingDate: timestamp("purging_date", { withTimezone: true }),
    layingStatus: lmcPipeStatusEnum("laying_status").notNull().default("not_started"),
    testingStatus: lmcPipeStatusEnum("testing_status").notNull().default("not_started"),
    purgingStatus: lmcPipeStatusEnum("purging_status").notNull().default("not_started"),
    jointFittingDetails: text("joint_fitting_details"),
    remarks: text("remarks"),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("customer_lmc_pipe_records_customer_idx").on(table.customerId),
    customerPipeSizeIdx: uniqueIndex("customer_lmc_pipe_records_customer_pipe_size_idx").on(
      table.customerId,
      table.pipeSize,
    ),
    pipeSizeIdx: index("customer_lmc_pipe_records_pipe_size_idx").on(table.pipeSize),
  }),
);

export const customerDocuments = pgTable(
  "customer_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => projectSites.id, { onDelete: "restrict" }),
    documentType: text("document_type").notNull(),
    category: text("category"),
    referenceNumber: text("reference_number"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    status: customerDocumentStatusEnum("status").notNull().default("submitted"),
    remarks: text("remarks"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("customer_documents_customer_idx").on(table.customerId),
    projectIdx: index("customer_documents_project_idx").on(table.projectId),
    typeIdx: index("customer_documents_type_idx").on(table.documentType),
  }),
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  project: one(projects, {
    fields: [customers.projectId],
    references: [projects.id],
  }),
  site: one(projectSites, {
    fields: [customers.siteId],
    references: [projectSites.id],
  }),
  plumber: one(plumbers, {
    fields: [customers.plumberId],
    references: [plumbers.id],
  }),
  documents: many(customerDocuments),
  lmcPipeRecords: many(customerLmcPipeRecords),
}));

export const customerLmcPipeRecordsRelations = relations(customerLmcPipeRecords, ({ one }) => ({
  customer: one(customers, {
    fields: [customerLmcPipeRecords.customerId],
    references: [customers.id],
  }),
}));

export const customerDocumentsRelations = relations(customerDocuments, ({ one }) => ({
  customer: one(customers, {
    fields: [customerDocuments.customerId],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [customerDocuments.projectId],
    references: [projects.id],
  }),
  site: one(projectSites, {
    fields: [customerDocuments.siteId],
    references: [projectSites.id],
  }),
}));
