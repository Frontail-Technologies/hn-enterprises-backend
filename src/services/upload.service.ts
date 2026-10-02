import { UPLOAD_DRIVER, UPLOAD_KEEP_ORIGINAL, UPLOAD_OPTIMIZATION_ENABLED } from "@constants";
import { cloudinaryUploadProvider } from "./upload/cloudinary-upload.provider";
import { fileOptimizerService } from "./upload/file-optimizer.service";
import { localUploadProvider } from "./upload/local-upload.provider";
import { r2UploadProvider } from "./upload/r2-upload.provider";
import { s3UploadProvider } from "./upload/s3-upload.provider";
import { uploadValidatorService } from "./upload/upload-validator.service";
import type { StoredFile, UploadContext, UploadDriver, UploadProvider } from "./upload/upload.types";

const providers: Record<UploadDriver, UploadProvider> = {
  local: localUploadProvider,
  cloudinary: cloudinaryUploadProvider,
  s3: s3UploadProvider,
  r2: r2UploadProvider,
};

function getUploadDriver(): UploadDriver {
  if (UPLOAD_DRIVER === "cloudinary" || UPLOAD_DRIVER === "s3" || UPLOAD_DRIVER === "r2" || UPLOAD_DRIVER === "local") {
    return UPLOAD_DRIVER;
  }

  throw new Error(`Unsupported UPLOAD_DRIVER "${UPLOAD_DRIVER}". Use local, cloudinary, s3 or r2.`);
}

export const uploadService = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    uploadValidatorService.validate(file);

    const driver = getUploadDriver();
    const canOptimize = UPLOAD_OPTIMIZATION_ENABLED && fileOptimizerService.canOptimize(file);
    // Optimize before the (one and only) store call, rather than uploading the original
    // and optimizing afterward - a prior version stored the optimized file separately in
    // the background with no step that ever pointed the saved record at it, so every
    // upload silently kept serving the original, uncompressed file forever.
    const optimizedResult = canOptimize ? await fileOptimizerService.optimize(file) : null;

    if (optimizedResult && !optimizedResult.optimized) {
      console.info("[upload:optimization-skipped]", { fileName: file.name, reason: optimizedResult.reason });
    }

    const fileToStore = optimizedResult?.optimized ? optimizedResult.file : file;
    const storedFile = await providers[driver].store(fileToStore, context);

    if (optimizedResult?.optimized && UPLOAD_KEEP_ORIGINAL) {
      // Archival copy only - never referenced/served, so its own storage failing shouldn't fail the upload.
      await providers[driver]
        .store(file, { ...context, recordId: context.recordId ?? storedFile.storageKey })
        .catch((error) => console.error("[upload:keep-original-failed]", { storageKey: storedFile.storageKey, error }));
    }

    if (optimizedResult?.optimized) {
      console.info("[upload:optimized]", {
        storageKey: storedFile.storageKey,
        originalSize: optimizedResult.originalSize,
        optimizedSize: optimizedResult.optimizedSize,
        compressionRatio: Number((optimizedResult.optimizedSize / Math.max(optimizedResult.originalSize, 1)).toFixed(3)),
      });
    }

    return {
      ...storedFile,
      optimized: Boolean(optimizedResult?.optimized),
      originalSize: file.size,
      ...(optimizedResult?.optimized ? { optimizedSize: optimizedResult.optimizedSize } : {}),
    };
  },

  async remove(storageKey: string, driver: UploadDriver = getUploadDriver()) {
    await providers[driver].remove?.(storageKey);
  },
};

export type { StoredFile, UploadContext, UploadDriver } from "./upload/upload.types";
