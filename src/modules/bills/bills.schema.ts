import { t } from "elysia";
import { billStageEnum, billStatusEnum, paymentModeEnum } from "@db/schema";

const billStageSchema = t.Union(billStageEnum.enumValues.map((value) => t.Literal(value)));
const billStatusSchema = t.Union(billStatusEnum.enumValues.map((value) => t.Literal(value)));
const paymentModeSchema = t.Union(paymentModeEnum.enumValues.map((value) => t.Literal(value)));

export const billListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  stage: t.Optional(billStageSchema),
  status: t.Optional(billStatusSchema),
});

export const createBillBodySchema = t.Object({
  customerId: t.String({ minLength: 1 }),
  billNumber: t.String({ minLength: 1 }),
  stage: t.Optional(billStageSchema),
  billDate: t.Optional(t.String()),
  dueDate: t.Optional(t.String()),
  totalAmount: t.Number(),
  tax: t.Optional(t.Number()),
  status: t.Optional(billStatusSchema),
  remarks: t.Optional(t.String()),
});

export const updateBillBodySchema = t.Partial(createBillBodySchema);

export const createBillPaymentBodySchema = t.Object({
  amount: t.Number(),
  paymentDate: t.String({ minLength: 1 }),
  mode: paymentModeSchema,
  remarks: t.Optional(t.String()),
});
