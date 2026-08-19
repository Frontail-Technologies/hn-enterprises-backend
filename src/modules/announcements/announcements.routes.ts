import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { bulkDeleteByIdsBodySchema } from "@utils";
import { announcementsController } from "./announcements.controller";
import {
  announcementListQuerySchema,
  createAnnouncementBodySchema,
  updateAnnouncementBodySchema,
} from "./announcements.schema";

export const announcementsRoutes = new Elysia({ prefix: "/announcements" })
  .use(auth)
  .get("/", ({ query, set }) => announcementsController.list({ query, set }), {
    query: announcementListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/bulk/delete",
    ({ body, set }) => announcementsController.bulkDelete({ body, set }),
    { body: bulkDeleteByIdsBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => announcementsController.create({ body, currentUser, set }),
    { body: createAnnouncementBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) => announcementsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateAnnouncementBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/:id/publish",
    ({ params, set }) => announcementsController.publish({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/:id/republish",
    ({ params, set }) => announcementsController.republish({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .delete(
    "/:id",
    ({ params, set }) => announcementsController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
