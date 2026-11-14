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
  // Global: these hooks were local to this plugin, so they never ran for the
  // module routes ("[api:done]" never appeared and no timing was recorded).
  .onAfterHandle({ as: "global" }, ({ request, set }) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    // Server time for this request, shown in the browser's network panel, so
    // slow server work can be told apart from slow network/hosting.
    set.headers["Server-Timing"] = `app;dur=${durationMs}`;
    set.headers["Timing-Allow-Origin"] = "*";
    console.info("[api:done]", {
      method: request.method,
      path: safeUrl(request),
      status: set.status ?? 200,
      durationMs,
    });
  })
  .onError({ as: "global" }, ({ request, set, code }) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    set.headers["Server-Timing"] = `app;dur=${durationMs}`;
    set.headers["Timing-Allow-Origin"] = "*";
    console.error("[api:error]", {
      method: request.method,
      path: safeUrl(request),
      status: set.status ?? 500,
      code,
      durationMs,
    });
  });
