import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { usersController, usersImportController } from "./users.controller";
import {
  createUserBodySchema,
  resetPasswordBodySchema,
  updateUserBodySchema,
  userListQuerySchema,
} from "./users.schema";

export const usersRoutes = new Elysia({ prefix: "/users" })
  .use(auth)
  .get("/", ({ query, set }) => usersController.list({ query, set }), {
    query: userListQuerySchema,
    requireRole: ["super_admin", "admin"],
  })
  .post(
    "/import/preview",
    ({ body, currentUser, set }) => usersImportController.preview({ body: body as any, currentUser, set }),
    {
      body: t.Object({
        file: t.File(),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/import/confirm",
    ({ body, currentUser, set }) => usersImportController.confirm({ body: body as any, currentUser, set }),
    {
      body: t.Object({
        validRows: t.Array(t.Any()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => usersController.create({ body, currentUser, set }),
    { body: createUserBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/:id",
    ({ params, set }) => usersController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => usersController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateUserBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/:id/reset-password",
    ({ params, body, set }) => usersController.resetPassword({ params, body, set }),
    {
      params: t.Object({ id: t.String() }),
      body: resetPasswordBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) => usersController.delete({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
