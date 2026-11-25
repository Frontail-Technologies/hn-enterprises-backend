import { t } from "elysia";
import { billPaymentStatusEnum, billStatusEnum } from "@db/schema";

const billStatusSchema = t.Union(billStatusEnum.enumValues.map((value) => t.Literal(value)));
const billPaymentStatusSchema = t.Union(billPaymentStatusEnum.enumValues.map((value) => t.Literal(value)));

export const billListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  projectId: t.Optional(t.String()),
  status: t.Optional(billStatusSchema),
});

const billAttachmentSchema = t.Object({
  id: t.String({ maxLength: 100 }),
  label: t.String({ maxLength: 200 }),
  fileName: t.String({ maxLength: 300 }),
  fileUrl: t.String({ minLength: 1, maxLength: 1000 }),
});

export const createBillBodySchema = t.Object({
  projectId: t.String({ minLength: 1 }),
  billNumber: t.String({ minLength: 1 }),
  billDate: t.Optional(t.String()),
  dueDate: t.Optional(t.String()),
  totalAmount: t.Number(),
  tax: t.Optional(t.Number()),
  status: t.Optional(billStatusSchema),
  remarks: t.Optional(t.String()),
  /** Bill photos, already uploaded via /uploads. */
  attachments: t.Optional(t.Array(billAttachmentSchema, { maxItems: 20 })),
});

export const updateBillBodySchema = t.Partial(createBillBodySchema);

export const createBillPaymentBodySchema = t.Object({
  amount: t.Number(),
  paymentDate: t.String({ minLength: 1 }),
  mode: t.String({ minLength: 1 }),
  status: t.Optional(billPaymentStatusSchema),
  remarks: t.Optional(t.String()),
});

export const updateBillPaymentBodySchema = t.Object({
  status: billPaymentStatusSchema,
});
