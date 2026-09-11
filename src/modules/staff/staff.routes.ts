import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { staffController } from "./staff.controller";
import { createStaffBodySchema, staffListQuerySchema, updateStaffBodySchema } from "./staff.schema";

// No DELETE /:id, GET /:id/delete-impact, or POST /bulk/delete here anymore -
// deleting a staff-linked supervisor goes through the canonical user
// hard-delete endpoints (/users/:id, /users/:id/delete-impact,
// /users/bulk/delete), keyed by staff.userId. See remove-staff-block brief §8.
export const staffRoutes = new Elysia({ prefix: "/staff" })
  .use(auth)
  .get("/", ({ query, set }) => staffController.list({ query, set }), {
    query: staffListQuerySchema,
    requireRole: ["super_admin", "admin"],
  })
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
  );
