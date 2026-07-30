import type { DateRange } from "@types";

export function cleanObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  ) as Partial<T>;
}

export function toSearchPattern(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? `%${trimmed.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : undefined;
}

export function parseDateRange(from?: string, to?: string): DateRange {
  return {
    ...(from ? { from: new Date(from) } : {}),
    ...(to ? { to: new Date(to) } : {}),
  };
}
