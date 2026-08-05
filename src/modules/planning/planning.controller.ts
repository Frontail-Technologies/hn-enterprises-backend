import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { planningService } from "./planning.service";
import type {
  DprRecordListQuery,
  SitePlanListQuery,
  UpsertDprRecordBody,
  UpsertSitePlanBody,
} from "./planning.types";

export const planningController = {
  async listSitePlans({ query, set }: { query: SitePlanListQuery; set: SetContext }) {
    try {
      const rows = await planningService.listSitePlans(query);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list site plans") };
    }
  },

  async upsertSitePlan({
    body,
    currentUser,
    set,
  }: {
    body: UpsertSitePlanBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await planningService.upsertSitePlan(body, currentUser.id);
      return ok(record, "Site plan saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save site plan") };
    }
  },

  async listDprRecords({ query, set }: { query: DprRecordListQuery; set: SetContext }) {
    try {
      const rows = await planningService.listDprRecords(query);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list DPR records") };
    }
  },

  async upsertDprRecord({
    body,
    currentUser,
    set,
  }: {
    body: UpsertDprRecordBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await planningService.upsertDprRecord(body, currentUser.id);
      return ok(record, "DPR record saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save DPR record") };
    }
  },
};
