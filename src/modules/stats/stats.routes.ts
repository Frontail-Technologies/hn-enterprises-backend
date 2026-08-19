import { Elysia } from "elysia";
import { auth } from "@plugins";
import { statsController } from "./stats.controller";
import { statDetailParamsSchema, statDetailQuerySchema } from "./stats.schema";

export const statsRoutes = new Elysia({ prefix: "/stats" })
  .use(auth)
  .get("/summary", ({ currentUser, set }) => statsController.getSummary({ currentUser, set }), {
    requireAuth: true,
  })
  .get(
    "/admin-summary",
    ({ query, set }) =>
      statsController.getAdminSummary({
        query: query as { projectId?: string; city?: string; siteId?: string; month?: string; year?: string },
        set,
      }),
    { requireAuth: true },
  )
  .get(
    "/:type/details",
    ({ params, query, currentUser, set }) => statsController.getDetails({ params, query, currentUser, set }),
    { params: statDetailParamsSchema, query: statDetailQuerySchema, requireAuth: true },
  );
