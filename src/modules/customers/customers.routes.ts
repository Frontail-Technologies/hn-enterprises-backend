import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { customersController, customersBulkController } from "./customers.controller";
import {
  createCustomerBodySchema,
  createCustomerDocumentBodySchema,
  createCustomerNoteBodySchema,
  customerListQuerySchema,
  saveCustomerColumnsBodySchema,
  setSectionCompletionBodySchema,
  updateCustomerBodySchema,
  upsertLmcPipeRecordBodySchema,
} from "./customers.schema";
import { bulkDeleteBodySchema, bulkRemarkBodySchema, bulkUpdateBodySchema } from "./customers-bulk.schema";

export const customersRoutes = new Elysia({ prefix: "/customers" })
  .use(auth)
  .get("/", ({ query, set }) => customersController.list({ query, set }), {
    query: customerListQuerySchema,
    requireAuth: true,
  })
  // Static path, registered ahead of `/:id` for clarity (matches the bulk
  // routes' convention below - Elysia already prioritizes static routes).
  .get(
    "/columns",
    ({ currentUser, set }) => customersController.getColumns({ currentUser, set }),
    { requireAuth: true },
  )
  .put(
    "/columns",
    ({ body, currentUser, set }) => customersController.saveColumns({ body, currentUser, set }),
    { body: saveCustomerColumnsBodySchema, requireAuth: true },
  )
  .delete(
    "/columns",
    ({ currentUser, set }) => customersController.resetColumns({ currentUser, set }),
    { requireAuth: true },
  )
  .post(
    "/",
    ({ body, currentUser, set }) => customersController.create({ body, currentUser, set }),
    {
      body: createCustomerBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id",
    ({ params, set }) => customersController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) =>
      customersController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateCustomerBodySchema,
      requireRole: ["super_admin", "admin", "supervisor"],
    },
  )
  .get(
    "/:id/delete-impact",
    ({ params, set }) => customersController.deleteImpact({ params, set }),
    { params: t.Object({ id: t.String() }), requireRole: ["super_admin", "admin"] },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) => customersController.delete({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:id/sections/:sectionKey/completion",
    ({ params, body, currentUser, set }) =>
      customersController.setSectionCompletion({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String(), sectionKey: t.String() }),
      body: setSectionCompletionBodySchema,
      requireRole: ["super_admin", "admin", "supervisor"],
    },
  )
  // Bulk operations (§15) - static paths, registered ahead of any future
  // dynamic collision risk even though Elysia already prioritizes static
  // routes over `/:id`-style params.
  .post(
    "/bulk/update",
    ({ body, currentUser, set }) => customersBulkController.update({ body, currentUser, set }),
    {
      body: bulkUpdateBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .post(
    "/bulk/remark",
    ({ body, currentUser, set }) => customersBulkController.remark({ body, currentUser, set }),
    {
      body: bulkRemarkBodySchema,
      requireRole: ["super_admin", "admin", "supervisor"],
    },
  )
  .post(
    "/bulk/delete",
    ({ body, currentUser, set }) => customersBulkController.remove({ body, currentUser, set }),
    {
      body: bulkDeleteBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/lmc-pipes",
    ({ params, set }) => customersController.listLmcPipeRecords({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .put(
    "/:id/lmc-pipes",
    ({ params, body, currentUser, set }) =>
      customersController.upsertLmcPipeRecord({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: upsertLmcPipeRecordBodySchema,
      requireAuth: true,
    },
  )
  .get(
    "/:id/documents",
    ({ params, set }) => customersController.listDocuments({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/:id/documents",
    ({ params, body, currentUser, set }) =>
      customersController.createDocument({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: createCustomerDocumentBodySchema,
      requireAuth: true,
    },
  )
  .delete(
    "/:id/documents/:documentId",
    ({ params, currentUser, set }) => customersController.deleteDocument({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String(), documentId: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/notes",
    ({ params, set }) => customersController.listNotes({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/:id/notes",
    ({ params, body, currentUser, set }) =>
      customersController.createNote({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: createCustomerNoteBodySchema,
      requireAuth: true,
    },
  );
