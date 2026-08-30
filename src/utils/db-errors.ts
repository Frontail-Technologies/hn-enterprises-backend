const FK_VIOLATION_CODES = new Set(["23503", "23001"]);

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

export class EntityInUseError extends Error {
  readonly code = "ENTITY_IN_USE" as const;

  constructor(message: string) {
    super(message);
    this.name = "EntityInUseError";
  }
}

export function errorCode(error: unknown): string | undefined {
  if (error instanceof EntityInUseError) return error.code;
  return undefined;
}

export function toEntityInUseError(error: unknown, fallbackMessage: string): EntityInUseError {
  if (error instanceof EntityInUseError) return error;
  return new EntityInUseError(fallbackMessage);
}
