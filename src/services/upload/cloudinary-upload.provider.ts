import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_FOLDER,
  CLOUDINARY_URL,
} from "@constants";
import { buildStorageKey, fileToBuffer, storageKeyWithoutExtension } from "./upload.helpers";
import type { StoredFile, UploadContext, UploadProvider } from "./upload.types";

function parseCloudinaryUrl(url: string) {
  const match = url.trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) return null;

  const [, apiKey, apiSecret, cloudName] = match;
  return { cloudName: cloudName.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim() };
}

// A credential env var that's set but blank/whitespace-only (a trailing
// newline from a copy-paste into a hosting platform's env var UI is the
// classic case) passes a plain truthiness check while still being wrong -
// Cloudinary then rejects the auth and reports it as a missing upload
// preset ("Upload preset must be specified when using unsigned upload"),
// which reads nothing like a credentials problem. Trimming first, then
// checking for actual content, catches that case instead of silently
// forwarding the bad value.
function nonBlank(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// The Cloudinary SDK resolves cloud_name/api_key/api_secret from the
// per-call options object first, falling back to the global
// cloudinary.config() singleton only if absent there (confirmed in the SDK
// source: `consumeOption(options, "api_secret", config().api_secret)`).
// Passing credentials on every call - instead of relying solely on the
// mutable global singleton - avoids any dependency on when/whether that
// singleton was last (re)configured, which was intermittently landing
// uploads on an unconfigured client ("Upload preset must be specified when
// using unsigned upload") for reasons never fully pinned down (Bun --watch
// hot reload timing was the leading suspect, but the failure recurred even
// after full process restarts).
function resolveCloudinaryCredentials() {
  const cloudName = nonBlank(CLOUDINARY_CLOUD_NAME);
  const apiKey = nonBlank(CLOUDINARY_API_KEY);
  const apiSecret = nonBlank(CLOUDINARY_API_SECRET);

  if (cloudName && apiKey && apiSecret) {
    return { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret };
  }

  const cloudinaryUrl = nonBlank(CLOUDINARY_URL);
  const parsed = cloudinaryUrl ? parseCloudinaryUrl(cloudinaryUrl) : null;
  if (parsed?.cloudName && parsed?.apiKey && parsed?.apiSecret) {
    return { cloud_name: parsed.cloudName, api_key: parsed.apiKey, api_secret: parsed.apiSecret };
  }

  throw new Error(
    "Cloudinary upload driver requires CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET " +
      "to be set to non-blank values (check for a stray trailing space/newline if they look set but this still throws)",
  );
}

// Deliberately NOT cloudinary.uploader.upload_stream() - under Bun (this
// backend's runtime), that call silently loses its options/credentials for
// any payload >= 1 MiB (reproduced directly: identical code, credentials,
// and file succeed under plain Node and fail under Bun every time above
// exactly 1,048,576 bytes), surfacing as this same "Upload preset must be
// specified when using unsigned upload" regardless of how correct the
// resolved credentials are. That's a Bun/SDK streaming incompatibility, not
// anything about our config. uploader.upload() with a base64 data URI
// avoids the streaming path entirely and has been verified to work under
// Bun up to 8MB; tested well above this app's own 20MB upload cap.
function uploadBuffer(buffer: Buffer, mimeType: string, storageKey: string): Promise<UploadApiResponse> {
  const credentials = resolveCloudinaryCredentials();
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  return cloudinary.uploader.upload(dataUri, {
    ...credentials,
    folder: CLOUDINARY_FOLDER,
    public_id: storageKeyWithoutExtension(storageKey),
    resource_type: "auto",
    overwrite: true,
  });
}

export const cloudinaryUploadProvider: UploadProvider = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    const storageKey = buildStorageKey(file, context);

    try {
      const mimeType = file.type || "application/octet-stream";
      const result = await uploadBuffer(await fileToBuffer(file), mimeType, storageKey);

      return {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        storageKey: result.public_id,
        url: result.secure_url,
        driver: "cloudinary",
        metadata: {
          assetId: result.asset_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        },
      };
    } catch (error) {
      // Every module (evidence, expenses, announcements, ...) goes through
      // this same store() - if one module fails and others don't despite
      // identical credential resolution, that's surprising enough to be
      // worth a paper trail rather than a guess. Never logs the actual
      // secret, only whether each source was present.
      console.error("[cloudinary-upload] store failed", {
        module: context.module,
        recordId: context.recordId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        hasCloudName: Boolean(CLOUDINARY_CLOUD_NAME?.trim()),
        hasApiKey: Boolean(CLOUDINARY_API_KEY?.trim()),
        hasApiSecret: Boolean(CLOUDINARY_API_SECRET?.trim()),
        hasCloudinaryUrl: Boolean(CLOUDINARY_URL?.trim()),
        error,
      });
      throw error;
    }
  },

  async remove(storageKey: string) {
    const credentials = resolveCloudinaryCredentials();
    await Promise.allSettled([
      cloudinary.uploader.destroy(storageKey, { ...credentials, resource_type: "image" }),
      cloudinary.uploader.destroy(storageKey, { ...credentials, resource_type: "raw" }),
      cloudinary.uploader.destroy(storageKey, { ...credentials, resource_type: "video" }),
    ]);
  },
};
