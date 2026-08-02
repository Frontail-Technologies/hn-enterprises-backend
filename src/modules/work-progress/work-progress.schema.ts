import { t } from "elysia";
import { workProgressStatusEnum, workStageEnum } from "@db/schema";

const workStageSchema = t.Union(workStageEnum.enumValues.map((value) => t.Literal(value)));
const workProgressStatusSchema = t.Union(workProgressStatusEnum.enumValues.map((value) => t.Literal(value)));

const evidenceFileSchema = t.Object({
  id: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1 }),
  fileUrl: t.String({ minLength: 1 }),
  mimeType: t.Optional(t.String()),
  capturedAt: t.Optional(t.String()),
});

export const createWorkProgressUpdateBodySchema = t.Object({
  customerId: t.String({ minLength: 1 }),
  stage: workStageSchema,
  status: workProgressStatusSchema,
  nextRequiredAction: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
  evidence: t.Optional(t.Array(evidenceFileSchema)),
});

export const workProgressListQuerySchema = t.Object({
  customerId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  stage: t.Optional(workStageSchema),
  status: t.Optional(workProgressStatusSchema),
  limit: t.Optional(t.Number()),
});

export const workProgressQueueQuerySchema = t.Object({
  page: t.Optional(t.Number()),
  limit: t.Optional(t.Number()),
  search: t.Optional(t.String()),
  projectId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  stage: t.Optional(workStageSchema),
  status: t.Optional(workProgressStatusSchema),
});
