import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { customersService } from "./customers.service";
import type {
  CreateCustomerBody,
  CreateCustomerDocumentBody,
  CustomerListQuery,
  UpdateCustomerBody,
  UpsertLmcPipeRecordBody,
} from "./customers.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
      const customer = await customersService.create(body, currentUser.id);
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
      const customer = await customersService.update(params.id, body, currentUser.id);
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
      const record = await customersService.upsertLmcPipeRecord(params.id, body, currentUser.id);
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
      const document = await customersService.createDocument(params.id, body, currentUser.id);
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
};
