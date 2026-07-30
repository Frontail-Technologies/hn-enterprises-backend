import path from "node:path";
import type { UploadContext } from "./upload.types";

export function sanitizeFileName(fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const safeBaseName = baseName
    .trim()
    .replace(/[^\w.\- ]/g, "_")
    .replace(/\s+/g, "-")
    .toLowerCase();

  return `${safeBaseName || "file"}${extension.toLowerCase()}`;
}

export function buildStorageKey(file: File, context: UploadContext) {
  const safeFileName = sanitizeFileName(file.name || "file");
  return [
    context.module,
    context.recordId ?? "general",
    `${Date.now()}-${safeFileName}`,
  ].join("/");
}

export function storageKeyWithoutExtension(storageKey: string) {
  const extension = path.extname(storageKey);
  return extension ? storageKey.slice(0, -extension.length) : storageKey;
}

export async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}
