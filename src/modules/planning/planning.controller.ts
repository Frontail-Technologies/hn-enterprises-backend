import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { accessibleProjectIds } from "@modules/projects/project-access.service";
import { planningService } from "./planning.service";
import type {
  DprRecordListQuery,
  SitePlanListQuery,
  UpsertDprRecordBody,
  UpsertSitePlanBody,
} from "./planning.types";

export const planningController = {
  async listSitePlans({ query, currentUser, set }: { query: SitePlanListQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const rows = await planningService.listSitePlans(query, await accessibleProjectIds(currentUser));
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
      const record = await planningService.upsertSitePlan(body, currentUser);
      return ok(record, "Site plan saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save site plan") };
    }
  },

  async listDprRecords({ query, currentUser, set }: { query: DprRecordListQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const rows = await planningService.listDprRecords(query, await accessibleProjectIds(currentUser));
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
      const record = await planningService.upsertDprRecord(body, currentUser);
      return ok(record, "DPR record saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save DPR record") };
    }
  },

  async getWorkPlanningOverview({
    query,
    currentUser,
    set,
  }: {
    query: { date: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const rows = await planningService.getWorkPlanningOverview(query.date, currentUser);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load Work Planning overview") };
    }
  },

  async getDprOverview({
    query,
    currentUser,
    set,
  }: {
    query: { date: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const rows = await planningService.getDprOverview(query.date, currentUser);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load DPR overview") };
    }
  },

  async listSiteCustomers({
    query,
    currentUser,
    set,
  }: {
    query: { siteId: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const rows = await planningService.listSiteCustomers(query.siteId, currentUser);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list Site customers") };
    }
  },
};
