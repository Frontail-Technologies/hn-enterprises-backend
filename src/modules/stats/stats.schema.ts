import { t } from "elysia";

export const statDetailParamsSchema = t.Object({
  type: t.String({ minLength: 1 }),
});

export const statDetailQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});
