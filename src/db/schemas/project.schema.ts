import { relations } from "drizzle-orm";
import {
  index,
  integer,
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

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "active",
  "in_progress",
  "on_hold",
  "completed",
  "archived",
]);

export const siteStatusEnum = pgEnum("site_status", [
  "active",
  "in_progress",
  "not_started",
  "on_hold",
  "completed",
  "archived",
]);

export const projectDocumentStatusEnum = pgEnum("project_document_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "expired",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    code: text("code"),
    normalizedCode: text("normalized_code"),
    city: text("city"),
    normalizedCity: text("normalized_city"),
    client: text("client"),
    consultant: text("consultant"),
    contractor: text("contractor"),
    projectType: text("project_type"),
    areaLocation: text("area_location"),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }),
    plannedEndDate: timestamp("planned_end_date", { withTimezone: true }),
    status: projectStatusEnum("status").notNull().default("active"),
    contractValue: numeric("contract_value", { precision: 14, scale: 2 }),
    projectManager: text("project_manager"),
    importedSource: jsonb("imported_source").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedCodeIdx: uniqueIndex("projects_normalized_code_idx").on(table.normalizedCode),
    normalizedNameCityIdx: uniqueIndex("projects_normalized_name_city_idx").on(
      table.normalizedName,
      table.normalizedCity,
    ),
    statusIdx: index("projects_status_idx").on(table.status),
    cityIdx: index("projects_city_idx").on(table.normalizedCity),
  }),
);

export const projectSites = pgTable(
  "project_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    code: text("code"),
    normalizedCode: text("normalized_code"),
    city: text("city"),
    normalizedCity: text("normalized_city"),
    address: text("address"),
    latitude: numeric("latitude", { precision: 10, scale: 6 }),
    longitude: numeric("longitude", { precision: 10, scale: 6 }),
    plannedConnections: integer("planned_connections"),
    supervisorName: text("supervisor_name"),
    supervisorId: uuid("supervisor_id").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    remarks: text("remarks"),
    status: siteStatusEnum("status").notNull().default("active"),
    importedSource: jsonb("imported_source").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectSiteCodeIdx: uniqueIndex("project_sites_project_code_idx").on(
      table.projectId,
      table.normalizedCode,
    ),
    projectSiteNameIdx: uniqueIndex("project_sites_project_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    projectIdx: index("project_sites_project_idx").on(table.projectId),
    statusIdx: index("project_sites_status_idx").on(table.status),
    supervisorIdx: index("project_sites_supervisor_idx").on(table.supervisorId),
  }),
);

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => projectSites.id, { onDelete: "set null" }),
    documentType: text("document_type").notNull(),
    referenceNumber: text("reference_number"),
    documentDate: timestamp("document_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    status: projectDocumentStatusEnum("status").notNull().default("submitted"),
    remarks: text("remarks"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("project_documents_project_idx").on(table.projectId),
    siteIdx: index("project_documents_site_idx").on(table.siteId),
    typeIdx: index("project_documents_type_idx").on(table.documentType),
  }),
);

export const projectsRelations = relations(projects, ({ many }) => ({
  sites: many(projectSites),
  documents: many(projectDocuments),
}));

export const projectSitesRelations = relations(projectSites, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectSites.projectId],
    references: [projects.id],
  }),
  documents: many(projectDocuments),
}));

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
  project: one(projects, {
    fields: [projectDocuments.projectId],
    references: [projects.id],
  }),
  site: one(projectSites, {
    fields: [projectDocuments.siteId],
    references: [projectSites.id],
  }),
}));

