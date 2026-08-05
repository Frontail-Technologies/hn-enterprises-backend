import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { customersController } from "./customers.controller";
import {
  createCustomerBodySchema,
  createCustomerDocumentBodySchema,
  createCustomerNoteBodySchema,
  customerListQuerySchema,
  updateCustomerBodySchema,
  upsertLmcPipeRecordBodySchema,
} from "./customers.schema";

export const customersRoutes = new Elysia({ prefix: "/customers" })
  .use(auth)
  .get("/", ({ query, set }) => customersController.list({ query, set }), {
    query: customerListQuerySchema,
    requireAuth: true,
  })
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
      requireRole: ["super_admin", "admin", "supervisor", "field_executive"],
    },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) => customersController.delete({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
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
