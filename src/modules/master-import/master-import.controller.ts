import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
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
      set.status = error instanceof Error && error.message.includes("permission") ? 403 : 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to preview import",
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
      set.status = error instanceof Error && error.message.includes("not found") ? 404 : 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to fetch import batch",
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
      set.status = error instanceof Error && error.message.includes("not found") ? 404 : 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to confirm import",
      };
    }
  },
};

