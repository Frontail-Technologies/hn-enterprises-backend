import { Elysia } from "elysia";
import { auth } from "@plugins";
import { auditLogsController } from "./audit-logs.controller";
import { auditLogListQuerySchema } from "./audit-logs.schema";

export const auditLogsRoutes = new Elysia({ prefix: "/audit-logs" })
  .use(auth)
  .get("/", ({ query, set }) => auditLogsController.list({ query, set }), {
    query: auditLogListQuerySchema,
    requireRole: ["super_admin"],
  });
