import type { projectDocumentStatusEnum, projectStatusEnum, siteStatusEnum } from "@db/schema";

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type SiteStatus = (typeof siteStatusEnum.enumValues)[number];
export type ProjectDocumentStatus = (typeof projectDocumentStatusEnum.enumValues)[number];

export type ProjectListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: ProjectStatus;
  city?: string;
};

export type CreateProjectBody = {
  name: string;
  code?: string;
  city?: string;
  client?: string;
  consultant?: string;
  contractor?: string;
  projectType?: string;
  areaLocation?: string;
  description?: string;
  startDate?: string;
  plannedEndDate?: string;
  status?: ProjectStatus;
  contractValue?: number;
  projectManager?: string;
};

export type UpdateProjectBody = Partial<CreateProjectBody>;

export type CreateProjectSiteBody = {
  name: string;
  code?: string;
  city?: string;
  address?: string;
  plannedConnections?: number;
  supervisorName?: string;
  status?: SiteStatus;
};

export type UpdateProjectSiteBody = Partial<CreateProjectSiteBody>;

export type CreateProjectDocumentBody = {
  siteId?: string;
  documentType: string;
  referenceNumber?: string;
  documentDate?: string;
  expiryDate?: string;
  amount?: number;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  status?: ProjectDocumentStatus;
  remarks?: string;
};
