import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, statusFromError } from "@utils";
import { masterImportService } from "./master-import.service";

function getUploadFile(body: unknown): File {
  const file = body && typeof body === "object" ? (body as Record<string, unknown>).file : null;

  if (!(file instanceof File)) {
    throw new Error("Import file is required");
  }

  return file;
}

export const masterImportController = {
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
      const data = await masterImportService.preview(file, currentUser);

      return {
        success: true,
        message: "Import preview created",
        data,
      };
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to preview import"),
      };
    }
  },

  async getBatch({
    params,
    currentUser,
    set,
  }: {
    params: { batchId: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");

      const data = await masterImportService.getBatch(params.batchId, currentUser);
      return {
        success: true,
        data,
      };
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to fetch import batch"),
      };
    }
  },

  async confirm({
    params,
    currentUser,
    set,
  }: {
    params: { batchId: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");

      const data = await masterImportService.confirm(params.batchId, currentUser);
      return {
        success: true,
        message: "Import confirmed",
        data,
      };
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to confirm import"),
      };
    }
  },

  async editRow({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { batchId: string; rowId: string };
    body: { data: Record<string, unknown> };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");

      const data = await masterImportService.editRow(params.batchId, params.rowId, body.data, currentUser);
      return {
        success: true,
        message: "Row updated",
        data,
      };
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to update row"),
      };
    }
  },

  async setRowRemoved({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { batchId: string; rowId: string };
    body: { removed: boolean };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");

      const data = await masterImportService.setRowRemoved(params.batchId, params.rowId, body.removed, currentUser);
      return {
        success: true,
        message: body.removed ? "Row removed" : "Row restored",
        data,
      };
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to update row"),
      };
    }
  },
};

