import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { staffService } from "./staff.service";
import type { CreateStaffBody, StaffListQuery, UpdateStaffBody } from "./staff.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const staffController = {
  async list({ query, set }: { query: StaffListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await staffService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list staff") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const record = await staffService.get(params.id);
      return ok(record);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch staff record") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateStaffBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await staffService.create(body, currentUser.id);
      set.status = 201;
      return ok(record, "Staff record created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create staff record") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateStaffBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await staffService.update(params.id, body, currentUser.id);
      return ok(record, "Staff record updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update staff record") };
    }
  },
};
