import type { PaginationInput, PaginationMeta } from "@types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(value: number | string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function parsePagination(input: PaginationInput = {}, maxLimit: number = MAX_LIMIT) {
  const page = toPositiveInt(input.page, 1);
  
  // Allow passing -1 to get up to maxLimit
  const requestedLimit = input.limit === -1 || input.limit === "-1" ? maxLimit : toPositiveInt(input.limit, DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, maxLimit);
  
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
