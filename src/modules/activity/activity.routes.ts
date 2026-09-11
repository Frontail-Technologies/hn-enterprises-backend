import { Elysia } from "elysia";
import { auth } from "@plugins";
import { activityController } from "./activity.controller";
import { activityListQuerySchema } from "./activity.schema";

export const activityRoutes = new Elysia({ prefix: "/activity" })
  .use(auth)
  .get("/", ({ query, currentUser, set }) => activityController.list({ query, currentUser, set }), {
    query: activityListQuerySchema,
    requireAuth: true,
  });
