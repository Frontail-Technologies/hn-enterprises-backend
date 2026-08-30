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

function nonBlank(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

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
