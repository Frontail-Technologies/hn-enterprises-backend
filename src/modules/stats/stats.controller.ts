import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { statsService } from "./stats.service";
import { dashboardStatsService } from "./dashboard-stats.service";

export const statsController = {
  async getSummary({ set }: { set: SetContext }) {
    try {
      return ok(await statsService.getSummary());
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load stats summary") };
    }
  },

  async getAdminSummary({ query, set }: { query: { projectId?: string; city?: string }; set: SetContext }) {
    try {
      return ok(await dashboardStatsService.getAdminCounts(query.projectId, query.city));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load admin stats summary") };
    }
  },

  async getDetails({
    params,
    query,
    set,
  }: {
    params: { type: string };
    query: { page?: string; limit?: string };
    set: SetContext;
  }) {
    try {
      const { rows, pagination } = await statsService.getDetails(params.type, query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load stat details") };
    }
  },
};
