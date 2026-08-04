import type { Elysia } from "elysia";
import { NODE_ENV } from "@constants";

function statusFromCode(code: string) {
  if (code === "NOT_FOUND") return 404;
  if (code === "VALIDATION") return 422;
  if (code === "PARSE") return 400;
  return 500;
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

    return {
      success: false,
      message:
        status === 500 ? "Internal server error" : normalizedError.message,
      ...(NODE_ENV !== "production"
        ? { code, stack: normalizedError.stack }
        : {}),
    };
  });
