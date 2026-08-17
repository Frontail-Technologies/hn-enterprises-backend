import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { bulkDeleteByIdsBodySchema } from "@utils";
import { staffController } from "./staff.controller";
import { createStaffBodySchema, staffListQuerySchema, updateStaffBodySchema } from "./staff.schema";

export const staffRoutes = new Elysia({ prefix: "/staff" })
  .use(auth)
  .get("/", ({ query, set }) => staffController.list({ query, set }), {
    query: staffListQuerySchema,
    requireRole: ["super_admin", "admin"],
  })
  .post(
    "/bulk/delete",
    ({ body, set }) => staffController.bulkDelete({ body, set }),
    { body: bulkDeleteByIdsBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => staffController.create({ body, currentUser, set }),
    { body: createStaffBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/:id",
    ({ params, set }) => staffController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => staffController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateStaffBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/delete-impact",
    ({ params, set }) => staffController.deleteImpact({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .delete(
    "/:id",
    ({ params, set }) => staffController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
