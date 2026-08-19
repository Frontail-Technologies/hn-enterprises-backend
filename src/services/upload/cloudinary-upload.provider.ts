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

function uploadBuffer(buffer: Buffer, storageKey: string): Promise<UploadApiResponse> {
  const credentials = resolveCloudinaryCredentials();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        ...credentials,
        folder: CLOUDINARY_FOLDER,
        public_id: storageKeyWithoutExtension(storageKey),
        resource_type: "auto",
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload did not return a result"));
          return;
        }

        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

export const cloudinaryUploadProvider: UploadProvider = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    const storageKey = buildStorageKey(file, context);
    const result = await uploadBuffer(await fileToBuffer(file), storageKey);

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
