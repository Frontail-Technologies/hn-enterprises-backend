import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { customFieldDefinitionsService, holidaysService, masterValuesService } from "./masters.service";
import { masterValuesImportService } from "./masters.import.service";
import type {
  CreateCustomFieldBody,
  CreateHolidayBody,
  CreateMasterValueBody,
  CustomFieldListQuery,
  HolidayListQuery,
  MasterValueListQuery,
  ReorderCustomFieldsBody,
  UpdateCustomFieldBody,
  UpdateHolidayBody,
  UpdateMasterValueBody,
} from "./masters.types";

export const masterValuesController = {
  async list({ query, set }: { query: MasterValueListQuery; set: SetContext }) {
    try {
      return ok(await masterValuesService.list(query));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list master values") };
    }
  },
  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateMasterValueBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await masterValuesService.create(body, currentUser.id), "Master value created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create master value") };
    }
  },
  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateMasterValueBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await masterValuesService.update(params.id, body, currentUser.id), "Master value updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update master value") };
    }
  },
  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await masterValuesService.delete(params.id);
      return ok(null, "Master value deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete master value") };
    }
  },
};

export const customFieldDefinitionsController = {
  async list({ query, set }: { query: CustomFieldListQuery; set: SetContext }) {
    try {
      return ok(await customFieldDefinitionsService.list(query));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list custom fields") };
    }
  },
  async getGroups({ set }: { set: SetContext }) {
    try {
      return ok(await customFieldDefinitionsService.getGroups());
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list groups") };
    }
  },
  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateCustomFieldBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await customFieldDefinitionsService.create(body, currentUser.id), "Custom field created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create custom field") };
    }
  },
  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateCustomFieldBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await customFieldDefinitionsService.update(params.id, body, currentUser.id), "Custom field updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update custom field") };
    }
  },
  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await customFieldDefinitionsService.delete(params.id);
      return ok(null, "Custom field deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete custom field") };
    }
  },
  async reorder({
    body,
    currentUser,
    set,
  }: {
    body: ReorderCustomFieldsBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      await customFieldDefinitionsService.reorder(body, currentUser.id);
      return ok(null, "Custom fields reordered");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to reorder custom fields") };
    }
  },
};

export const holidaysController = {
  async list({ query, set }: { query: HolidayListQuery; set: SetContext }) {
    try {
      return ok(await holidaysService.list(query));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list holidays") };
    }
  },
  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateHolidayBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await holidaysService.create(body, currentUser.id), "Holiday created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create holiday") };
    }
  },
  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateHolidayBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await holidaysService.update(params.id, body, currentUser.id), "Holiday updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update holiday") };
    }
  },
  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await holidaysService.delete(params.id);
      return ok(null, "Holiday deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete holiday") };
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

export const masterValuesImportController = {
  async preview({
    body,
    currentUser,
    set,
  }: {
    body: { file: File; category: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const file = getUploadFile(body);
      const category = body.category as any;
      return ok(await masterValuesImportService.preview(file, category, currentUser));
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
    body: { validRows: { value: string; description: string }[]; category: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(
        await masterValuesImportService.confirm(body.validRows, body.category as any, currentUser),
        "Import successful"
      );
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to confirm import") };
    }
  }
};
