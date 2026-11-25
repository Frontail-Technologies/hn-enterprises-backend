import type { Elysia } from "elysia";
import { NODE_ENV } from "@constants";

function statusFromCode(code: string) {
  if (code === "NOT_FOUND") return 404;
  if (code === "VALIDATION") return 422;
  if (code === "PARSE") return 400;
  return 500;
}

type SchemaIssue = {
  path?: string;
  value?: unknown;
  message?: string;
  schema?: Record<string, unknown> & { anyOf?: Record<string, unknown>[] };
};

/** "/plumberId" -> "Plumber", "/newUser/email" -> "Email", "/ids/0" -> "Ids". */
function fieldLabel(path = "") {
  const part = path.split("/").filter((segment) => segment && !/^\d+$/.test(segment)).pop() ?? "";
  if (!part) return "A field";
  const words = part
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "A field";
}

/** Plain-language reason for one schema issue. */
function describe(issue: SchemaIssue) {
  const label = fieldLabel(issue.path);
  const schema = issue.schema ?? {};
  // t.Numeric etc. are unions; the number branch carries the limits.
  const limits = { ...schema, ...(schema.anyOf?.find((branch) => branch.type === "number") ?? {}) };
  const value = issue.value;
  const empty = value === undefined || value === null || value === "";

  if (empty) return `${label} is required`;
  if (typeof limits.exclusiveMinimum === "number") return `${label} must be greater than ${limits.exclusiveMinimum}`;
  if (typeof limits.minimum === "number" && Number(value) < limits.minimum) return `${label} must be at least ${limits.minimum}`;
  if (typeof limits.maximum === "number" && Number(value) > limits.maximum) return `${label} must be at most ${limits.maximum}`;
  if (typeof schema.minLength === "number" && typeof value === "string" && value.length < schema.minLength) {
    return schema.minLength <= 1 ? `${label} is required` : `${label} must be at least ${schema.minLength} characters`;
  }
  if (typeof schema.maxLength === "number" && typeof value === "string" && value.length > schema.maxLength) {
    return `${label} is too long (max ${schema.maxLength} characters)`;
  }
  if (typeof schema.maxItems === "number" && Array.isArray(value) && value.length > schema.maxItems) {
    return `Too many ${label.toLowerCase()} selected (max ${schema.maxItems})`;
  }
  if (typeof schema.minItems === "number" && Array.isArray(value) && value.length < schema.minItems) {
    return `Select at least ${schema.minItems} ${label.toLowerCase()}`;
  }
  if (schema.format === "email") return `${label} must be a valid email`;
  if (schema.format === "uuid") return `${label} is not a valid selection`;
  if (schema.format === "date" || schema.format === "date-time") return `${label} must be a valid date`;
  if (schema.type === "number" || limits.type === "number") return `${label} must be a number`;
  return `${label} is invalid`;
}

/**
 * Validation errors from route schemas come back as one readable sentence
 * ("Quantity must be greater than 0") plus a per-field list, instead of the
 * raw schema dump, so forms and toasts can show them as they are.
 */
function validationResponse(error: unknown) {
  const issues = ((error as { all?: SchemaIssue[] }).all ?? []).filter((issue) => issue && typeof issue === "object");
  const seen = new Set<string>();
  const errors = issues
    .map((issue) => ({ field: (issue.path ?? "").replace(/^\//, "").replace(/\//g, "."), message: describe(issue) }))
    .filter((item) => (seen.has(item.field) ? false : (seen.add(item.field), true)));
  return {
    message: errors.length ? errors.map((item) => item.message).slice(0, 3).join(". ") : "Some details are missing or invalid",
    errors,
  };
}

export const errorHandler = (app: Elysia) =>
  app.onError(({ code, error, set }) => {
    const normalizedError =
      error instanceof Error ? error : new Error("Request failed");
    console.error(normalizedError, "error-handler");
    const status =
      typeof set.status === "number"
        ? set.status
        : statusFromCode(String(code));

    set.status = status;

    if (code === "VALIDATION") {
      return { success: false, ...validationResponse(error) };
    }

    return {
      success: false,
      message:
        status === 500 ? "Internal server error" : normalizedError.message,
      ...(NODE_ENV !== "production"
        ? { code, stack: normalizedError.stack }
        : {}),
    };
  });
