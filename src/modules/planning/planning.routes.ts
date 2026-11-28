import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { planningController } from "./planning.controller";
import { getProjectPlanningOverview, listProjectCustomers } from "./planning-project.service";
import { listPlanningCustomers, type PlanningCustomersQuery } from "./planning-customers.service";
import {
  deleteProjectPlanning,
  listProjectDprs,
  listProjectPlans,
  reviewProjectPlans,
  updateProjectDprByAdmin,
  updateProjectPlanByAdmin,
  upsertProjectDpr,
  upsertProjectPlan,
  type ProjectPlanningListQuery,
} from "./project-planning.service";
import { deletePlanningRecord, reviewSitePlans, updateDprRecordByAdmin, updateSitePlanByAdmin } from "./planning-review.service";

type SetContext = { status?: number | string };
async function run<T>(set: SetContext, fallback: string, action: () => Promise<T>, message?: string) {
  try {
    return ok(await action(), message);
  } catch (error) {
    set.status = statusFromError(error);
    return { success: false, message: errorMessage(error, fallback) };
  }
}
import {
  dprRecordListQuerySchema,
  dprTaskSchema,
  planTaskSchema,
  planningOverviewQuerySchema,
  siteCustomersQuerySchema,
  sitePlanListQuerySchema,
  upsertDprRecordBodySchema,
  upsertSitePlanBodySchema,
} from "./planning.schema";

const projectPlanningListQuery = t.Object({
  projectId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  date: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  status: t.Optional(t.String()),
});
const projectDprManpower = t.Object({
  plumberId: t.Optional(t.String()),
  name: t.String(),
  category: t.Optional(t.Union([t.Literal("plumber"), t.Literal("labour")])),
});
const projectDprTask = t.Object({
  id: t.String({ minLength: 1 }),
  plannedQty: t.Optional(t.String()),
  doneQty: t.Optional(t.String()),
  delayReason: t.Optional(t.String()),
  workers: t.Optional(t.Array(projectDprManpower)),
});
const projectPlanTask = t.Object({
  id: t.String({ minLength: 1 }),
  qty: t.Optional(t.String()),
  workers: t.Optional(t.Array(projectDprManpower)),
});
const evidenceFile = t.Object({
  id: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1 }),
  fileUrl: t.String({ minLength: 1 }),
  mimeType: t.Optional(t.String()),
  capturedAt: t.Optional(t.String()),
});

