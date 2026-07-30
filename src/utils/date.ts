import { format, isValid, parseISO } from "date-fns";

export function parseDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

export function toDateOnly(value?: string | Date | null) {
  const date = parseDate(value);
  return date ? format(date, "yyyy-MM-dd") : null;
}
