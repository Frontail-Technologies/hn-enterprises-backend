import { t } from "elysia";
import { dprStatusEnum, planningTaskIdEnum } from "@db/schema";

const taskIdSchema = t.Union(planningTaskIdEnum.enumValues.map((value) => t.Literal(value)));
const dprStatusSchema = t.Union(dprStatusEnum.enumValues.map((value) => t.Literal(value)));

const planTaskSchema = t.Object({
  id: taskIdSchema,
  qty: t.Optional(t.String()),
  worker: t.Optional(t.String()),
});

const dprTaskSchema = t.Object({
  id: taskIdSchema,
  plannedQty: t.Optional(t.String()),
  completedQty: t.Optional(t.String()),
  worker: t.Optional(t.String()),
  delayReason: t.Optional(t.String()),
});

const evidenceFileSchema = t.Object({
  id: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1 }),
  fileUrl: t.String({ minLength: 1 }),
  mimeType: t.Optional(t.String()),
  capturedAt: t.Optional(t.String()),
});

export const sitePlanListQuerySchema = t.Object({
  projectId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  date: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const upsertSitePlanBodySchema = t.Object({
  projectId: t.String({ minLength: 1 }),
  siteId: t.String({ minLength: 1 }),
  date: t.String({ minLength: 1 }),
  tasks: t.Array(planTaskSchema),
});

export const dprRecordListQuerySchema = t.Object({
  projectId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  date: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  status: t.Optional(dprStatusSchema),
});

export const upsertDprRecordBodySchema = t.Object({
  projectId: t.String({ minLength: 1 }),
  siteId: t.String({ minLength: 1 }),
  date: t.String({ minLength: 1 }),
  status: t.Optional(dprStatusSchema),
  remarks: t.Optional(t.String()),
  tasks: t.Array(dprTaskSchema),
  evidence: t.Optional(t.Array(evidenceFileSchema)),
});
