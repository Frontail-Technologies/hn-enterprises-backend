import { Elysia } from "elysia";
import { auth } from "@plugins";
import { planningController } from "./planning.controller";
import {
  dprRecordListQuerySchema,
  sitePlanListQuerySchema,
  upsertDprRecordBodySchema,
  upsertSitePlanBodySchema,
} from "./planning.schema";

export const planningRoutes = new Elysia({ prefix: "/planning" })
  .use(auth)
  .get(
    "/site-plans",
    ({ query, set }) => planningController.listSitePlans({ query, set }),
    { query: sitePlanListQuerySchema, requireAuth: true },
  )
  .put(
    "/site-plans",
    ({ body, currentUser, set }) => planningController.upsertSitePlan({ body, currentUser, set }),
    { body: upsertSitePlanBodySchema, requireAuth: true },
  )
  .get(
    "/dpr-records",
    ({ query, set }) => planningController.listDprRecords({ query, set }),
    { query: dprRecordListQuerySchema, requireAuth: true },
  )
  .put(
    "/dpr-records",
    ({ body, currentUser, set }) => planningController.upsertDprRecord({ body, currentUser, set }),
    { body: upsertDprRecordBodySchema, requireAuth: true },
  );
