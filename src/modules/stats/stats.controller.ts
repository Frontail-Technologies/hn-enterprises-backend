import type { SetContext } from "@modules/auth/auth.helpers";
import { ok } from "@utils";
import { statsService } from "./stats.service";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const statsController = {
  async getSummary({ set }: { set: SetContext }) {
    try {
      return ok(await statsService.getSummary());
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load stats summary") };
    }
  },

  async getDetails({ params, set }: { params: { type: string }; set: SetContext }) {
    try {
      return ok(await statsService.getDetails(params.type));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load stat details") };
    }
  },
};
