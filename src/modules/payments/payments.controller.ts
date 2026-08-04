import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { ok, paginated } from "@utils";
import { paymentsService } from "./payments.service";
import type { CreatePaymentBody, PaymentListQuery, UpdatePaymentBody } from "./payments.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

// Cloudinary's SDK rejects with plain {message, name, http_code} objects, not
// real Error instances - `error instanceof Error` misses those, masking the
// real failure reason (e.g. rate limiting) for embedded-file uploads here.
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

// Attachments arrive embedded in the same multipart request as the payment
// fields (mobile) instead of via a separate /uploads call beforehand - this
// avoids leaving an orphaned uploaded file when the user picks a photo but
// never actually saves the record. `evidence` may already contain
// previously-uploaded entries (kept as-is on update); newly picked files get
// uploaded here and appended.
async function mergeUploadedEvidence(
  existing: Record<string, unknown>[] | undefined,
  files: File[] | undefined,
  context: { recordId?: string; uploadedBy: string },
) {
  if (!files?.length) return existing;

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const stored = await uploadService.store(file, { module: "payments", ...context });
      return { id: crypto.randomUUID(), fileName: stored.fileName, fileUrl: stored.url };
    }),
  );

  return [...(existing ?? []), ...uploaded];
}

export const paymentsController = {
  async list({ query, set }: { query: PaymentListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await paymentsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list payments") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const payment = await paymentsService.get(params.id);
      return ok(payment);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch payment") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreatePaymentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const { files, ...rest } = body;
      const evidence = await mergeUploadedEvidence(rest.evidence, files, { uploadedBy: currentUser.id });
      const payment = await paymentsService.create({ ...rest, evidence }, currentUser.id);
      set.status = 201;
      return ok(payment, "Payment recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record payment") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdatePaymentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const { files, ...rest } = body;
      const evidence = await mergeUploadedEvidence(rest.evidence, files, {
        recordId: params.id,
        uploadedBy: currentUser.id,
      });
      const payment = await paymentsService.update(params.id, { ...rest, evidence }, currentUser);
      return ok(payment, "Payment updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update payment") };
    }
  },

  async remove({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await paymentsService.remove(params.id);
      return ok(null, "Payment deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete payment") };
    }
  },
};
