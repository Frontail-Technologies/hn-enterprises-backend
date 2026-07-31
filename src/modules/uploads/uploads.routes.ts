import { Elysia } from "elysia";
import { auth } from "@plugins";
import { uploadsController } from "./uploads.controller";

export const uploadsRoutes = new Elysia({ prefix: "/uploads" })
  .use(auth)
  .post(
    "/",
    ({ body, currentUser, set }) => uploadsController.upload({ body, currentUser, set }),
    {
      requireAuth: true,
    },
  );
