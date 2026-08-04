import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { ok, paginated } from "@utils";
import { customersService } from "./customers.service";
import type {
  CreateCustomerBody,
  CreateCustomerDocumentBody,
  CreateCustomerNoteBody,
  CustomerJsonSections,
  CustomerListQuery,
  UpdateCustomerBody,
  UpsertLmcPipeRecordBody,
} from "./customers.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

// Attachments arrive embedded in the same multipart request as the section
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
      const stored = await uploadService.store(file, { module: "customers", ...context });
      return { id: crypto.randomUUID(), fileName: stored.fileName, fileUrl: stored.url };
    }),
  );

  return [...(existing ?? []), ...uploaded];
}

// Each JSON-column section that has its own EvidenceUploader keeps its
// evidence array under this key. Only one section is ever submitted per
// request, so the first one present in the body is the target.
const SECTION_EVIDENCE_FIELD: Partial<Record<keyof CustomerJsonSections, string>> = {
  survey: "evidence",
  giMeasurements: "evidence",
  valvesRegulators: "evidence",
  fittingsAccessories: "evidence",
  lmcPipelineWork: "civilEvidence",
  commissioningConversion: "evidence",
  billingCompletion: "evidence",
};

async function applyUploadedFilesToSection<T extends CustomerJsonSections & { files?: File[] }>(
  body: T,
  uploadedBy: string,
  recordId?: string,
): Promise<Omit<T, "files">> {
  const { files, ...rest } = body;
  if (!files?.length) return rest;

  for (const [key, evidenceField] of Object.entries(SECTION_EVIDENCE_FIELD) as [
    keyof CustomerJsonSections,
    string,
  ][]) {
    const section = rest[key] as Record<string, unknown> | undefined;
    if (section) {
      section[evidenceField] = await mergeUploadedEvidence(
        section[evidenceField] as Record<string, unknown>[] | undefined,
        files,
        { recordId, uploadedBy },
      );
      break;
    }
  }

  return rest;
}

async function resolveDocumentFile(
  body: CreateCustomerDocumentBody,
  context: { recordId?: string; uploadedBy: string },
) {
  const { file, ...rest } = body;
  if (!file) return rest;

  const stored = await uploadService.store(file, { module: "customers", ...context });
  return { ...rest, fileUrl: stored.url, fileName: stored.fileName, mimeType: stored.mimeType };
}

export const customersController = {
  async list({ query, set }: { query: CustomerListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await customersService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list customers") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const customer = await customersService.get(params.id);
      return ok(customer);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch customer") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateCustomerBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const patch = await applyUploadedFilesToSection(body, currentUser.id);
      const customer = await customersService.create(patch, currentUser.id);
      set.status = 201;
      return ok(customer, "Customer created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create customer") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateCustomerBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const patch = await applyUploadedFilesToSection(body, currentUser.id, params.id);
      const customer = await customersService.update(params.id, patch, currentUser.id);
      return ok(customer, "Customer updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update customer") };
    }
  },

  async listLmcPipeRecords({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const records = await customersService.listLmcPipeRecords(params.id);
      return ok(records);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list LMC pipe records") };
    }
  },

  async upsertLmcPipeRecord({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpsertLmcPipeRecordBody;
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
      const record = await customersService.upsertLmcPipeRecord(
        params.id,
        { ...rest, evidence },
        currentUser.id,
      );
      return ok(record, "LMC pipe record saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save LMC pipe record") };
    }
  },

  async listDocuments({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const documents = await customersService.listDocuments(params.id);
      return ok(documents);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list customer documents") };
    }
  },

  async createDocument({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CreateCustomerDocumentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const resolved = await resolveDocumentFile(body, { recordId: params.id, uploadedBy: currentUser.id });
      if (!resolved.fileUrl || !resolved.fileName) throw new Error("A file is required");
      const document = await customersService.createDocument(
        params.id,
        { ...resolved, fileUrl: resolved.fileUrl, fileName: resolved.fileName },
        currentUser.id,
      );
      set.status = 201;
      return ok(document, "Customer document created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create customer document") };
    }
  },

  async deleteDocument({ params, set }: { params: { id: string; documentId: string }; set: SetContext }) {
    try {
      await customersService.deleteDocument(params.id, params.documentId);
      return ok(null, "Customer document deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete customer document") };
    }
  },

  async listNotes({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const notes = await customersService.listNotes(params.id);
      return ok(notes);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list customer notes") };
    }
  },

  async createNote({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CreateCustomerNoteBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const note = await customersService.createNote(params.id, body, currentUser.id);
      set.status = 201;
      return ok(note, "Note added");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to add customer note") };
    }
  },
};
