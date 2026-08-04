import type { Elysia } from "elysia";
import jwt from "@elysiajs/jwt";
import { JWT_ACCESS_SECRET } from "@constants";
import { getDb } from "@db";
import { users } from "@db/schema";
import { accessTokenFromRequest } from "@modules/auth/auth.helpers";
import type { AuthTokenPayload, UserRole } from "@types";
import { eq } from "drizzle-orm";

function normalizeRoles(roles: UserRole | UserRole[]) {
  return Array.isArray(roles) ? roles : [roles];
}

export const auth = (app: Elysia) =>
  app
    .use(jwt({ name: "jwt", secret: JWT_ACCESS_SECRET }))
    .derive(async ({ jwt: jwtService, cookie, headers }) => {
      const token = accessTokenFromRequest(cookie, headers);
      const rawPayload = token
        ? await jwtService.verify(token).catch(() => false)
        : false;
      const payload =
        rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : null;

      if (
        !payload ||
        typeof payload.id !== "string" ||
        typeof payload.sessionId !== "string"
      ) {
        return {
          currentUser: null,
        };
      }

      const db = getDb();
      const [user] = await db
        .select({
          id: users.id,
          role: users.role,
          status: users.status,
          currentSessionId: users.currentSessionId,
        })
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      return {
        currentUser:
          user?.status === "active" &&
          user.currentSessionId === payload.sessionId
            ? (payload as AuthTokenPayload)
            : null,
      };
    })

    .macro({
      requireAuth(enabled: boolean) {
        if (!enabled) return {};

        return {
          beforeHandle({
            currentUser,
            set,
          }: {
            currentUser: AuthTokenPayload | null;
            set: { status?: number };
          }) {
            if (!currentUser) {
              set.status = 401;
              return {
                success: false,
                message: "Authentication required",
              };
            }
          },
        };
      },

      requireRole(roles: UserRole | UserRole[]) {
        const allowedRoles = normalizeRoles(roles);

        return {
          beforeHandle({
            currentUser,
            set,
          }: {
            currentUser: AuthTokenPayload | null;
            set: { status?: number };
          }) {
            if (!currentUser) {
              set.status = 401;
              return {
                success: false,
                message: "Authentication required",
              };
            }

            if (!allowedRoles.includes(currentUser.role)) {
              set.status = 403;
              return {
                success: false,
                message: "You do not have permission to perform this action",
              };
            }
          },
        };
      },
    } as any);
