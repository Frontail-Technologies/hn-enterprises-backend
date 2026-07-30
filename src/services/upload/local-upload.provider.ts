import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { UPLOAD_DIR } from "@constants";
import { buildStorageKey } from "./upload.helpers";
import type { StoredFile, UploadContext, UploadProvider } from "./upload.types";

export const localUploadProvider: UploadProvider = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    const storageKey = buildStorageKey(file, context);
    const targetPath = path.join(process.cwd(), UPLOAD_DIR, storageKey);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await Bun.write(targetPath, file);

    return {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey,
      url: `/${UPLOAD_DIR}/${storageKey.replaceAll("\\", "/")}`,
      driver: "local",
    };
  },

  async remove(storageKey: string) {
    const targetPath = path.join(process.cwd(), UPLOAD_DIR, storageKey);
    await rm(targetPath, { force: true });
  },
};
