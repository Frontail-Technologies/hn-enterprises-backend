import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { materialsService } from "./materials.service";
import { materialsImportService } from "./materials.import.service";
import type {
  CreateMaterialBody,
  CreateMaterialTransactionBody,
  MaterialListQuery,
  MaterialTransactionListQuery,
  PlumberBalanceQuery,
  UpdateMaterialBody,
} from "./materials.types";

// Attachments arrive embedded in the same multipart request as the
// transaction fields (mobile/web) instead of via a separate /uploads call
// beforehand - avoids leaving an orphaned uploaded file when the user picks
// a photo but never actually saves the transaction.
async function mergeUploadedEvidence(
  existing: Record<string, unknown>[] | undefined,
  files: File[] | undefined,
  uploadedBy: string,
) {
  if (!files?.length) return existing;

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const stored = await uploadService.store(file, { module: "materials", uploadedBy });
      return { id: crypto.randomUUID(), fileName: stored.fileName, fileUrl: stored.url };
    }),
  );

  return [...(existing ?? []), ...uploaded];
}

export const materialsController = {
  async list({ query, set }: { query: MaterialListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await materialsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list materials") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const material = await materialsService.get(params.id);
      return ok(material);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch material") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateMaterialBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const material = await materialsService.create(body, currentUser.id);
      set.status = 201;
      return ok(material, "Material created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create material") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateMaterialBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const material = await materialsService.update(params.id, body, currentUser.id);
      return ok(material, "Material updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update material") };
    }
  },

  async delete({ params, currentUser, set }: { params: { id: string }; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      await materialsService.delete(params.id, currentUser.id);
      return ok(null, "Material deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete material") };
    }
  },

  async listTransactions({ query, set }: { query: MaterialTransactionListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await materialsService.listTransactions(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list material transactions") };
    }
  },

  async createTransaction({
    body,
    currentUser,
    set,
  }: {
    body: CreateMaterialTransactionBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const { files, ...rest } = body;
      const evidence = await mergeUploadedEvidence(rest.evidence, files, currentUser.id);
      const transaction = await materialsService.createTransaction({ ...rest, evidence }, currentUser.id);
      set.status = 201;
      return ok(transaction, "Transaction recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record transaction") };
    }
  },

  async plumberBalances({ query, set }: { query: PlumberBalanceQuery; set: SetContext }) {
    try {
      const rows = await materialsService.plumberBalances(query);
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute plumber balances") };
    }
  },
};

export const materialsImportController = {
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
      return ok(await materialsImportService.preview(file, currentUser));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to preview import") };
    }
  },

  async confirm({
    body,
    currentUser,
    set,
  }: {
    body: { validRows: { name: string; category: string; unit: string; reorderLevel: number }[] };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await materialsImportService.confirm(body.validRows, currentUser), "Import successful");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to confirm import") };
    }
  },
};

function getUploadFile(body: unknown): File {
  const file = body && typeof body === "object" ? (body as Record<string, unknown>).file : null;

  if (!(file instanceof File)) {
    throw new Error("Import file is required");
  }

  return file;
}
