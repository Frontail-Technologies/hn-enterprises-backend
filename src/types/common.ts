export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
};

export type PaginationInput = {
  page?: number | string;
  limit?: number | string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type SortDirection = "asc" | "desc";

export type DateRange = {
  from?: Date;
  to?: Date;
};
