import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { billsController } from "./bills.controller";
import {
  billListQuerySchema,
  createBillBodySchema,
  createBillPaymentBodySchema,
  updateBillBodySchema,
  updateBillPaymentBodySchema,
} from "./bills.schema";

export const billsRoutes = new Elysia({ prefix: "/bills" })
  .use(auth)
  .get("/", ({ query, set }) => billsController.list({ query, set }), {
    query: billListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/",
    ({ body, currentUser, set }) => billsController.create({ body, currentUser, set }),
    { body: createBillBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/:id",
    ({ params, set }) => billsController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => billsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateBillBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id",
    ({ params, set }) => billsController.delete({ params, set }),
    {
      params: t.Object({ id: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/payments",
    ({ params, set }) => billsController.listPayments({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/:id/payments",
    ({ params, body, currentUser, set }) =>
      billsController.createPayment({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: createBillPaymentBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:id/payments/:paymentId",
    ({ params, body, set }) => billsController.updatePaymentStatus({ params, body, set }),
    {
      params: t.Object({ id: t.String(), paymentId: t.String() }),
      body: updateBillPaymentBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  );
