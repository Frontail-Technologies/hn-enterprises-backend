import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { complaintsService } from "./complaints.service";
import type { ComplaintListQuery, CreateComplaintBody, UpdateComplaintBody } from "./complaints.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  if (error instanceof Error && error.message.includes("Not authorized")) return 403;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const complaintsController = {
  async list({ query, set }: { query: ComplaintListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await complaintsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list complaints") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateComplaintBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const complaint = await complaintsService.create(body, currentUser.id);
      set.status = 201;
      return ok(complaint, "Complaint created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create complaint") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateComplaintBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const complaint = await complaintsService.update(params.id, body, currentUser);
      return ok(complaint, "Complaint updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update complaint") };
    }
  },
};
