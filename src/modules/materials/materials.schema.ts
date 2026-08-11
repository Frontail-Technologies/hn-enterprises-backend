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
  projectId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const createMaterialTransactionBodySchema = t.Object({
  materialId: t.String({ minLength: 1 }),
  type: transactionTypeSchema,
  // t.Numeric() (not t.Number()) so these also accept the numeric strings a
  // multipart/form-data body delivers - evidence photos are embedded in the
  // same request instead of uploaded separately first.
  quantity: t.Numeric(),
  transactionDate: t.String({ minLength: 1 }),
  referenceNo: t.Optional(t.String()),
  vendorName: t.Optional(t.String()),
  rate: t.Optional(t.Numeric()),
  billAmount: t.Optional(t.Numeric()),
  plumberId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  address: t.Optional(t.String()),
  storeLabel: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  paymentId: t.Optional(t.String()),
  reportNo: t.Optional(t.String()),
  condition: t.Optional(t.String()),
  adjustmentType: t.Optional(t.String()),
  vehicleNo: t.Optional(t.String()),
  vehicleQty: t.Optional(t.Numeric()),
  evidence: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
  remarks: t.Optional(t.String()),
  files: t.Optional(t.Files()),
});

export const plumberBalanceQuerySchema = t.Object({
  plumberId: t.Optional(t.String()),
  materialId: t.Optional(t.String()),
});
