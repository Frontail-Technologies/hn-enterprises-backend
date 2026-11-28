import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { staffService } from "./staff.service";
import type { CreateStaffBody, StaffListQuery, UpdateStaffBody } from "./staff.types";

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
      const record = await staffService.create(body, currentUser.id, currentUser.role);
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
      const record = await staffService.update(params.id, body, currentUser.id, currentUser.role);
      return ok(record, "Staff record updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update staff record") };
    }
  },

  async remove({ params, currentUser, set }: { params: { id: string }; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await staffService.remove(params.id, currentUser.id), "Staff member deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete staff member") };
    }
  },

  async bulkRemove({ body, currentUser, set }: { body: { ids: string[] }; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await staffService.bulkRemove(body.ids, currentUser.id), "Staff deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete staff") };
    }
  },

  // Supervisors: no delete/deleteImpact/bulkDelete here - deleting a staff-linked
  // supervisor goes through the canonical user hard-delete endpoints
  // (usersController.delete/getDeleteImpact/bulkDelete), keyed by
  // staff.userId. See remove-staff-block brief §8.
};
