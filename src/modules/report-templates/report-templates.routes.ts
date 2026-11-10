import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { reportTemplatesController } from "./report-templates.controller";

const ADMINS: ["super_admin", "admin"] = ["super_admin", "admin"];

/** Saved admin edits to the built-in report templates (admin panel only). */
export const reportTemplatesRoutes = new Elysia({ prefix: "/report-templates" })
  .use(auth)
  .get("/", ({ set }) => reportTemplatesController.list({ set }), { requireRole: ADMINS })
  .put(
    "/:id",
    ({ params, body, currentUser, set }) => reportTemplatesController.save({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String({ minLength: 1, maxLength: 80 }) }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 200 })),
        category: t.Optional(t.String({ maxLength: 80 })),
        description: t.Optional(t.String({ maxLength: 1000 })),
        fieldLabels: t.Optional(t.Record(t.String({ maxLength: 80 }), t.String({ maxLength: 120 }))),
      }),
      requireRole: ADMINS,
    },
  )
  .delete("/:id", ({ params, set }) => reportTemplatesController.reset({ params, set }), {
    params: t.Object({ id: t.String({ minLength: 1, maxLength: 80 }) }),
    requireRole: ADMINS,
  });
