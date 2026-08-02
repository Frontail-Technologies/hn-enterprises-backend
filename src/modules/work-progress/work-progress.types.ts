import type { workProgressStatusEnum, workStageEnum } from "@db/schema";

export type WorkStage = (typeof workStageEnum.enumValues)[number];
export type WorkProgressStatus = (typeof workProgressStatusEnum.enumValues)[number];

export type WorkProgressEvidenceFileInput = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  capturedAt?: string;
};

export type CreateWorkProgressUpdateBody = {
  customerId: string;
  stage: WorkStage;
  status: WorkProgressStatus;
  nextRequiredAction?: string;
  remarks?: string;
  evidence?: WorkProgressEvidenceFileInput[];
};

export type WorkProgressListQuery = {
  customerId?: string;
  supervisorId?: string;
  stage?: WorkStage;
  status?: WorkProgressStatus;
  limit?: number | string;
};

export type WorkProgressQueueQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  projectId?: string;
  siteId?: string;
  stage?: WorkStage;
  status?: WorkProgressStatus;
};
