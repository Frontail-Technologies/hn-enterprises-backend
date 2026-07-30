import { COOKIE_CONFIGS } from "@constants";
import { authService } from "./auth.service";
import {
  accessTokenFromRequest,
  cookieSlot,
  readBearerToken,
  requestMeta,
  signAccessToken,
  type CookieJar,
  type JwtService,
  type SetContext,
} from "./auth.helpers";
import type {
  ChangePasswordBody,
  LoginBody,
  RequestPasswordResetBody,
  ResetPasswordBody,
} from "./auth.schema";

async function requireCurrentUser({
  jwt,
  cookie,
  headers,
}: {
  jwt: JwtService;
  cookie: CookieJar;
  headers: Record<string, string | undefined>;
}) {
  const token = accessTokenFromRequest(cookie, headers);
  const payload = token ? await jwt.verify(token) : false;

  if (!payload || typeof payload.id !== "string") {
    throw new Error("Authentication required");
  }

  if (typeof payload.sessionId !== "string") {
    throw new Error("Session expired. Please login again.");
  }

  return authService.getUserBySession(payload.id, payload.sessionId);
}

export const authController = {
  async login({
    body,
    jwt,
    cookie,
    request,
    set,
  }: {
    body: LoginBody;
    jwt: JwtService;
    cookie: CookieJar;
    request: Request;
    set: SetContext;
  }) {
    try {
      const result = await authService.login(body, requestMeta(request));
      const accessToken = await signAccessToken(jwt, result.payload);
      const refreshToken = await authService.createRefreshToken(
        result.user.id,
        result.payload.sessionId,
        requestMeta(request),
      );

      cookieSlot(cookie, "accessToken").set({
        value: accessToken,
        ...COOKIE_CONFIGS.accessToken,
      });

      cookieSlot(cookie, "refreshToken").set({
        value: refreshToken,
        ...COOKIE_CONFIGS.refreshToken,
      });

      return {
        success: true,
        message: "Logged in successfully",
        data:
          body.clientType === "mobile"
            ? {
                user: result.user,
                accessToken,
                refreshToken,
              }
            : result.user,
      };
    } catch (error) {
      set.status = 401;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Login failed",
      };
    }
  },

  async refresh({
    jwt,
    cookie,
    headers,
    request,
    set,
  }: {
    jwt: JwtService;
    cookie: CookieJar;
    headers: Record<string, string | undefined>;
    request: Request;
    set: SetContext;
  }) {
    try {
      const bearerRefreshToken = readBearerToken(headers);
      const oldRefreshToken = cookie.refreshToken?.value ?? bearerRefreshToken;

      if (typeof oldRefreshToken !== "string") {
        throw new Error("Refresh token is required");
      }

      const result = await authService.rotateRefreshToken(oldRefreshToken, requestMeta(request));
      const accessToken = await signAccessToken(jwt, result.payload);

      cookieSlot(cookie, "accessToken").set({
        value: accessToken,
        ...COOKIE_CONFIGS.accessToken,
      });

      cookieSlot(cookie, "refreshToken").set({
        value: result.refreshToken,
        ...COOKIE_CONFIGS.refreshToken,
      });

      return {
        success: true,
        message: "Token refreshed successfully",
        data: bearerRefreshToken
          ? {
              user: result.user,
              accessToken,
              refreshToken: result.refreshToken,
            }
          : result.user,
      };
    } catch (error) {
      set.status = 401;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Token refresh failed",
      };
    }
  },

  async logout({
    cookie,
    headers,
  }: {
    cookie: CookieJar;
    headers: Record<string, string | undefined>;
  }) {
    const refreshToken = cookie.refreshToken?.value ?? readBearerToken(headers);
    await authService.revokeRefreshToken(typeof refreshToken === "string" ? refreshToken : undefined);

    cookieSlot(cookie, "accessToken").remove();
    cookieSlot(cookie, "refreshToken").remove();

    return {
      success: true,
      message: "Logged out successfully",
    };
  },

  async me({
    jwt,
    cookie,
    headers,
    set,
  }: {
    jwt: JwtService;
    cookie: CookieJar;
    headers: Record<string, string | undefined>;
    set: SetContext;
  }) {
    try {
      const { user } = await requireCurrentUser({ jwt, cookie, headers });
      return {
        success: true,
        data: user,
      };
    } catch (error) {
      set.status = 401;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Authentication required",
      };
    }
  },

  async changePassword({
    body,
    jwt,
    cookie,
    headers,
    set,
  }: {
    body: ChangePasswordBody;
    jwt: JwtService;
    cookie: CookieJar;
    headers: Record<string, string | undefined>;
    set: SetContext;
  }) {
    try {
      const { user } = await requireCurrentUser({ jwt, cookie, headers });
      await authService.changePassword(user.id, body.currentPassword, body.newPassword);
      cookieSlot(cookie, "accessToken").remove();
      cookieSlot(cookie, "refreshToken").remove();

      return {
        success: true,
        message: "Password changed successfully. Please login again.",
      };
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Password change failed",
      };
    }
  },

  async requestPasswordReset({
    body,
    request,
  }: {
    body: RequestPasswordResetBody;
    request: Request;
  }) {
    const result = await authService.requestPasswordReset(body.identifier, requestMeta(request));

    return {
      success: true,
      message: "If an active account exists, password reset instructions will be sent.",
      data: result,
    };
  },

  async resetPassword({
    body,
    set,
  }: {
    body: ResetPasswordBody;
    set: SetContext;
  }) {
    try {
      await authService.resetPassword(body.token, body.newPassword);

      return {
        success: true,
        message: "Password reset successfully",
      };
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Password reset failed",
      };
    }
  },
};
