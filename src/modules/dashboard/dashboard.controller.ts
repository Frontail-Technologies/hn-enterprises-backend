import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { dashboardService, type DashboardPeriod } from "./dashboard.service";

const VALID_PERIODS = new Set<DashboardPeriod>(["today", "this-month", "this-year", "custom-month", "custom-year"]);

export const dashboardController = {
  async getOverview({
    query,
    set,
  }: {
    query: { projectId?: string; period?: string; month?: string; year?: string };
    set: SetContext;
  }) {
    try {
      const period = VALID_PERIODS.has(query.period as DashboardPeriod) ? (query.period as DashboardPeriod) : undefined;
      return ok(
        await dashboardService.getOverview({
          projectId: query.projectId,
          period,
          month: query.month ? Number(query.month) : undefined,
          year: query.year ? Number(query.year) : undefined,
        }),
      );
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load dashboard overview") };
    }
  },
};
