import { t } from "elysia";
import { customerStatusEnum } from "@db/schema";

const customerStatusSchema = t.Union(customerStatusEnum.enumValues.map((value) => t.Literal(value)));

// Server-evaluable filters for "select all matching" (filter mode). These
// mirror the customer list query plus a few operational filters, so the
// backend can reconstruct the exact matching set with an indexed WHERE
// instead of the frontend shipping thousands of ids.
const bulkFilterSchema = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(customerStatusSchema),
  projectId: t.Optional(t.String()),
  siteId: t.Optional(t.String()),
  city: t.Optional(t.String()),
  statKey: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  plumberId: t.Optional(t.String()),
  scheme: t.Optional(t.String()),
  connectionType: t.Optional(t.String()),
});

// Two selection modes (§6): explicit ids, or filter-based with exclusions.
export const bulkSelectionSchema = t.Union([
  t.Object({
    mode: t.Literal("ids"),
    ids: t.Array(t.String({ minLength: 1 }), { minItems: 1, maxItems: 20000 }),
  }),
  t.Object({
    mode: t.Literal("filter"),
    filters: bulkFilterSchema,
    excludedIds: t.Optional(t.Array(t.String())),
  }),
]);

// The ONLY fields a bulk operation may modify (§16, §26). Identity fields
// (name, mobile, address, TR/report/meter numbers), unique report/meter
// identifiers, and individual technical measurements are deliberately
// absent - applying one value to hundreds of customers only makes sense for
// fields where "the same value for many customers" is a real business
// operation (assignment, classification, payment/completion status).
// `paymentStatus`/`paymentMode`/`initialAmount`/the completion booleans are
// merged into the billingCompletion jsonb section by the service, not set
// as columns; `houseType` IS a top-level column (see customer.schema.ts).
export const bulkUpdateBodySchema = t.Object({
  selection: bulkSelectionSchema,
  changes: t.Object({
    supervisorId: t.Optional(t.Union([t.String(), t.Null()])),
    plumberId: t.Optional(t.Union([t.String(), t.Null()])),
    projectId: t.Optional(t.String({ minLength: 1 })),
    siteId: t.Optional(t.Union([t.String(), t.Null()])),
    scheme: t.Optional(t.String()),
    connectionType: t.Optional(t.String()),
    houseType: t.Optional(t.String()),
    status: t.Optional(customerStatusSchema),
    paymentStatus: t.Optional(t.String()),
    paymentMode: t.Optional(t.String()),
    initialAmount: t.Optional(t.String()),
    jmrDone: t.Optional(t.Boolean()),
    jmrSubmittedInPbg: t.Optional(t.Boolean()),
    giBillDone: t.Optional(t.Boolean()),
    gcBillDone: t.Optional(t.Boolean()),
    conversionBillDone: t.Optional(t.Boolean()),
  }),
});

export const bulkRemarkBodySchema = t.Object({
  selection: bulkSelectionSchema,
  note: t.String({ minLength: 1 }),
});

export const bulkDeleteBodySchema = t.Object({
  selection: bulkSelectionSchema,
});
