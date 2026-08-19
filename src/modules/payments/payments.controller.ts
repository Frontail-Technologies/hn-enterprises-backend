import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { paymentsService } from "./payments.service";
import { paymentsImportService } from "./payments.import.service";
import type {
  CreatePaymentBody,
  PaymentFilterColumn,
  PaymentListQuery,
  UpdatePaymentBody,
} from "./payments.types";

async function mergeUploadedEvidence(
  existing: Record<string, unknown>[] | undefined,
  files: File[] | undefined,
  context: { recordId?: string; uploadedBy: string },
) {
  if (!files?.length) return existing;

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const stored = await uploadService.store(file, {
        module: "payments",
        ...context,
      });
      return {
        id: crypto.randomUUID(),
        fileName: stored.fileName,
        fileUrl: stored.url,
      };
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
      return {
        success: false,
        message: errorMessage(error, "Unable to list payments"),
      };
    }
  },

  async summary({ query, set }: { query: PaymentListQuery; set: SetContext }) {
    try {
      return ok(await paymentsService.summary(query));
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to summarize payments"),
      };
    }
  },

  async filterValues({
    query,
    set,
  }: {
    query: { column: PaymentFilterColumn };
    set: SetContext;
  }) {
    try {
      return ok(await paymentsService.filterValues(query.column));
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to list filter values"),
      };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const payment = await paymentsService.get(params.id);
      return ok(payment);
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to fetch payment"),
      };
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
      const evidence = await mergeUploadedEvidence(rest.evidence, files, {
        uploadedBy: currentUser.id,
      });
      const payment = await paymentsService.create(
        { ...rest, evidence },
        currentUser,
      );
      set.status = 201;
      return ok(payment, "Payment recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to record payment"),
      };
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
      const payment = await paymentsService.update(
        params.id,
        { ...rest, evidence },
        currentUser,
      );
      return ok(payment, "Payment updated");
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to update payment"),
      };
    }
  },

  async remove({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await paymentsService.remove(params.id);
      return ok(null, "Payment deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to delete payment"),
      };
    }
  },
};

export const paymentsImportController = {
  async preview({
    body,
    currentUser,
    set,
  }: {
    body: unknown;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const file = getUploadFile(body);
      return ok(await paymentsImportService.preview(file, currentUser));
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to preview import"),
      };
    }
  },

  async confirm({
    body,
    currentUser,
    set,
  }: {
    body: {
      validRows: {
        category: string;
        paidTo: string;
        plumberName: string;
        amount: string;
        paymentDate: string;
        mode: string;
        purpose: string;
        remarks: string;
        address: string;
      }[];
    };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(
        await paymentsImportService.confirm(body.validRows, currentUser),
        "Import successful",
      );
    } catch (error) {
      set.status = statusFromError(error);
      return {
        success: false,
        message: errorMessage(error, "Unable to confirm import"),
      };
    }
  },
};

function getUploadFile(body: unknown): File {
  const file =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).file
      : null;

  if (!(file instanceof File)) {
    throw new Error("Import file is required");
  }

  return file;
}
