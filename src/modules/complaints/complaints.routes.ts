import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { complaintsController } from "./complaints.controller";
import {
  complaintListQuerySchema,
  createComplaintBodySchema,
  updateComplaintBodySchema,
} from "./complaints.schema";

export const complaintsRoutes = new Elysia({ prefix: "/complaints" })
  .use(auth)
  .get("/", ({ query, set }) => complaintsController.list({ query, set }), {
    query: complaintListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/",
    ({ body, currentUser, set }) => complaintsController.create({ body, currentUser, set }),
    { body: createComplaintBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => complaintsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateComplaintBodySchema,
      requireAuth: true,
    },
  );
