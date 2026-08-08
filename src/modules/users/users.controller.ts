import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { assertUser, errorMessage, ok, paginated, statusFromError } from "@utils";
import { usersService } from "./users.service";
import { usersImportService } from "./users.import.service";
import type { CreateUserBody, ResetPasswordBody, UpdateUserBody, UserListQuery } from "./users.types";

export const usersController = {
  async list({ query, set }: { query: UserListQuery; set: SetContext }) {
    try {
      const result = await usersService.list(query);
      if (Array.isArray(result)) return ok(result);
      return paginated(result.rows, result.pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list users") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const user = await usersService.get(params.id);
      return ok(user);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch user") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateUserBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      const actor = assertUser(currentUser);
      const user = await usersService.create(body, actor.role);
      set.status = 201;
      return ok(user, "User created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create user") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateUserBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      const actor = assertUser(currentUser);
      const user = await usersService.update(params.id, body, actor.role);
      return ok(user, "User updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update user") };
    }
  },

  async resetPassword({
    params,
    body,
    set,
  }: {
    params: { id: string };
    body: ResetPasswordBody;
    set: SetContext;
  }) {
    try {
      const user = await usersService.resetPassword(params.id, body);
      return ok(user, "Password reset");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to reset password") };
    }
  },

  async delete({
    params,
    currentUser,
    set,
  }: {
    params: { id: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      const actor = assertUser(currentUser);
      await usersService.delete(params.id, actor.id);
      return ok(null, "User deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete user") };
    }
  },
};

function getUploadFile(body: unknown): File {
  const file = body && typeof body === "object" ? (body as Record<string, unknown>).file : null;

  if (!(file instanceof File)) {
    throw new Error("Import file is required");
  }

  return file;
}

export const usersImportController = {
  async preview({
    body,
    currentUser,
    set,
  }: {
    body: { file: File };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const file = getUploadFile(body);
      return ok(await usersImportService.preview(file, currentUser));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to preview import") };
    }
  },
  async confirm({
    body,
    currentUser,
    set,
  }: {
    body: { validRows: any[] };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(
        await usersImportService.confirm(body.validRows, currentUser),
        "Import successful"
      );
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to confirm import") };
    }
  }
};
