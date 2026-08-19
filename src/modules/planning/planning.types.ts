import type { dprStatusEnum, planningTaskIdEnum } from "@db/schema";

export type PlanningTaskId = (typeof planningTaskIdEnum.enumValues)[number];
export type DprStatus = (typeof dprStatusEnum.enumValues)[number];

export type PlanTaskInput = {
  id: PlanningTaskId;
  qty?: string;
  worker?: string;
};

export type DprTaskInput = {
  id: PlanningTaskId;
  plannedQty?: string;
  completedQty?: string;
  worker?: string;
  delayReason?: string;
};

export type EvidenceFileInput = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  capturedAt?: string;
};

export type SitePlanListQuery = {
  projectId?: string;
  siteId?: string;
  supervisorId?: string;
  customerId?: string;
  date?: string;
  from?: string;
  to?: string;
};

export type UpsertSitePlanBody = {
  customerId: string;
  projectId: string;
  siteId: string;
  date: string;
  tasks: PlanTaskInput[];
};

export type DprRecordListQuery = SitePlanListQuery & {
  status?: DprStatus;
};

export type UpsertDprRecordBody = {
  customerId: string;
  projectId: string;
  siteId: string;
  date: string;
  status?: DprStatus;
  remarks?: string;
  tasks: DprTaskInput[];
  evidence?: EvidenceFileInput[];
};

export type PlanningOverviewStatus = "pending" | "partial" | "done";

// One row per Site for the mobile Work Planning/DPR overview - an aggregate,
// never a substitute for the underlying customer-wise records.
export type SiteOverviewRow = {
  siteId: string;
  siteName: string;
  projectId: string;
  projectName: string;
  totalCustomers: number;
  completedCustomers: number;
  status: PlanningOverviewStatus;
};

// Lightweight roster row for the Site editor's customer list - just enough to
// render a compact row and route into the existing per-customer editor.
export type SiteCustomerRow = {
  id: string;
  trBpNumber: string;
  customerName: string;
  projectId: string;
  siteId: string;
};
