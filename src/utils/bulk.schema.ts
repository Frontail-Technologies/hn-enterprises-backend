import { t } from "elysia";

// Shared shape for every "bulk delete by id list" endpoint in the app. Unlike
// Customers' bulk endpoints (which also support a server-side filter-mode
// selection because that list can hold thousands of rows), every other admin
// list in the app already loads its full ~200-row-capped dataset client-side,
// so an explicit id array is the only selection mode any of them need.
export const bulkDeleteByIdsBodySchema = t.Object({
  ids: t.Array(t.String({ minLength: 1 }), { minItems: 1, maxItems: 500 }),
});

export type BulkDeleteByIdsBody = { ids: string[] };
