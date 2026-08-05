import { Elysia } from "elysia";
import { auth } from "@plugins";
import { statsController } from "./stats.controller";
import { statDetailParamsSchema } from "./stats.schema";

export const statsRoutes = new Elysia({ prefix: "/stats" })
  .use(auth)
  .get("/summary", ({ set }) => statsController.getSummary({ set }), {
    requireAuth: true,
  })
  .get("/admin-summary", ({ query, set }) => statsController.getAdminSummary({ query: query as { projectId?: string; city?: string }, set }), {
    requireAuth: true,
  })
  .get(
    "/:type/details",
    ({ params, set }) => statsController.getDetails({ params, set }),
    { params: statDetailParamsSchema, requireAuth: true },
  );
