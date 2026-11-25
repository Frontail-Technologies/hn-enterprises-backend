import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { planningController } from "./planning.controller";
import { reviewDprRecords } from "./planning-review.service";
import {
  dprRecordListQuerySchema,
  planningOverviewQuerySchema,
  siteCustomersQuerySchema,
  sitePlanListQuerySchema,
  upsertDprRecordBodySchema,
  upsertSitePlanBodySchema,
} from "./planning.schema";

export const planningRoutes = new Elysia({ prefix: "/planning" })
  .use(auth)
  .get(
    "/site-plans",
    ({ query, currentUser, set }) => planningController.listSitePlans({ query, currentUser, set }),
    { query: sitePlanListQuerySchema, requireAuth: true },
  )
  .put(
    "/site-plans",
    ({ body, currentUser, set }) => planningController.upsertSitePlan({ body, currentUser, set }),
    { body: upsertSitePlanBodySchema, requireAuth: true },
  )
  .get(
    "/site-plans/overview",
    ({ query, currentUser, set }) => planningController.getWorkPlanningOverview({ query, currentUser, set }),
    { query: planningOverviewQuerySchema, requireAuth: true },
  )
  .get(
    "/dpr-records",
    ({ query, currentUser, set }) => planningController.listDprRecords({ query, currentUser, set }),
    { query: dprRecordListQuerySchema, requireAuth: true },
  )
  .put(
    "/dpr-records",
    ({ body, currentUser, set }) => planningController.upsertDprRecord({ body, currentUser, set }),
    { body: upsertDprRecordBodySchema, requireAuth: true },
  )
  // Admin review: approve submitted DPRs, or send them back (to draft) with a reason.
  .post(
    "/dpr-records/review",
    async ({ body, currentUser, set }) => {
      try {
        const result = await reviewDprRecords(body.ids, body.action, body.note, (currentUser as AuthTokenPayload).id);
        return ok(result, body.action === "approve" ? "DPR approved" : "DPR sent back");
      } catch (error) {
        set.status = statusFromError(error);
        return { success: false, message: errorMessage(error, "Unable to review DPR") };
      }
    },
    {
      body: t.Object({
        ids: t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 500 }),
        action: t.Union([t.Literal("approve"), t.Literal("reject")]),
        note: t.Optional(t.String({ maxLength: 1000 })),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/dpr-records/overview",
    ({ query, currentUser, set }) => planningController.getDprOverview({ query, currentUser, set }),
    { query: planningOverviewQuerySchema, requireAuth: true },
  )
  .get(
    "/site-customers",
    ({ query, currentUser, set }) => planningController.listSiteCustomers({ query, currentUser, set }),
    { query: siteCustomersQuerySchema, requireAuth: true },
  );
