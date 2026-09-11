import { Elysia } from "elysia";
import { auth } from "@plugins";
import { dashboardController } from "./dashboard.controller";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .use(auth)
  .get(
    "/overview",
    ({ query, set }) =>
      dashboardController.getOverview({
        query: query as { projectId?: string; period?: string; month?: string; year?: string },
        set,
      }),
    { requireAuth: true },
  );
