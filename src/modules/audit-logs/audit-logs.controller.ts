import type { SetContext } from "@modules/auth/auth.helpers";
import { paginated } from "@utils";
import { auditLogsService } from "./audit-logs.service";
import type { AuditLogListQuery } from "./audit-logs.types";

export const auditLogsController = {
  async list({ query, set }: { query: AuditLogListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await auditLogsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = 400;
      return { success: false, message: error instanceof Error ? error.message : "Unable to list audit logs" };
    }
  },
};
