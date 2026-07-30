import { Elysia } from "elysia";

const requestStarts = new WeakMap<Request, number>();
const sensitiveQueryKeys = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "authorization",
]);

function safeUrl(request: Request) {
  const url = new URL(request.url);

  for (const key of sensitiveQueryKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }

  return `${url.pathname}${url.search}`;
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export const requestLogger = new Elysia({ name: "request-logger" })
  .onRequest(({ request }) => {
    requestStarts.set(request, Date.now());
    console.info("[api:start]", {
      method: request.method,
      path: safeUrl(request),
      ip: getClientIp(request),
    });
  })
  .onAfterHandle(({ request, set }) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    console.info("[api:done]", {
      method: request.method,
      path: safeUrl(request),
      status: set.status ?? 200,
      durationMs,
    });
  })
  .onError(({ request, set, code }) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    console.error("[api:error]", {
      method: request.method,
      path: safeUrl(request),
      status: set.status ?? 500,
      code,
      durationMs,
    });
  });
