import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { plumbersController } from "./plumbers.controller";
import { createPlumberBodySchema, plumberListQuerySchema, updatePlumberBodySchema } from "./plumbers.schema";

export const plumbersRoutes = new Elysia({ prefix: "/plumbers" })
  .use(auth)
  .get("/", ({ query, set }) => plumbersController.list({ query, set }), {
    query: plumberListQuerySchema,
    requireAuth: true,
  })
  .get(
    "/:id",
    ({ params, set }) => plumbersController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => plumbersController.create({ body, currentUser, set }),
    { body: createPlumberBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => plumbersController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updatePlumberBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id",
    ({ params, set }) => plumbersController.remove({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
