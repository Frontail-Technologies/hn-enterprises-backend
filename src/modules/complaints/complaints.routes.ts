import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { complaintsController } from "./complaints.controller";
import {
  complaintListQuerySchema,
  complaintStatusCountsQuerySchema,
  createComplaintBodySchema,
  updateComplaintBodySchema,
} from "./complaints.schema";

export const complaintsRoutes = new Elysia({ prefix: "/complaints" })
  .use(auth)
  .get("/", ({ query, set }) => complaintsController.list({ query, set }), {
    query: complaintListQuerySchema,
    requireAuth: true,
  })
  .get(
    "/status-counts",
    ({ query, set }) => complaintsController.statusCounts({ query, set }),
    { query: complaintStatusCountsQuerySchema, requireAuth: true },
  )
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
  )
  .delete(
    "/:id",
    ({ params, set }) => complaintsController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/:id/push",
    ({ params, currentUser, set }) => complaintsController.push({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
