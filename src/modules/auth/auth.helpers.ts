import type { AuthTokenPayload } from "@types";

export type JwtService = {
  sign(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<Record<string, unknown> | false>;
};

export type CookieSlot = {
  value?: unknown;
  set(options: Record<string, unknown>): void;
  remove(): void;
};

export type CookieJar = Record<string, CookieSlot | undefined>;

export type SetContext = {
  status?: number | string;
};

export type RequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function cookieSlot(cookie: CookieJar, name: string) {
  const slot = cookie[name];

  if (!slot) {
    throw new Error(`Missing ${name} cookie slot`);
  }

  return slot;
}

export function requestMeta(request: Request): RequestMeta {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

export function readBearerToken(headers: Record<string, string | undefined>) {
  const authorization = headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

export function accessTokenFromRequest(
  cookie: CookieJar,
  headers: Record<string, string | undefined>,
) {
  const cookieToken = cookie.accessToken?.value;
  return typeof cookieToken === "string" ? cookieToken : readBearerToken(headers);
}

export async function signAccessToken(jwt: JwtService, payload: AuthTokenPayload) {
  return jwt.sign(payload);
}
