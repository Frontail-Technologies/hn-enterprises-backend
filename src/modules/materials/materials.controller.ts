import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { accessibleProjectIds, assertProjectAccess } from "@modules/projects/project-access.service";
import { errorCode, errorMessage, ok, paginated, statusFromError } from "@utils";
import { materialsService } from "./materials.service";
import { materialsDeletionService } from "./materials-deletion.service";
import { materialsImportService } from "./materials.import.service";
import type {
  CorrectMaterialTransactionBody,
  CreateMaterialBody,
  CreateMaterialTransactionBody,
  InventoryOverviewQuery,
  MaterialListQuery,
  MaterialTransactionListQuery,
  PlumberBalanceQuery,
  StockBalanceQuery,
  UpdateMaterialBody,
} from "./materials.types";

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

export const inventoryController = {
  async getOverview({ query, currentUser, set }: { query: InventoryOverviewQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const overview = await materialsService.getInventoryOverview(query, await accessibleProjectIds(currentUser));
      return ok(overview);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch inventory overview") };
    }
  },
};

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

  async getOverview({ params, currentUser, set }: { params: { id: string }; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const overview = await materialsService.getOverview(params.id, await accessibleProjectIds(currentUser));
      return ok(overview);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch material overview") };
    }
  },

  async listTransactionsForDetailTab({
    params,
    query,
    currentUser,
    set,
  }: {
    params: { id: string };
    query: MaterialTransactionListQuery & { tab?: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      const { tab, ...rest } = query;
      const { rows, pagination } = await materialsService.listTransactionsForDetailTab(
        params.id,
        tab ?? "transactions",
        rest,
        await accessibleProjectIds(currentUser),
      );
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list material transactions") };
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
      const code = errorCode(error);
      return { success: false, message: errorMessage(error, "Unable to delete material"), ...(code ? { code } : {}) };
    }
  },

  async deleteImpact({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const impact = await materialsDeletionService.getDeleteImpact(params.id);
      return ok(impact);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute delete impact") };
    }
  },

  async listTransactions({
    query,
    currentUser,
    set,
  }: {
    query: Omit<MaterialTransactionListQuery, "types"> & { types?: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      const { types, ...rest } = query;
      const parsedTypes = types
        ? (types.split(",").map((value) => value.trim()) as MaterialTransactionListQuery["types"])
        : undefined;
      const { rows, pagination } = await materialsService.listTransactions(
        { ...rest, types: parsedTypes },
        await accessibleProjectIds(currentUser),
      );
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
      const transaction = await materialsService.createTransaction({ ...rest, evidence }, currentUser.id, currentUser);
      set.status = 201;
      return ok(transaction, "Transaction recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record transaction") };
    }
  },

  async plumberBalances({ query, currentUser, set }: { query: PlumberBalanceQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const rows = await materialsService.plumberBalances(query, await accessibleProjectIds(currentUser));
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute plumber balances") };
    }
  },

  async totalIssueSummary({ query, currentUser, set }: { query: InventoryOverviewQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const rows = await materialsService.totalIssueSummary(query, await accessibleProjectIds(currentUser));
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute total issue summary") };
    }
  },

  async projectUsageSummary({
    query,
    currentUser,
    set,
  }: {
    query: { projectId?: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      await assertProjectAccess(currentUser, query.projectId);
      const rows = await materialsService.projectUsageSummary(query.projectId ?? "");
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute project material usage") };
    }
  },

  async stockBalances({ query, currentUser, set }: { query: StockBalanceQuery; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      const rows = await materialsService.stockBalances(query, await accessibleProjectIds(currentUser));
      return ok(rows);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute stock balances") };
    }
  },

  async reverseTransaction({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: { reason: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const reversal = await materialsService.reverseTransaction(params.id, body.reason, currentUser.id);
      set.status = 201;
      return ok(reversal, "Transaction reversed");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to reverse transaction") };
    }
  },

  async correctTransaction({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CorrectMaterialTransactionBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const result = await materialsService.correctTransaction(params.id, body, currentUser.id);
      set.status = 201;
      return ok(result, "Transaction corrected");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to correct transaction") };
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
    body: { validRows: { rowNumber: number; name: string; category: string; unit: string; reorderLevel: number }[] };
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

  async validateRow({
    body,
    currentUser,
    set,
  }: {
    body: { data: { name: string; category: string; unit: string; reorderLevel: number } };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await materialsImportService.validateRow(body.data, currentUser));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to validate row") };
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
