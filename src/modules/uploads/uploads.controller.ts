import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { errorMessage, ok, statusFromError } from "@utils";

function getUploadFile(body: unknown): File {
  const file = body && typeof body === "object" ? (body as Record<string, unknown>).file : null;

  if (!(file instanceof File)) {
    throw new Error("File is required");
  }

  return file;
}

function getModule(body: unknown): string {
  const module = body && typeof body === "object" ? (body as Record<string, unknown>).module : null;
  return typeof module === "string" && module ? module : "general";
}

function getRecordId(body: unknown): string | undefined {
  const recordId = body && typeof body === "object" ? (body as Record<string, unknown>).recordId : null;
  return typeof recordId === "string" && recordId ? recordId : undefined;
}

export const uploadsController = {
  async upload({
    body,
    currentUser,
    set,
  }: {
    body: unknown;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    const module = getModule(body);
    const recordId = getRecordId(body);

    try {
      if (!currentUser) throw new Error("Authentication required");

      const file = getUploadFile(body);
      const stored = await uploadService.store(file, {
        module,
        recordId,
        uploadedBy: currentUser.id,
      });

      console.info("[uploads] stored", {
        fileName: stored.fileName,
        size: stored.size,
        driver: stored.driver,
        module,
        recordId,
        uploadedBy: currentUser.id,
      });

      set.status = 201;
      return ok(stored, "File uploaded");
    } catch (error) {
      console.error("[uploads] failed", {
        module,
        recordId,
        uploadedBy: currentUser?.id,
        error,
      });

      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to upload file"),
      };
    }
  },
};
