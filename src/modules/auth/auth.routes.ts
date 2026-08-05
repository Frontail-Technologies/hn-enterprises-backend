import { Elysia } from "elysia";
import jwt from "@elysiajs/jwt";
import { JWT_ACCESS_SECRET } from "@constants";
import { authController } from "./auth.controller";
import {
  changePasswordBodySchema,
  loginBodySchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
} from "./auth.schema";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: JWT_ACCESS_SECRET }))
  .post(
    "/login",
    ({ body, jwt, cookie, request, set }) =>
      authController.login({ body, jwt, cookie, request, set }),
    { body: loginBodySchema },
  )
  .post("/refresh", ({ jwt, cookie, headers, request, set }) =>
    authController.refresh({ jwt, cookie, headers, request, set }),
  )
  .post("/logout", ({ cookie, headers }) => authController.logout({ cookie, headers }))
  .get("/me", ({ jwt, cookie, headers, set }) =>
    authController.me({ jwt, cookie, headers, set }),
  )
  .post(
    "/change-password",
    ({ body, jwt, cookie, headers, set }) =>
      authController.changePassword({ body, jwt, cookie, headers, set }),
    { body: changePasswordBodySchema },
  )
  .post(
    "/request-password-reset",
    ({ body, request, set }) => authController.requestPasswordReset({ body, request, set }),
    { body: requestPasswordResetBodySchema },
  )
  .post(
    "/reset-password",
    ({ body, request, set }) => authController.resetPassword({ body, request, set }),
    { body: resetPasswordBodySchema },
  );
