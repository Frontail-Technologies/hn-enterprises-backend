import type { SetContext } from "@modules/auth/auth.helpers";
import { paginated } from "@utils";
import { documentsService } from "./documents.service";
import type { DocumentListQuery } from "./documents.types";

export const documentsController = {
  async list({ query, set }: { query: DocumentListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await documentsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = 400;
      return { success: false, message: error instanceof Error ? error.message : "Unable to list documents" };
    }
  },
};
