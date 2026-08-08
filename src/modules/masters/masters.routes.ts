import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { customFieldsImportController } from "./custom-fields-import.controller";
import { customFieldDefinitionsController, holidaysController, masterValuesController, masterValuesImportController } from "./masters.controller";
import {
  confirmCustomFieldsImportBodySchema,
  createCustomFieldBodySchema,
  createHolidayBodySchema,
  createMasterValueBodySchema,
  customFieldListQuerySchema,
  holidayListQuerySchema,
  masterValueListQuerySchema,
  reorderCustomFieldsBodySchema,
  updateCustomFieldBodySchema,
  updateHolidayBodySchema,
  updateMasterValueBodySchema,
} from "./masters.schema";

export const mastersRoutes = new Elysia({ prefix: "/masters" })
  .use(auth)
  .get("/values", ({ query, set }) => masterValuesController.list({ query, set }), {
    query: masterValueListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/values",
    ({ body, currentUser, set }) => masterValuesController.create({ body, currentUser, set }),
    { body: createMasterValueBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/values/:id",
    ({ params, body, currentUser, set }) => masterValuesController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateMasterValueBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/values/:id",
    ({ params, set }) => masterValuesController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/values/import/preview",
    ({ body, currentUser, set }) => masterValuesImportController.preview({ body: body as any, currentUser, set }),
    {
      body: t.Object({
        file: t.File(),
        category: t.String(),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/values/import/confirm",
    ({ body, currentUser, set }) => masterValuesImportController.confirm({ body: body as any, currentUser, set }),
    {
      body: t.Object({
        category: t.String(),
        validRows: t.Array(
          t.Object({
            value: t.String(),
            description: t.String(),
          }),
        ),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/custom-fields",
    ({ query, set }) => customFieldDefinitionsController.list({ query, set }),
    { query: customFieldListQuerySchema, requireAuth: true },
  )
  .get(
    "/custom-fields/groups",
    ({ set }) => customFieldDefinitionsController.getGroups({ set }),
    { requireAuth: true },
  )
  .post(
    "/custom-fields",
    ({ body, currentUser, set }) => customFieldDefinitionsController.create({ body, currentUser, set }),
    { body: createCustomFieldBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/custom-fields/:id",
    ({ params, body, currentUser, set }) =>
      customFieldDefinitionsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateCustomFieldBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/custom-fields/:id",
    ({ params, set }) => customFieldDefinitionsController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/custom-fields/reorder",
    ({ body, currentUser, set }) => customFieldDefinitionsController.reorder({ body, currentUser, set }),
    { body: reorderCustomFieldsBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/custom-fields/import/preview",
    ({ body, currentUser, set }) => customFieldsImportController.preview({ body, currentUser, set }),
    { body: t.Object({ file: t.File() }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/custom-fields/import/confirm",
    ({ body, currentUser, set }) => customFieldsImportController.confirm({ body, currentUser, set }),
    { body: confirmCustomFieldsImportBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .get("/holidays", ({ query, set }) => holidaysController.list({ query, set }), {
    query: holidayListQuerySchema,
    requireAuth: true,
  })
  .post(
    "/holidays",
    ({ body, currentUser, set }) => holidaysController.create({ body, currentUser, set }),
    { body: createHolidayBodySchema, requireRole: ["super_admin", "admin"] },
  )
  .patch(
    "/holidays/:id",
    ({ params, body, currentUser, set }) => holidaysController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateHolidayBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/holidays/:id",
    ({ params, set }) => holidaysController.delete({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  );
