import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { masterImportController } from "./master-import.controller";

export const masterImportRoutes = new Elysia({ prefix: "/master-import" })
  .use(auth)
  .post(
    "/preview",
    ({ body, currentUser, set }) =>
      masterImportController.preview({ body, currentUser, set }),
    {
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:batchId",
    ({ params, currentUser, set }) =>
      masterImportController.getBatch({ params, currentUser, set }),
    {
      params: t.Object({
        batchId: t.String(),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/:batchId/confirm",
    ({ params, currentUser, set }) =>
      masterImportController.confirm({ params, currentUser, set }),
    {
      params: t.Object({
        batchId: t.String(),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:batchId/rows/:rowId",
    ({ params, body, currentUser, set }) =>
      masterImportController.editRow({ params, body, currentUser, set }),
    {
      params: t.Object({
        batchId: t.String(),
        rowId: t.String(),
      }),
      body: t.Object({
        data: t.Record(t.String(), t.Any()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:batchId/rows/:rowId/remove",
    ({ params, body, currentUser, set }) =>
      masterImportController.setRowRemoved({ params, body, currentUser, set }),
    {
      params: t.Object({
        batchId: t.String(),
        rowId: t.String(),
      }),
      body: t.Object({
        removed: t.Boolean(),
      }),
      requireRole: ["super_admin", "admin"],
    },
  );
