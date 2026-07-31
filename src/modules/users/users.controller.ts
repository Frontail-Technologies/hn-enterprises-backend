import type { SetContext } from "@modules/auth/auth.helpers";
import { ok } from "@utils";
import { usersService } from "./users.service";
import type { UserListQuery } from "./users.types";

export const usersController = {
  async list({ query, set }: { query: UserListQuery; set: SetContext }) {
    try {
      const rows = await usersService.list(query);
      return ok(rows);
    } catch (error) {
      set.status = 400;
      return { success: false, message: error instanceof Error ? error.message : "Unable to list users" };
    }
  },
};
