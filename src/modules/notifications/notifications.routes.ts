import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { notificationsController, pushTokensController } from "./notifications.controller";
import { notificationListQuerySchema, registerPushTokenBodySchema } from "./notifications.schema";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .use(auth)
  .get(
    "/",
    ({ query, currentUser, set }) => notificationsController.list({ query, currentUser, set }),
    { query: notificationListQuerySchema, requireAuth: true },
  )
  .patch(
    "/:id/read",
    ({ params, currentUser, set }) => notificationsController.markRead({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/mark-all-read",
    ({ currentUser, set }) => notificationsController.markAllRead({ currentUser, set }),
    { requireAuth: true },
  );

export const pushTokensRoutes = new Elysia({ prefix: "/push-tokens" })
  .use(auth)
  .post(
    "/",
    ({ body, currentUser, set }) => pushTokensController.register({ body, currentUser, set }),
    { body: registerPushTokenBodySchema, requireAuth: true },
  );
