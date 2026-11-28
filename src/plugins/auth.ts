import type { Elysia } from "elysia";
import jwt from "@elysiajs/jwt";
import { JWT_ACCESS_SECRET } from "@constants";
import { getDb } from "@db";
import { users } from "@db/schema";
import { accessTokenFromRequest } from "@modules/auth/auth.helpers";
import { getMaintenance } from "@modules/system/maintenance.service";
import type { AuthTokenPayload, UserRole } from "@types";
import { eq } from "drizzle-orm";

/**
 * Every authenticated request used to look the user up in the database (in
 * Singapore) just to confirm they are still active. Remember the answer for a
 * short time instead; any change to a user clears their entry immediately (see
 * forgetAuthUser), so the TTL only bounds changes made by another server.
 */
const USER_STATUS_TTL_MS = 30_000;
const USER_STATUS_CACHE_MAX = 5_000;
const userStatusCache = new Map<string, { status: string | null; expiresAt: number }>();

/** Drop cached auth status for these users (call after any users-table change). */
export function forgetAuthUser(userIds: string | string[]) {
  for (const id of Array.isArray(userIds) ? userIds : [userIds]) userStatusCache.delete(id);
}

async function getUserStatus(userId: string): Promise<string | null> {
  const now = Date.now();
  const cached = userStatusCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.status;

  const db = getDb();
  const [user] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userStatusCache.size >= USER_STATUS_CACHE_MAX) userStatusCache.clear();
  const status = user?.status ?? null;
  userStatusCache.set(userId, { status, expiresAt: now + USER_STATUS_TTL_MS });
  return status;
}

/** 503 for non-admins while maintenance mode is on (the app shows its maintenance screen). */
async function maintenanceBlock(currentUser: AuthTokenPayload, set: { status?: number }) {
  if (currentUser.role === "super_admin" || currentUser.role === "admin") return;
  const state = await getMaintenance();
  if (!state.enabled) return;
  set.status = 503;
  return { success: false, message: state.message, code: "MAINTENANCE" };
}

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

      const status = await getUserStatus(payload.id);

      return {
        currentUser:
          status === "active"
            ? (payload as AuthTokenPayload)
            : null,
      };
    })

    .macro({
      requireAuth(enabled: boolean) {
        if (!enabled) return {};

        return {
          async beforeHandle({
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
            return maintenanceBlock(currentUser, set);
          },
        };
      },

      requireRole(roles: UserRole | UserRole[]) {
        const allowedRoles = normalizeRoles(roles);

        return {
          async beforeHandle({
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
            return maintenanceBlock(currentUser, set);
          },
        };
      },
      // Elysia's bundled .macro() overloads describe a schema-object shape
      // (expecting body/headers/query/params on the return value), but the
      // object-returning `{ beforeHandle }` shape used above is the one that
      // actually registers the hook at runtime. The two disagree only at the
      // type level, so this cast is a deliberate, narrow escape hatch - not a
      // sign the macro itself is broken.
    } as any);
