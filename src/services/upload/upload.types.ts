export type UploadDriver = "local" | "cloudinary" | "s3";

export type UploadContext = {
  module: string;
  recordId?: string;
  uploadedBy?: string;
};

export type StoredFile = {
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  url: string;
  driver: UploadDriver;
  optimized?: boolean;
  originalStorageKey?: string;
  originalSize?: number;
  optimizedStorageKey?: string;
  optimizedSize?: number;
  metadata?: Record<string, unknown>;
};

export type UploadProvider = {
  store(file: File, context: UploadContext): Promise<StoredFile>;
  remove?(storageKey: string): Promise<void>;
};

export type OptimizedFile = {
  file: File;
  optimized: boolean;
  reason?: string;
  originalSize: number;
  optimizedSize: number;
};

export type UploadOptimizationJob = {
  storedFile: StoredFile;
  originalFile: File;
  context: UploadContext;
  driver: UploadDriver;
};
