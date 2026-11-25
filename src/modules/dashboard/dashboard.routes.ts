import { Elysia } from "elysia";
import { auth } from "@plugins";
import { dashboardController } from "./dashboard.controller";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .use(auth)
  .get(
    "/overview",
    ({ query, currentUser, set }) =>
      dashboardController.getOverview({
        query: query as { projectId?: string; period?: string; month?: string; year?: string },
        currentUser,
        set,
      }),
    { requireAuth: true },
  )
  .get(
    "/charts",
    ({ query, currentUser, set }) =>
      dashboardController.getCharts({
        query: query as { projectId?: string; period?: string; month?: string; year?: string },
        currentUser,
        set,
      }),
    { requireAuth: true },
  );
