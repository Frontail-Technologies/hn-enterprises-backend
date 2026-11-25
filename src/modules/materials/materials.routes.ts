import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { inventoryController, materialsController, materialsImportController } from "./materials.controller";
import {
  correctMaterialTransactionBodySchema,
  createMaterialBodySchema,
  createMaterialTransactionBodySchema,
  inventoryOverviewQuerySchema,
  materialDetailTransactionListQuerySchema,
  materialListQuerySchema,
  materialTransactionListQuerySchema,
  plumberBalanceQuerySchema,
  projectUsageQuerySchema,
  reverseMaterialTransactionBodySchema,
  stockBalanceQuerySchema,
  updateMaterialBodySchema,
} from "./materials.schema";

export const inventoryRoutes = new Elysia({ prefix: "/inventory" })
  .use(auth)
  .get(
    "/overview",
    ({ query, currentUser, set }) => inventoryController.getOverview({ query, currentUser, set }),
    { query: inventoryOverviewQuerySchema, requireAuth: true },
  );

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
            rowNumber: t.Number(),
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
  .post(
    "/import/validate-row",
    ({ body, currentUser, set }) => materialsImportController.validateRow({ body, currentUser, set }),
    {
      body: t.Object({
        data: t.Object({
          name: t.String(),
          category: t.String(),
          unit: t.String(),
          reorderLevel: t.Number(),
        }),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/transactions",
    ({ query, currentUser, set }) => materialsController.listTransactions({ query, currentUser, set }),
    { query: materialTransactionListQuerySchema, requireAuth: true },
  )
  .post(
    "/transactions",
    ({ body, currentUser, set }) => materialsController.createTransaction({ body, currentUser, set }),
    { body: createMaterialTransactionBodySchema, requireAuth: true },
  )
  .get(
    "/plumber-balances",
    ({ query, currentUser, set }) => materialsController.plumberBalances({ query, currentUser, set }),
    { query: plumberBalanceQuerySchema, requireAuth: true },
  )
  .get(
    "/total-issue",
    ({ query, currentUser, set }) => materialsController.totalIssueSummary({ query, currentUser, set }),
    { query: inventoryOverviewQuerySchema, requireAuth: true },
  )
  .get(
    "/project-usage",
    ({ query, currentUser, set }) => materialsController.projectUsageSummary({ query, currentUser, set }),
    { query: projectUsageQuerySchema, requireAuth: true },
  )
  .get(
    "/stock-balances",
    ({ query, currentUser, set }) => materialsController.stockBalances({ query, currentUser, set }),
    { query: stockBalanceQuerySchema, requireAuth: true },
  )
  .post(
    "/transactions/:id/reverse",
    ({ params, body, currentUser, set }) => materialsController.reverseTransaction({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: reverseMaterialTransactionBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/transactions/:id/correct",
    ({ params, body, currentUser, set }) => materialsController.correctTransaction({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: correctMaterialTransactionBodySchema,
      requireRole: ["super_admin", "admin"],
    },
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
  .get(
    "/:id/delete-impact",
    ({ params, set }) => materialsController.deleteImpact({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/:id/overview",
    ({ params, currentUser, set }) => materialsController.getOverview({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .get(
    "/:id/transactions",
    ({ params, query, currentUser, set }) => materialsController.listTransactionsForDetailTab({ params, query, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      query: materialDetailTransactionListQuerySchema,
      requireAuth: true,
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
