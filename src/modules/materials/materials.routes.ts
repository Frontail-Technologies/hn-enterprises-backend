import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { materialsController, materialsImportController } from "./materials.controller";
import {
  createMaterialBodySchema,
  createMaterialTransactionBodySchema,
  materialListQuerySchema,
  materialTransactionListQuerySchema,
  plumberBalanceQuerySchema,
  updateMaterialBodySchema,
} from "./materials.schema";

export const materialsRoutes = new Elysia({ prefix: "/materials" })
  .use(auth)
  .get("/", ({ query, set }) => materialsController.list({ query, set }), {
    query: materialListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/",
    ({ body, currentUser, set }) => materialsController.create({ body, currentUser, set }),
    { body: createMaterialBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/import/preview",
    ({ body, currentUser, set }) => materialsImportController.preview({ body, currentUser, set }),
    { body: t.Object({ file: t.File() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/import/confirm",
    ({ body, currentUser, set }) => materialsImportController.confirm({ body, currentUser, set }),
    {
      body: t.Object({
        validRows: t.Array(
          t.Object({
            name: t.String(),
            category: t.String(),
            unit: t.String(),
            reorderLevel: t.Number(),
          }),
        ),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/transactions",
    ({ query, set }) => materialsController.listTransactions({ query, set }),
    { query: materialTransactionListQuerySchema, requireAuth: true },
  )
  .post(
    "/transactions",
    ({ body, currentUser, set }) => materialsController.createTransaction({ body, currentUser, set }),
    { body: createMaterialTransactionBodySchema, requireAuth: true },
  )
  .get(
    "/plumber-balances",
    ({ query, set }) => materialsController.plumberBalances({ query, set }),
    { query: plumberBalanceQuerySchema, requireAuth: true },
  )
  .get(
    "/:id",
    ({ params, set }) => materialsController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => materialsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateMaterialBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) => materialsController.delete({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  );
