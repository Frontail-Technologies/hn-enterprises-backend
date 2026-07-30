import { UPLOAD_ALLOWED_MIME_TYPES, UPLOAD_MAX_FILE_SIZE_MB } from "@constants";

const maxFileSizeBytes = UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;

function getMimeType(file: File) {
  return file.type || "application/octet-stream";
}

export const uploadValidatorService = {
  validate(file: File) {
    if (file.size <= 0) {
      throw new Error("Uploaded file is empty");
    }

    if (file.size > maxFileSizeBytes) {
      throw new Error(`File size cannot exceed ${UPLOAD_MAX_FILE_SIZE_MB}MB`);
    }

    const mimeType = getMimeType(file);

    if (!UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`File type "${mimeType}" is not allowed`);
    }
  },
};
