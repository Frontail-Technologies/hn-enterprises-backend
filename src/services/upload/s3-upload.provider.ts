import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AWS_ACCESS_KEY_ID,
  AWS_REGION,
  AWS_S3_BUCKET,
  AWS_S3_ENDPOINT,
  AWS_S3_FORCE_PATH_STYLE,
  AWS_S3_PUBLIC_URL,
  AWS_SECRET_ACCESS_KEY,
} from "@constants";
import { buildStorageKey, fileToBuffer } from "./upload.helpers";
import type { StoredFile, UploadContext, UploadProvider } from "./upload.types";

let s3Client: S3Client | null = null;

function assertS3Config() {
  if (!AWS_S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("S3 upload driver requires AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
  }
}

function getS3Client() {
  assertS3Config();

  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      endpoint: AWS_S3_ENDPOINT || undefined,
      forcePathStyle: AWS_S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID as string,
        secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }

  return s3Client;
}

function buildPublicUrl(storageKey: string) {
  if (AWS_S3_PUBLIC_URL) {
    return `${AWS_S3_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
  }

  if (AWS_S3_ENDPOINT) {
    return `${AWS_S3_ENDPOINT.replace(/\/$/, "")}/${AWS_S3_BUCKET}/${storageKey}`;
  }

  return `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${storageKey}`;
}

export const s3UploadProvider: UploadProvider = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    assertS3Config();
    const storageKey = buildStorageKey(file, context);

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: storageKey,
        Body: await fileToBuffer(file),
        ContentType: file.type || "application/octet-stream",
        Metadata: {
          module: context.module,
          recordId: context.recordId ?? "general",
          uploadedBy: context.uploadedBy ?? "system",
        },
      }),
    );

    return {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey,
      url: buildPublicUrl(storageKey),
      driver: "s3",
    };
  },

  async remove(storageKey: string) {
    assertS3Config();
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: storageKey,
      }),
    );
  },
};
