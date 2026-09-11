import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, paginated, statusFromError } from "@utils";
import { activityService } from "./activity.service";
import type { ActivityListQuery } from "./activity.types";

export const activityController = {
  async list({
    query,
    currentUser,
    set,
  }: {
    query: ActivityListQuery;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const { rows, pagination } = await activityService.list(query, currentUser);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load activity feed") };
    }
  },
};
