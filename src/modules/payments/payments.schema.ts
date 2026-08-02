import { t } from "elysia";
import { paymentCategoryEnum, paymentModeEnum, paymentStatusEnum } from "@db/schema";

const paymentCategorySchema = t.Union(paymentCategoryEnum.enumValues.map((value) => t.Literal(value)));
const paymentStatusSchema = t.Union(paymentStatusEnum.enumValues.map((value) => t.Literal(value)));
const paymentModeSchema = t.Union(paymentModeEnum.enumValues.map((value) => t.Literal(value)));

export const paymentListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  category: t.Optional(paymentCategorySchema),
  status: t.Optional(paymentStatusSchema),
  siteId: t.Optional(t.String()),
  plumberId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const createPaymentBodySchema = t.Object({
  category: paymentCategorySchema,
  plumberId: t.Optional(t.String()),
  paidTo: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  amount: t.Number(),
  paymentDate: t.String({ minLength: 1 }),
  mode: paymentModeSchema,
  status: t.Optional(paymentStatusSchema),
  purpose: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
  evidence: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
});

export const updatePaymentBodySchema = t.Partial(createPaymentBodySchema);
