import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { workProgressService } from "./work-progress.service";
import type {
  CreateWorkProgressUpdateBody,
  WorkProgressListQuery,
  WorkProgressQueueQuery,
} from "./work-progress.types";

export const workProgressController = {
  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateWorkProgressUpdateBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await workProgressService.create(body, currentUser.id), "Work progress update recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record work progress update") };
    }
  },

  async list({ query, set }: { query: WorkProgressListQuery; set: SetContext }) {
    try {
      return ok(await workProgressService.list(query));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list work progress updates") };
    }
  },

  async listQueue({ query, set }: { query: WorkProgressQueueQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await workProgressService.listQueue(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list work progress queue") };
    }
  },
};
