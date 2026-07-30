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

function configureCloudinary() {
  if (CLOUDINARY_URL) return;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      "Cloudinary upload driver requires CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET",
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

function uploadBuffer(buffer: Buffer, storageKey: string): Promise<UploadApiResponse> {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
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
    configureCloudinary();
    await Promise.allSettled([
      cloudinary.uploader.destroy(storageKey, { resource_type: "image" }),
      cloudinary.uploader.destroy(storageKey, { resource_type: "raw" }),
      cloudinary.uploader.destroy(storageKey, { resource_type: "video" }),
    ]);
  },
};
