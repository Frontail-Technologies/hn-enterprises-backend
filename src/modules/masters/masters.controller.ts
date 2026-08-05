import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { customFieldDefinitionsService, holidaysService, masterValuesService } from "./masters.service";
import type {
  CreateCustomFieldBody,
  CreateHolidayBody,
  CreateMasterValueBody,
  CustomFieldListQuery,
  HolidayListQuery,
  MasterValueListQuery,
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
};
