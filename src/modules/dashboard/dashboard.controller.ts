import type { SetContext } from "@modules/auth/auth.helpers";
import { isProjectScoped } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { dashboardService, type DashboardPeriod } from "./dashboard.service";

const VALID_PERIODS = new Set<DashboardPeriod>(["today", "this-month", "this-year", "custom-month", "custom-year"]);

type OverviewQuery = { projectId?: string; period?: string; month?: string; year?: string };

/**
 * The admin dashboard aggregates org-wide data (bills, payments, stock,
 * attendance, activity) that is not project-scoped, so project-scoped users
 * (supervisors) are refused with a 403 instead of seeing other projects' data.
 */
function assertDashboardAccess(currentUser: AuthTokenPayload | null) {
  if (isProjectScoped(currentUser)) throw new Error("You do not have permission to view the admin dashboard");
}

export const dashboardController = {
  async getCharts({ query, currentUser, set }: { query: OverviewQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      assertDashboardAccess(currentUser);
      const period = VALID_PERIODS.has(query.period as DashboardPeriod) ? (query.period as DashboardPeriod) : undefined;
      return ok(
        await dashboardService.getCharts({
          projectId: query.projectId,
          period,
          month: query.month ? Number(query.month) : undefined,
          year: query.year ? Number(query.year) : undefined,
        }),
      );
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load dashboard charts") };
    }
  },

  async getOverview({
    query,
    currentUser,
    set,
  }: {
    query: { projectId?: string; period?: string; month?: string; year?: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      assertDashboardAccess(currentUser);
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
