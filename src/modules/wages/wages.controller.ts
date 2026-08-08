import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { wagesService } from "./wages.service";
import type { UpsertWageBody, WageListQuery } from "./wages.types";

export const wagesController = {
  async list({ query, set }: { query: WageListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await wagesService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list wages") };
    }
  },

  async upsert({
    body,
    currentUser,
    set,
  }: {
    body: UpsertWageBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await wagesService.upsert(body, currentUser.id);
      return ok(record, "Wage record saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save wage record") };
    }
  },

  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await wagesService.delete(params.id);
      return ok(null, "Wage record deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete wage record") };
    }
  },
};
