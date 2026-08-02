import { Elysia } from "elysia";
import { auth } from "@plugins";
import { documentsController } from "./documents.controller";
import { documentListQuerySchema } from "./documents.schema";

export const documentsRoutes = new Elysia({ prefix: "/documents" })
  .use(auth)
  .get("/", ({ query, set }) => documentsController.list({ query, set }), {
    query: documentListQuerySchema,
    requireAuth: true,
  });
