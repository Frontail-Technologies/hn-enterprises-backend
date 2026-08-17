import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { staffService } from "./staff.service";
import { staffDeletionService } from "./staff-deletion.service";
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

  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await staffService.delete(params.id);
      return ok(null, "Staff account deactivated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to deactivate staff record") };
    }
  },

  // Always canDelete: true (nothing is ever destroyed - see staff-deletion.service.ts).
  // Exists purely so the shared DeleteImpactDialog can show the same "here's what's
  // linked" preview here as everywhere else (§9).
  async deleteImpact({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const impact = await staffDeletionService.getDeleteImpact(params.id);
      return ok(impact);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute delete impact") };
    }
  },

  async bulkDelete({ body, set }: { body: { ids: string[] }; set: SetContext }) {
    try {
      const result = await staffService.bulkDelete(body.ids);
      return ok(result, `${result.count} staff record${result.count === 1 ? "" : "s"} deleted`);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete staff records") };
    }
  },
};
