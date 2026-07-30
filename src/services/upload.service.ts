import { UPLOAD_DRIVER, UPLOAD_KEEP_ORIGINAL, UPLOAD_OPTIMIZATION_ENABLED } from "@constants";
import { backgroundJobService } from "./background-job.service";
import { cloudinaryUploadProvider } from "./upload/cloudinary-upload.provider";
import { fileOptimizerService } from "./upload/file-optimizer.service";
import { localUploadProvider } from "./upload/local-upload.provider";
import { s3UploadProvider } from "./upload/s3-upload.provider";
import { uploadValidatorService } from "./upload/upload-validator.service";
import type { StoredFile, UploadContext, UploadDriver, UploadProvider } from "./upload/upload.types";

const providers: Record<UploadDriver, UploadProvider> = {
  local: localUploadProvider,
  cloudinary: cloudinaryUploadProvider,
  s3: s3UploadProvider,
};

function getUploadDriver(): UploadDriver {
  if (UPLOAD_DRIVER === "cloudinary" || UPLOAD_DRIVER === "s3" || UPLOAD_DRIVER === "local") {
    return UPLOAD_DRIVER;
  }

  throw new Error(`Unsupported UPLOAD_DRIVER "${UPLOAD_DRIVER}". Use local, cloudinary or s3.`);
}

function optimizeInBackground(
  storedFile: StoredFile,
  originalFile: File,
  context: UploadContext,
  driver: UploadDriver,
) {
  backgroundJobService.enqueue(`optimize-upload:${storedFile.storageKey}`, async () => {
    const optimizedFile = await fileOptimizerService.optimize(originalFile);

    if (!optimizedFile.optimized) {
      console.info("[upload:optimization-skipped]", {
        storageKey: storedFile.storageKey,
        reason: optimizedFile.reason,
      });
      return;
    }

    const optimizedStoredFile = await providers[driver].store(optimizedFile.file, {
      ...context,
      recordId: context.recordId ?? storedFile.storageKey,
    });

    if (!UPLOAD_KEEP_ORIGINAL) {
      await providers[driver].remove?.(storedFile.storageKey);
    }

    console.info("[upload:optimized]", {
      originalStorageKey: storedFile.storageKey,
      optimizedStorageKey: optimizedStoredFile.storageKey,
      originalSize: optimizedFile.originalSize,
      optimizedSize: optimizedFile.optimizedSize,
      compressionRatio: Number(
        (optimizedFile.optimizedSize / Math.max(optimizedFile.originalSize, 1)).toFixed(3),
      ),
    });

    // Phase tables will update uploaded-file metadata here once file records exist.
  });
}

export const uploadService = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    uploadValidatorService.validate(file);

    const driver = getUploadDriver();
    const storedFile = await providers[driver].store(file, context);

    if (UPLOAD_OPTIMIZATION_ENABLED && fileOptimizerService.canOptimize(file)) {
      optimizeInBackground(storedFile, file, context, driver);
    }

    return {
      ...storedFile,
      optimized: false,
      originalSize: file.size,
      metadata: {
        ...storedFile.metadata,
        optimizationStatus: fileOptimizerService.canOptimize(file) ? "queued" : "not_applicable",
      },
    };
  },

  async remove(storageKey: string, driver: UploadDriver = getUploadDriver()) {
    await providers[driver].remove?.(storageKey);
  },
};

export type { StoredFile, UploadContext, UploadDriver } from "./upload/upload.types";
