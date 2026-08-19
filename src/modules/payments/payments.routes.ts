import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { paymentsController, paymentsImportController } from "./payments.controller";
import {
  createPaymentBodySchema,
  paymentFilterValuesQuerySchema,
  paymentListQuerySchema,
  paymentSummaryQuerySchema,
  updatePaymentBodySchema,
} from "./payments.schema";

export const paymentsRoutes = new Elysia({ prefix: "/payments" })
  .use(auth)
  .get("/", ({ query, set }) => paymentsController.list({ query, set }), {
    query: paymentListQuerySchema,
    requireAuth: true,
  })
  // Static paths, registered ahead of `/:id` for clarity (matches the
  // customers routes' convention - Elysia already prioritizes static routes).
  .get("/summary", ({ query, set }) => paymentsController.summary({ query, set }), {
    query: paymentSummaryQuerySchema,
    requireAuth: true,
  })
  .get("/filter-values", ({ query, set }) => paymentsController.filterValues({ query, set }), {
    query: paymentFilterValuesQuerySchema,
    requireAuth: true,
  })
  .post(
    "/",
    ({ body, currentUser, set }) => paymentsController.create({ body, currentUser, set }),
    { body: createPaymentBodySchema, requireAuth: true },
  )
  .post(
    "/import/preview",
    ({ body, currentUser, set }) => paymentsImportController.preview({ body, currentUser, set }),
    { body: t.Object({ file: t.File() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/import/confirm",
    ({ body, currentUser, set }) => paymentsImportController.confirm({ body, currentUser, set }),
    {
      body: t.Object({
        validRows: t.Array(
          t.Object({
            category: t.String(),
            paidTo: t.String(),
            plumberName: t.String(),
            amount: t.String(),
            paymentDate: t.String(),
            mode: t.String(),
            purpose: t.String(),
            remarks: t.String(),
            address: t.String(),
          }),
        ),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id",
    ({ params, set }) => paymentsController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => paymentsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updatePaymentBodySchema,
      requireAuth: true,
    },
  )
  .delete(
    "/:id",
    ({ params, set }) => paymentsController.remove({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
