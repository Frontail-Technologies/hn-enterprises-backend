export const PORT = Number(process.env.PORT || 3005);
export const HOST = process.env.HOST || "0.0.0.0";
export const DATABASE_URL = process.env.DATABASE_URL;
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "change-me";
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "change-me";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const UPLOAD_DRIVER = process.env.UPLOAD_DRIVER || "local";
export const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

export const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "hn-enterprises";

export const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
export const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
export const AWS_S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;
export const AWS_S3_PUBLIC_URL = process.env.AWS_S3_PUBLIC_URL;
export const AWS_S3_FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE === "true";

export const UPLOAD_OPTIMIZATION_ENABLED = process.env.UPLOAD_OPTIMIZATION_ENABLED !== "false";
export const UPLOAD_IMAGE_MAX_WIDTH = Number(process.env.UPLOAD_IMAGE_MAX_WIDTH || 1600);
export const UPLOAD_IMAGE_MAX_HEIGHT = Number(process.env.UPLOAD_IMAGE_MAX_HEIGHT || 1600);
export const UPLOAD_IMAGE_QUALITY = Number(process.env.UPLOAD_IMAGE_QUALITY || 78);
export const UPLOAD_KEEP_ORIGINAL = process.env.UPLOAD_KEEP_ORIGINAL !== "false";
export const GHOSTSCRIPT_BIN = process.env.GHOSTSCRIPT_BIN;

export const UPLOAD_MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 20);
export const UPLOAD_ALLOWED_MIME_TYPES = (
  process.env.UPLOAD_ALLOWED_MIME_TYPES ||
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Super Admin";
export const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@hnenterprises.com";
export const SEED_ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || "admin";
export const SEED_ADMIN_MOBILE = process.env.SEED_ADMIN_MOBILE;
export const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@123";

export const SEED_SUPERVISOR_NAME = process.env.SEED_SUPERVISOR_NAME || "Amit Rathore";
export const SEED_SUPERVISOR_EMAIL =
  process.env.SEED_SUPERVISOR_EMAIL || "supervisor@hnenterprises.com";
export const SEED_SUPERVISOR_USERNAME = process.env.SEED_SUPERVISOR_USERNAME || "supervisor";
export const SEED_SUPERVISOR_MOBILE = process.env.SEED_SUPERVISOR_MOBILE || "9876543210";
export const SEED_SUPERVISOR_PASSWORD = process.env.SEED_SUPERVISOR_PASSWORD || "Supervisor@123";

export const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "console";
export const EMAIL_FROM = process.env.EMAIL_FROM || "HN Enterprises <no-reply@hnenterprises.com>";
export const RESEND_API_KEY = process.env.RESEND_API_KEY;

export const SMTP_HOST = process.env.SMTP_HOST;
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_SECURE = process.env.SMTP_SECURE === "true";
export const SMTP_USER = process.env.SMTP_USER;
export const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
export const PASSWORD_RESET_OTP_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES || 10);
export const PASSWORD_RESET_OTP_MAX_ATTEMPTS = Number(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || 5);

// Called once at server startup (see src/index.ts) - fails fast on missing
// config instead of letting the app boot into a broken or insecurely
// configured state that only surfaces once the first request hits it.
export function assertRequiredEnv() {
  const problems: string[] = [];

  if (!DATABASE_URL) {
    problems.push("DATABASE_URL is not set");
  }

  const insecurePlaceholders: [string, string][] = [
    ["JWT_ACCESS_SECRET", JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", JWT_REFRESH_SECRET],
  ];
  const placeholders = insecurePlaceholders.filter(([, value]) => value === "change-me").map(([key]) => key);

  if (placeholders.length && NODE_ENV === "production") {
    problems.push(
      `${placeholders.join(", ")} still ${placeholders.length > 1 ? "have" : "has"} the insecure default value "change-me"`,
    );
  } else if (placeholders.length) {
    console.warn(
      `[startup] ${placeholders.join(", ")} ${placeholders.length > 1 ? "are" : "is"} using the insecure default "change-me" - fine for local dev, but must be set before deploying.`,
    );
  }

  if (problems.length) {
    throw new Error(`Refusing to start: ${problems.join("; ")}.`);
  }
}