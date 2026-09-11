import { t } from "elysia";

export const activityListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  projectId: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  actorId: t.Optional(t.String()),
  type: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  search: t.Optional(t.String()),
  sort: t.Optional(t.Union([t.Literal("newest"), t.Literal("oldest")])),
});
