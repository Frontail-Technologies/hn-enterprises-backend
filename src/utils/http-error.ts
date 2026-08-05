// Substrings that mark an error as an intentional, safe-to-show domain
// validation failure (thrown deliberately by our own service code) rather
// than an unexpected failure (DB/driver error, programming bug). Only the
// former's message is ever shown to the client - everything else falls back
// to a generic message and is logged server-side instead, so internal
// details (SQL, constraint names, driver internals) never leak into an API
// response.
const KNOWN_ERROR_PATTERNS = [
  "not found",
  "already exists",
  "already",
  "required",
  "invalid",
  "must be",
  "must have",
  "cannot",
  "authentication required",
  "you do not have permission",
  "not authorized",
  "only admin",
  "only previewed",
  "only super_admin",
];

function isKnownDomainError(message: string) {
  const lower = message.toLowerCase();
  return KNOWN_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function statusFromError(error: unknown) {
  if (!(error instanceof Error)) return 500;
  const message = error.message.toLowerCase();
  if (message.includes("authentication required")) return 401;
  if (message.includes("you do not have permission")) return 403;
  if (message.includes("not authorized")) return 403;
  if (message.includes("only admin") || message.includes("only super_admin")) return 403;
  if (message.includes("not found")) return 404;
  if (isKnownDomainError(error.message)) return 400;
  return 500;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && isKnownDomainError(error.message)) {
    return error.message;
  }

  // Some SDKs (e.g. Cloudinary) reject with plain {message, name, http_code}
  // objects rather than real Error instances - `error instanceof Error`
  // alone misses those.
  const rawMessage =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : undefined;
  if (rawMessage && isKnownDomainError(rawMessage)) return rawMessage;

  console.error("[controller] unexpected error", error);
  return fallback;
}
