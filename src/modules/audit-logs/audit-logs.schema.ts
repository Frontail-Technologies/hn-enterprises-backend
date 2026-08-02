import { t } from "elysia";

export const auditLogListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  module: t.Optional(t.String()),
  userId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});
