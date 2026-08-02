import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { usersService } from "./users.service";
import type { CreateUserBody, ResetPasswordBody, UpdateUserBody, UserListQuery } from "./users.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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

  async create({ body, set }: { body: CreateUserBody; set: SetContext }) {
    try {
      const user = await usersService.create(body);
      set.status = 201;
      return ok(user, "User created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create user") };
    }
  },

  async update({ params, body, set }: { params: { id: string }; body: UpdateUserBody; set: SetContext }) {
    try {
      const user = await usersService.update(params.id, body);
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
};
