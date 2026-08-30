import { t } from "elysia";

export const bulkDeleteByIdsBodySchema = t.Object({
  ids: t.Array(t.String({ minLength: 1 }), { minItems: 1, maxItems: 500 }),
});

export type BulkDeleteByIdsBody = { ids: string[] };
