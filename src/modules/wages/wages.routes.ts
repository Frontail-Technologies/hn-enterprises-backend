import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { wagesController } from "./wages.controller";
import { upsertWageBodySchema, wageListQuerySchema } from "./wages.schema";

export const wagesRoutes = new Elysia({ prefix: "/wages" })
  .use(auth)
  .get("/", ({ query, set }) => wagesController.list({ query, set }), {
    query: wageListQuerySchema,
    requireAuth: true,
  })
  .put(
    "/",
    ({ body, currentUser, set }) => wagesController.upsert({ body, currentUser, set }),
    { body: upsertWageBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .delete(
    "/:id",
    ({ params, set }) => wagesController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
