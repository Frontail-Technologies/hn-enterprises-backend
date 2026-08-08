import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { plumbersService } from "./plumbers.service";
import { plumbersImportService } from "./plumbers.import.service";
import type { CreatePlumberBody, PlumberListQuery, UpdatePlumberBody } from "./plumbers.types";

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

export const plumbersImportController = {
  async preview({
    body,
    currentUser,
    set,
  }: {
    body: unknown;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const file = getUploadFile(body);
      return ok(await plumbersImportService.preview(file, currentUser));
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
    body: { validRows: { name: string; type: string; contactNumber: string; remarks: string }[] };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await plumbersImportService.confirm(body.validRows, currentUser), "Import successful");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to confirm import") };
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
