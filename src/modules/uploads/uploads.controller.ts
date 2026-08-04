import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { ok } from "@utils";

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

// Cloudinary's SDK rejects with plain {message, name, http_code} objects, not
// real Error instances - `error instanceof Error` misses those entirely and
// was masking the real failure reason (e.g. rate limiting) behind a generic
// "Unable to upload file" message.
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
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

      set.status = 400;
      return {
        success: false,
        message: getErrorMessage(error, "Unable to upload file"),
      };
    }
  },
};