export const planningRoutes = new Elysia({ prefix: "/planning" })
  .use(auth)
  // ---- Project-wise plans and DPRs (one per supervisor, project and day) ----
  .get(
    "/project-plans",
    ({ query, currentUser, set }) =>
      run(set, "Unable to load plans", () => listProjectPlans(query as ProjectPlanningListQuery, currentUser as AuthTokenPayload)),
    { query: projectPlanningListQuery, requireAuth: true },
  )
  .put(
    "/project-plans",
    ({ body, currentUser, set }) =>
      run(set, "Unable to save the plan", () => upsertProjectPlan(body, currentUser as AuthTokenPayload), "Plan saved"),
    {
      body: t.Object({
        projectId: t.String({ format: "uuid" }),
        date: t.String({ minLength: 10, maxLength: 10 }),
        tasks: t.Array(projectPlanTask),
        remarks: t.Optional(t.String()),
      }),
      requireAuth: true,
    },
  )
  .post(
    "/project-plans/review",
    ({ body, currentUser, set }) =>
      run(set, "Unable to review plans", () => reviewProjectPlans(body.ids, body.action, body.note, (currentUser as AuthTokenPayload).id),
        body.action === "approve" ? "Plan approved" : "Plan sent back"),
    {
      body: t.Object({
        ids: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
        action: t.Union([t.Literal("approve"), t.Literal("reject")]),
        note: t.Optional(t.String()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/project-plans/:id",
    ({ params, body, currentUser, set }) =>
      run(set, "Unable to update the plan", () => updateProjectPlanByAdmin(params.id, body, (currentUser as AuthTokenPayload).id), "Plan updated"),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        tasks: t.Optional(t.Array(projectPlanTask)),
        remarks: t.Optional(t.String()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/project-plans/:id",
    ({ params, currentUser, set }) =>
      run(set, "Unable to delete the plan", () => deleteProjectPlanning("plan", params.id, (currentUser as AuthTokenPayload).id), "Plan deleted"),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/project-dprs",
    ({ query, currentUser, set }) =>
      run(set, "Unable to load DPRs", () => listProjectDprs(query as ProjectPlanningListQuery, currentUser as AuthTokenPayload)),
    { query: projectPlanningListQuery, requireAuth: true },
  )
  .put(
    "/project-dprs",
    ({ body, currentUser, set }) =>
      run(set, "Unable to save the DPR", () => upsertProjectDpr(body, currentUser as AuthTokenPayload), "DPR saved"),
    {
      body: t.Object({
        projectId: t.String({ format: "uuid" }),
        date: t.String({ minLength: 10, maxLength: 10 }),
        tasks: t.Array(projectDprTask),
        manpower: t.Optional(t.Array(projectDprManpower)),
        remarks: t.Optional(t.String()),
        evidence: t.Optional(t.Array(evidenceFile)),
        status: t.Optional(t.Union([t.Literal("draft"), t.Literal("submitted")])),
      }),
      requireAuth: true,
    },
  )
  .patch(
    "/project-dprs/:id",
    ({ params, body, currentUser, set }) =>
      run(set, "Unable to update the DPR", () => updateProjectDprByAdmin(params.id, body, (currentUser as AuthTokenPayload).id), "DPR updated"),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        tasks: t.Optional(t.Array(projectDprTask)),
        manpower: t.Optional(t.Array(projectDprManpower)),
        remarks: t.Optional(t.String()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/project-dprs/:id",
    ({ params, currentUser, set }) =>
      run(set, "Unable to delete the DPR", () => deleteProjectPlanning("dpr", params.id, (currentUser as AuthTokenPayload).id), "DPR deleted"),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), requireRole: ["super_admin", "admin"] },
  )
  // Project-wise overview / customers (mobile planning lists by project, not site).
  .get(
    "/project-overview",
    ({ query, currentUser, set }) =>
      run(set, "Unable to load the planning overview", () =>
        getProjectPlanningOverview(query.date, query.mode ?? "work", currentUser as AuthTokenPayload),
      ),
    {
      query: t.Object({ date: t.String({ minLength: 1 }), mode: t.Optional(t.Union([t.Literal("work"), t.Literal("dpr")])) }),
      requireAuth: true,
    },
  )
  // Paged customer list with each one's plan / DPR status for the day (app DPR / Planning tab).
  .get(
    "/customers",
    async ({ query, currentUser, set }) => {
      try {
        const { rows, pagination, counts } = await listPlanningCustomers(query as PlanningCustomersQuery, currentUser as AuthTokenPayload);
        return ok(rows, undefined, { pagination, counts });
      } catch (error) {
        set.status = statusFromError(error);
        return { success: false, message: errorMessage(error, "Unable to load customers") };
      }
    },
    {
      query: t.Object({
        date: t.String({ minLength: 10, maxLength: 10 }),
        mode: t.Optional(t.Union([t.Literal("work"), t.Literal("dpr")])),
        projectId: t.Optional(t.String({ format: "uuid" })),
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAuth: true,
    },
  )
  .get(
    "/project-customers",
    ({ query, currentUser, set }) =>
      run(set, "Unable to load customers", () => listProjectCustomers(query.projectId, currentUser as AuthTokenPayload)),
    { query: t.Object({ projectId: t.String({ format: "uuid" }) }), requireAuth: true },
  )
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
  // Admin review: approve submitted plans, or send them back with a reason.
  .post(
    "/site-plans/review",
    ({ body, currentUser, set }) =>
      run(set, "Unable to review plan", () => reviewSitePlans(body.ids, body.action, body.note, (currentUser as AuthTokenPayload).id),
        body.action === "approve" ? "Plan approved" : "Plan sent back"),
    {
      body: t.Object({
        ids: t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 500 }),
        action: t.Union([t.Literal("approve"), t.Literal("reject")]),
        note: t.Optional(t.String({ maxLength: 1000 })),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  // Admin edit / delete (delete goes to the recycle bin).
  .patch(
    "/site-plans/:id",
    ({ params, body, currentUser, set }) =>
      run(set, "Unable to save plan", () => updateSitePlanByAdmin(params.id, body, (currentUser as AuthTokenPayload).id), "Plan saved"),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), body: t.Object({ tasks: t.Array(planTaskSchema) }), requireRole: ["super_admin", "admin"] },
  )
  .delete(
    "/site-plans/:id",
    ({ params, currentUser, set }) =>
      run(set, "Unable to delete plan", () => deletePlanningRecord("plan", params.id, (currentUser as AuthTokenPayload).id), "Plan deleted"),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/dpr-records/:id",
    ({ params, body, currentUser, set }) =>
      run(set, "Unable to save DPR", () => updateDprRecordByAdmin(params.id, body, (currentUser as AuthTokenPayload).id), "DPR saved"),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        tasks: t.Optional(t.Array(dprTaskSchema)),
        remarks: t.Optional(t.String({ maxLength: 2000 })),
        status: t.Optional(t.Union([t.Literal("draft"), t.Literal("submitted")])),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/dpr-records/:id",
    ({ params, currentUser, set }) =>
      run(set, "Unable to delete DPR", () => deletePlanningRecord("dpr", params.id, (currentUser as AuthTokenPayload).id), "DPR deleted"),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), requireRole: ["super_admin", "admin"] },
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
