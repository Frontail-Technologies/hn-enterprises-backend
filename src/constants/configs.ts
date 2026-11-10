import { ADMIN_SESSION_DAYS, DEFAULT_SESSION_DAYS, FRONTEND_URL, NODE_ENV } from "./keys";

const isProduction = NODE_ENV === "production";

export const CORS_CONFIGS = {
  origin: FRONTEND_URL ? FRONTEND_URL.split(",").map((item) => item.trim()) : true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

export const COOKIE_CONFIGS = {
  accessToken: {
    httpOnly: true,
    path: "/",
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    secure: isProduction,
    maxAge: 15 * 60,
  },
  refreshToken: {
    httpOnly: true,
    path: "/",
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    secure: isProduction,
    maxAge: DEFAULT_SESSION_DAYS * 24 * 60 * 60,
  },
};

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

/** Sign-in lifetime in days for a role: admins stay signed in longer than other users. */
export function sessionDaysForRole(role: string | null | undefined) {
  return role && ADMIN_ROLES.has(role) ? ADMIN_SESSION_DAYS : DEFAULT_SESSION_DAYS;
}

/** Refresh-token cookie settings for a role (cookie lives as long as the token it holds). */
export function refreshCookieFor(role: string | null | undefined) {
  return { ...COOKIE_CONFIGS.refreshToken, maxAge: sessionDaysForRole(role) * 24 * 60 * 60 };
}
