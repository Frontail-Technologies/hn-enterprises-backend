import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { plumbersService } from "./plumbers.service";
import type { CreatePlumberBody, PlumberListQuery, UpdatePlumberBody } from "./plumbers.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const plumbersController = {
  async list({ query, set }: { query: PlumberListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await plumbersService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list plumbers") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const plumber = await plumbersService.get(params.id);
      return ok(plumber);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch plumber") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreatePlumberBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const plumber = await plumbersService.create(body, currentUser.id);
      set.status = 201;
      return ok(plumber, "Plumber created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create plumber") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdatePlumberBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const plumber = await plumbersService.update(params.id, body, currentUser.id);
      return ok(plumber, "Plumber updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update plumber") };
    }
  },

  async remove({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await plumbersService.remove(params.id);
      return ok(null, "Plumber deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete plumber") };
    }
  },
};
