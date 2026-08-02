import { t } from "elysia";

export const documentListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  module: t.Optional(t.Union([t.Literal("Projects"), t.Literal("Customers")])),
});
