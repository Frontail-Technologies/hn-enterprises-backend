import { COOKIE_CONFIGS } from "@constants";
import { checkRateLimit } from "@utils";
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

function isRateLimitError(error: unknown) {
  return error instanceof Error && error.message.includes("Too many attempts");
}

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
      const meta = requestMeta(request);
      checkRateLimit(
        `login:${meta.ipAddress ?? "unknown"}:${body.identifier.trim().toLowerCase()}`,
        15 * 60 * 1000,
        10,
      );
      const result = await authService.login(body, meta);
      const accessToken = await signAccessToken(jwt, result.payload);
      const refreshToken = await authService.createRefreshToken(
        result.user.id,
        result.payload.sessionId,
        meta,
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
      set.status = isRateLimitError(error) ? 429 : 401;
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

      let result;
      try {
        result = await authService.rotateRefreshToken(oldRefreshToken, requestMeta(request));
      } catch (error: any) {
        if (error.message === "Token recently rotated") {
          return {
            success: true,
            message: "Token already refreshed",
            data: null,
          };
        }
        throw error;
      }

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
      cookieSlot(cookie, "accessToken").set({ value: "", ...COOKIE_CONFIGS.accessToken, maxAge: 0 });
      cookieSlot(cookie, "refreshToken").set({ value: "", ...COOKIE_CONFIGS.refreshToken, maxAge: 0 });
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

    cookieSlot(cookie, "accessToken").set({ value: "", ...COOKIE_CONFIGS.accessToken, maxAge: 0 });
    cookieSlot(cookie, "refreshToken").set({ value: "", ...COOKIE_CONFIGS.refreshToken, maxAge: 0 });

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
      cookieSlot(cookie, "accessToken").set({ value: "", ...COOKIE_CONFIGS.accessToken, maxAge: 0 });
      cookieSlot(cookie, "refreshToken").set({ value: "", ...COOKIE_CONFIGS.refreshToken, maxAge: 0 });

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
    set,
  }: {
    body: RequestPasswordResetBody;
    request: Request;
    set: SetContext;
  }) {
    const meta = requestMeta(request);

    try {
      checkRateLimit(
        `otp-request:${meta.ipAddress ?? "unknown"}:${body.identifier.trim().toLowerCase()}`,
        15 * 60 * 1000,
        5,
      );
    } catch (error) {
      set.status = 429;
      return { success: false, message: error instanceof Error ? error.message : "Too many attempts" };
    }

    const result = await authService.requestPasswordReset(body.identifier, meta);

    return {
      success: true,
      message: "If an active account exists, password reset instructions will be sent.",
      data: result,
    };
  },

  async resetPassword({
    body,
    request,
    set,
  }: {
    body: ResetPasswordBody;
    request: Request;
    set: SetContext;
  }) {
    try {
      const meta = requestMeta(request);
      checkRateLimit(
        `otp-verify:${meta.ipAddress ?? "unknown"}:${body.identifier.trim().toLowerCase()}`,
        15 * 60 * 1000,
        10,
      );
      await authService.resetPassword(body.identifier, body.otp, body.newPassword);

      return {
        success: true,
        message: "Password reset successfully",
      };
    } catch (error) {
      set.status = isRateLimitError(error) ? 429 : 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Password reset failed",
      };
    }
  },
};
