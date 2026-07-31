import { Elysia } from "elysia";
import { auth } from "@plugins";
import { usersController } from "./users.controller";
import { userListQuerySchema } from "./users.schema";

export const usersRoutes = new Elysia({ prefix: "/users" })
  .use(auth)
  .get("/", ({ query, set }) => usersController.list({ query, set }), {
    query: userListQuerySchema,
    requireAuth: true,
  });
