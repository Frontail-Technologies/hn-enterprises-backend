import { EntityInUseError } from "./db-errors";

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

/**
 * A message our own code wrote for the user: a plain `new Error("...")` (not
 * a TypeError, database error, etc., which carry a different class or a
 * `cause`/`code`). These are shown as they are instead of a generic fallback.
 */
function isOwnMessage(error: unknown): error is Error {
  if (!(error instanceof Error) || error.constructor !== Error) return false;
  const extra = error as Error & { code?: unknown; query?: unknown };
  return !error.cause && extra.code === undefined && extra.query === undefined && error.message.length > 0 && error.message.length <= 300;
}

export function statusFromError(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error instanceof EntityInUseError) return 409;
  const message = error.message.toLowerCase();
  if (message.includes("authentication required")) return 401;
  if (message.includes("you do not have permission")) return 403;
  if (message.includes("not authorized")) return 403;
  if (message.includes("only admin") || message.includes("only super_admin")) return 403;
  if (message.includes("not found")) return 404;
  if (isKnownDomainError(error.message)) return 400;
  if (isOwnMessage(error)) return 400;
  return 500;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof EntityInUseError) return error.message;

  if (error instanceof Error && isKnownDomainError(error.message)) {
    return error.message;
  }
  if (isOwnMessage(error)) return error.message;

  const rawMessage =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : undefined;
  if (rawMessage && isKnownDomainError(rawMessage)) return rawMessage;

  console.error("[controller] unexpected error", error);
  return fallback;
}
