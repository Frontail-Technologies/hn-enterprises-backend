import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET, R2_ENDPOINT, R2_PUBLIC_URL, R2_SECRET_ACCESS_KEY } from "@constants";
import { buildStorageKey, fileToBuffer } from "./upload.helpers";
import type { StoredFile, UploadContext, UploadProvider } from "./upload.types";

let r2Client: S3Client | null = null;

function getEndpoint() {
  return R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
}

function assertR2Config() {
  if (!R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !getEndpoint()) {
    throw new Error(
      "R2 upload driver requires R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and either R2_ACCOUNT_ID or R2_ENDPOINT",
    );
  }
}

function getR2Client() {
  assertR2Config();

  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: getEndpoint(),
      // R2 only supports path-style addressing (https://developers.cloudflare.com/r2/api/s3/api/).
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID as string,
        secretAccessKey: R2_SECRET_ACCESS_KEY as string,
      },
    });
  }

  return r2Client;
}

function buildPublicUrl(storageKey: string) {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
  }

  // Without a configured public URL (custom domain or r2.dev), fall back to the
  // S3 API endpoint itself - it won't be publicly browsable, but it keeps the
  // field populated/consistent rather than returning an empty string.
  return `${getEndpoint()?.replace(/\/$/, "")}/${R2_BUCKET}/${storageKey}`;
}

export const r2UploadProvider: UploadProvider = {
  async store(file: File, context: UploadContext): Promise<StoredFile> {
    assertR2Config();
    const storageKey = buildStorageKey(file, context);

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
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
      driver: "r2",
    };
  },

  async remove(storageKey: string) {
    assertR2Config();
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: storageKey,
      }),
    );
  },
};
