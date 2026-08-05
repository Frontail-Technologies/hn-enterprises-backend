import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, paginated, statusFromError } from "@utils";
import { auditLogsService } from "./audit-logs.service";
import type { AuditLogListQuery } from "./audit-logs.types";

export const auditLogsController = {
  async list({ query, set }: { query: AuditLogListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await auditLogsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list audit logs") };
    }
  },
};
