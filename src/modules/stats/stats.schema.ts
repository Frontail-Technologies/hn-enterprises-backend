import { t } from "elysia";

export const statDetailParamsSchema = t.Object({
  type: t.String({ minLength: 1 }),
});
