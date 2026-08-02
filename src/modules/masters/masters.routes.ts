import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { customFieldDefinitionsController, holidaysController, masterValuesController } from "./masters.controller";
import {
  createCustomFieldBodySchema,
  createHolidayBodySchema,
  createMasterValueBodySchema,
  customFieldListQuerySchema,
  holidayListQuerySchema,
  masterValueListQuerySchema,
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
  .get(
    "/custom-fields",
    ({ query, set }) => customFieldDefinitionsController.list({ query, set }),
    { query: customFieldListQuerySchema, requireAuth: true },
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
  );
