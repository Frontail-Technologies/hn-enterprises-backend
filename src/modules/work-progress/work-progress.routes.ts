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
    ({ query, set }) => workProgressController.listQueue({ query, set }),
    { query: workProgressQueueQuerySchema, requireAuth: true },
  )
  .get(
    "/",
    ({ query, set }) => workProgressController.list({ query, set }),
    { query: workProgressListQuerySchema, requireAuth: true },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => workProgressController.create({ body, currentUser, set }),
    { body: createWorkProgressUpdateBodySchema, requireAuth: true },
  );
