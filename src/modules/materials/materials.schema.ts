import { t } from "elysia";
import { materialTransactionTypeEnum } from "@db/schema";

const transactionTypeSchema = t.Union(
  materialTransactionTypeEnum.enumValues.map((value) => t.Literal(value)),
);

export const materialListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  category: t.Optional(t.String()),
});

export const createMaterialBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  category: t.Optional(t.String()),
  unit: t.String({ minLength: 1 }),
  reorderLevel: t.Optional(t.Number()),
});

export const updateMaterialBodySchema = t.Partial(createMaterialBodySchema);

export const materialTransactionListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  materialId: t.Optional(t.String()),
  type: t.Optional(transactionTypeSchema),
  plumberId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const createMaterialTransactionBodySchema = t.Object({
  materialId: t.String({ minLength: 1 }),
  type: transactionTypeSchema,
  quantity: t.Number(),
  transactionDate: t.String({ minLength: 1 }),
  referenceNo: t.Optional(t.String()),
  vendorName: t.Optional(t.String()),
  rate: t.Optional(t.Number()),
  billAmount: t.Optional(t.Number()),
  plumberId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  storeLabel: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  reportNo: t.Optional(t.String()),
  condition: t.Optional(t.String()),
  adjustmentType: t.Optional(t.String()),
  vehicleNo: t.Optional(t.String()),
  vehicleQty: t.Optional(t.Number()),
  evidence: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
  remarks: t.Optional(t.String()),
});

export const plumberBalanceQuerySchema = t.Object({
  plumberId: t.Optional(t.String()),
  materialId: t.Optional(t.String()),
});
