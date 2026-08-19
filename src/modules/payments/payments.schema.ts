import { t } from "elysia";
import { paymentCategoryEnum, paymentStatusEnum } from "@db/schema";

const paymentCategorySchema = t.Union(paymentCategoryEnum.enumValues.map((value) => t.Literal(value)));
const paymentStatusSchema = t.Union(paymentStatusEnum.enumValues.map((value) => t.Literal(value)));

export const paymentListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  category: t.Optional(paymentCategorySchema),
  // Comma-separated - the All Expenses column-filter checkbox lets more than
  // one status be selected at once, unlike `category`'s single-value
  // drill-down.
  status: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  plumberId: t.Optional(t.String()),
  projectId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  // Comma-separated exact-value lists for the All Expenses column-filter
  // checkboxes (purpose/paidTo/address/amount/date) - see
  // payments.service.ts#buildColumnFilterConditions.
  paidTo: t.Optional(t.String()),
  purpose: t.Optional(t.String()),
  address: t.Optional(t.String()),
  amount: t.Optional(t.String()),
  date: t.Optional(t.String()),
});

// Same shape as the list query minus pagination, plus `totalsOnly` - the
// summary endpoint is reused with two different scopes by two different
// callers (see payments.service.ts#summary). `totalsOnly` skips the
// categoryBreakdown/recent sub-queries for callers that only read
// count/total (the All Expenses list's own total line, and the "do I have
// any expenses at all" check) - see payments.service.ts#summary.
//
// A flat object rather than t.Omit/t.Intersect over paymentListQuerySchema -
// Elysia's compiled TypeBox validator can't guard an Intersect of two closed
// (additionalProperties: false) object schemas, so that combination throws
// "Preflight validation check failed to guard for the given schema" at
// startup instead of validating requests.
export const paymentSummaryQuerySchema = t.Object({
  search: t.Optional(t.String()),
  category: t.Optional(paymentCategorySchema),
  status: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  plumberId: t.Optional(t.String()),
  projectId: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  paidTo: t.Optional(t.String()),
  purpose: t.Optional(t.String()),
  address: t.Optional(t.String()),
  amount: t.Optional(t.String()),
  date: t.Optional(t.String()),
  totalsOnly: t.Optional(t.String()),
});

export const paymentFilterValuesQuerySchema = t.Object({
  column: t.Union(
    ["paidTo", "purpose", "address", "amount", "date", "status", "category"].map((value) => t.Literal(value)),
  ),
});

export const createPaymentBodySchema = t.Object({
  category: paymentCategorySchema,
  plumberId: t.Optional(t.String()),
  paidTo: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  address: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  // Nullable, additive - lets an expense be attributed to a project directly
  // when it has no site or customer (rent, transport, misc). See
  // payment.schema.ts for why this exists alongside siteId/customerId.
  projectId: t.Optional(t.String()),
  // t.Numeric() (not t.Number()) so this also accepts the numeric strings a
  // multipart/form-data body delivers - the mobile app embeds attachments in
  // the same request instead of calling the separate /uploads route first.
  amount: t.Numeric(),
  paymentDate: t.String({ minLength: 1 }),
  mode: t.String({ minLength: 1 }),
  status: t.Optional(paymentStatusSchema),
  purpose: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
  evidence: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
  files: t.Optional(t.Files()),
});

export const updatePaymentBodySchema = t.Partial(createPaymentBodySchema);
