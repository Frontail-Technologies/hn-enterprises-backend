import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { customFieldsImportService, type CustomFieldImportRow } from "./custom-fields-import.service";

export const customFieldsImportController = {
  async preview({
    body,
    currentUser,
    set,
  }: {
    body: { file: File };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await customFieldsImportService.preview(body.file, currentUser));
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
    body: { rows: CustomFieldImportRow[] };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await customFieldsImportService.confirm(body.rows, currentUser), "Import complete");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to confirm import") };
    }
  },
};
