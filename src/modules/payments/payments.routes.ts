import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { paymentsController } from "./payments.controller";
import { createPaymentBodySchema, paymentListQuerySchema, updatePaymentBodySchema } from "./payments.schema";

export const paymentsRoutes = new Elysia({ prefix: "/payments" })
  .use(auth)
  .get("/", ({ query, set }) => paymentsController.list({ query, set }), {
    query: paymentListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/",
    ({ body, currentUser, set }) => paymentsController.create({ body, currentUser, set }),
    { body: createPaymentBodySchema, requireAuth: true },
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
