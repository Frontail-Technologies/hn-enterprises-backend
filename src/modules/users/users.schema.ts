import { t } from "elysia";

export const userListQuerySchema = t.Object({
  role: t.Optional(t.String()),
});
