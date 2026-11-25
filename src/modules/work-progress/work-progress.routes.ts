import { Elysia } from "elysia";
import { auth } from "@plugins";
import { workProgressController } from "./work-progress.controller";
import {
  createWorkProgressUpdateBodySchema,
  workProgressListQuerySchema,
  workProgressQueueQuerySchema,
} from "./work-progress.schema";

export const workProgressRoutes = new Elysia({ prefix: "/work-progress" })
  .use(auth)
  .get(
    "/queue",
    ({ query, currentUser, set }) => workProgressController.listQueue({ query, currentUser, set }),
    { query: workProgressQueueQuerySchema, requireAuth: true },
  )
  .get(
    "/queue/summary",
    ({ query, currentUser, set }) => workProgressController.queueSummary({ query, currentUser, set }),
    { query: workProgressQueueQuerySchema, requireAuth: true },
  )
  .get(
    "/",
    ({ query, currentUser, set }) => workProgressController.list({ query, currentUser, set }),
    { query: workProgressListQuerySchema, requireAuth: true },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => workProgressController.create({ body, currentUser, set }),
    { body: createWorkProgressUpdateBodySchema, requireRole: ["super_admin", "admin", "supervisor"] },
  );
