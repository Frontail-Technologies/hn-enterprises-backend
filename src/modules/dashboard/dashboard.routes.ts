import { Elysia } from "elysia";
import { auth } from "@plugins";
import { errorMessage, ok, statusFromError } from "@utils";
import { dashboardController } from "./dashboard.controller";
import { getCustomerMapPoints } from "./dashboard-map.service";

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
  )
  // Customers with a location, for the dashboard map.
  .get(
    "/customer-map",
    async ({ query, currentUser, set }) => {
      try {
        return ok(await getCustomerMapPoints((query as { projectId?: string }).projectId, currentUser));
      } catch (error) {
        set.status = statusFromError(error);
        return { success: false, message: errorMessage(error, "Unable to load the customer map") };
      }
    },
    { requireAuth: true },
  );
