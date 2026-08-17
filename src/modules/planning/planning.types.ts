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
