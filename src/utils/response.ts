import type { ApiResponse, PaginationMeta } from "@types";

export function ok<T>(data: T, message?: string, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    success: true,
    ...(message ? { message } : {}),
    data,
    ...(meta ? { meta } : {}),
  };
}

export function paginated<T>(data: T[], pagination: PaginationMeta, message?: string) {
  return ok(data, message, { pagination });
}

export function empty(message = "No records found") {
  return ok([], message);
}
