import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, paginated, statusFromError } from "@utils";
import { documentsService } from "./documents.service";
import type { DocumentListQuery } from "./documents.types";

export const documentsController = {
  async list({ query, set }: { query: DocumentListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await documentsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list documents") };
    }
  },
};
