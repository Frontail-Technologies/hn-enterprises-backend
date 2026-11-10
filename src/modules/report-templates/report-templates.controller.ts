import type { SetContext } from "@modules/auth/auth.helpers";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { reportTemplatesService, type ReportTemplateOverrideInput } from "./report-templates.service";

export const reportTemplatesController = {
  async list({ set }: { set: SetContext }) {
    try {
      return ok(await reportTemplatesService.listOverrides());
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load report templates") };
    }
  },

  async save({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: ReportTemplateOverrideInput;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await reportTemplatesService.saveOverride(params.id, body, currentUser.id));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save report template") };
    }
  },

  async reset({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      return ok(await reportTemplatesService.resetOverride(params.id));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to reset report template") };
    }
  },
};
