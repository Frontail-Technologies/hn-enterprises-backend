import { t } from "elysia";
import { projectDocumentStatusEnum, projectStatusEnum, siteStatusEnum } from "@db/schema";

const projectStatusSchema = t.Union(projectStatusEnum.enumValues.map((value) => t.Literal(value)));
const siteStatusSchema = t.Union(siteStatusEnum.enumValues.map((value) => t.Literal(value)));
const projectDocumentStatusSchema = t.Union(
  projectDocumentStatusEnum.enumValues.map((value) => t.Literal(value)),
);

export const projectListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  status: t.Optional(projectStatusSchema),
  city: t.Optional(t.String()),
});

export const createProjectBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  code: t.Optional(t.String()),
  city: t.Optional(t.String()),
  client: t.Optional(t.String()),
  consultant: t.Optional(t.String()),
  contractor: t.Optional(t.String()),
  projectType: t.Optional(t.String()),
  areaLocation: t.Optional(t.String()),
  description: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  plannedEndDate: t.Optional(t.String()),
  status: t.Optional(projectStatusSchema),
  contractValue: t.Optional(t.Number()),
  projectManager: t.Optional(t.String()),
});

export const updateProjectBodySchema = t.Partial(createProjectBodySchema);

export const createProjectSiteBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  code: t.Optional(t.String()),
  city: t.Optional(t.String()),
  address: t.Optional(t.String()),
  latitude: t.Optional(t.Number()),
  longitude: t.Optional(t.Number()),
  plannedConnections: t.Optional(t.Number()),
  supervisorId: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
  status: t.Optional(siteStatusSchema),
});

export const updateProjectSiteBodySchema = t.Partial(createProjectSiteBodySchema);

export const createProjectDocumentBodySchema = t.Object({
  siteId: t.Optional(t.String()),
  documentType: t.String({ minLength: 1 }),
  referenceNumber: t.Optional(t.String()),
  documentDate: t.Optional(t.String()),
  expiryDate: t.Optional(t.String()),
  amount: t.Optional(t.Number()),
  fileUrl: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1 }),
  mimeType: t.Optional(t.String()),
  status: t.Optional(projectDocumentStatusSchema),
  remarks: t.Optional(t.String()),
});
