// Postgres SQLSTATE codes for relational-integrity conflicts. "23503" is the
// generic foreign_key_violation (insert/update pointing at a missing row, or an
// immediate-mode delete). RESTRICT-blocked deletes ("update or delete on table X
// violates RESTRICT setting of foreign key constraint...") come back as "23001"
// (restrict_violation) instead - a *different* code that earlier delete methods in
// this codebase (`error.code === "23503"`) never matched, letting the raw driver
// error escape uncaught. Both are the same class of problem from the caller's
// perspective: "this row is still linked to something."
const FK_VIOLATION_CODES = new Set(["23503", "23001"]);

/**
 * True if `error` is a Postgres FK violation, unwrapping Drizzle's
 * `DrizzleQueryError` wrapper first. Drizzle 0.45+ wraps every driver error so
 * that `error.code` on the *caught* error is `undefined` even for a real
 * PostgresError - the real SQLSTATE lives on `error.cause.code`. Checking both
 * keeps this correct regardless of whether a future call site catches the
 * wrapped or unwrapped form.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && FK_VIOLATION_CODES.has(code)) return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && FK_VIOLATION_CODES.has(causeCode)) return true;
  }
  return false;
}

/**
 * A deliberate, safe-to-show domain error for "this record is still linked to
 * something and can't be deleted directly." `errorMessage()`/`statusFromError()`
 * treat this as a known error (message starts with a KNOWN_ERROR_PATTERNS word),
 * and the controller layer reads `.code` to add the `ENTITY_IN_USE` field to the
 * JSON response (§9) - never the raw Postgres/Drizzle error.
 */
export class EntityInUseError extends Error {
  readonly code = "ENTITY_IN_USE" as const;

  constructor(message: string) {
    super(message);
    this.name = "EntityInUseError";
  }
}

/** Returns the app-level error code to surface on the JSON response, if any. */
export function errorCode(error: unknown): string | undefined {
  if (error instanceof EntityInUseError) return error.code;
  return undefined;
}

/**
 * Last-resort safety net for any delete path that doesn't go through a
 * Delete Impact Preview first (race conditions, not-yet-migrated entities): turns
 * an uncaught FK violation into the same safe EntityInUseError instead of letting
 * `DrizzleQueryError`/`PostgresError` internals (SQL text, constraint names, stack
 * traces) reach the client.
 */
export function toEntityInUseError(error: unknown, fallbackMessage: string): EntityInUseError {
  if (error instanceof EntityInUseError) return error;
  return new EntityInUseError(fallbackMessage);
}
