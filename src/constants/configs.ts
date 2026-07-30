import { FRONTEND_URL, NODE_ENV } from "./keys";

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
    maxAge: 7 * 24 * 60 * 60,
  },
};
