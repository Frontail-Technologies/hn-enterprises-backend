/**
 * Shared derivation of feed `type` / human `title` from raw domain values, so
 * live activityService.record() calls and the one-time backfill produce
 * identical labels. Stable machine `action` keys are built by the callers.
 */

export function humanizeToken(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function workProgressType(stage: string): string {
  return stage === "survey" ? "survey" : "work_progress";
}

export function workProgressTitle(stage: string, status: string): string {
  return `${humanizeToken(stage)} ${humanizeToken(status)}`;
}

export function dprTitle(status: string, isNew: boolean): string {
  if (status === "submitted") return "DPR submitted";
  if (status === "approved") return "DPR approved";
  return isNew ? "DPR created" : "DPR updated";
}

export function dprAction(status: string, isNew: boolean): string {
  if (status === "submitted") return "dpr.submitted";
  if (status === "approved") return "dpr.approved";
  return isNew ? "dpr.created" : "dpr.updated";
}

export function expenseTitle(category: string, status: string): string {
  return `${humanizeToken(category)} ${humanizeToken(status)}`;
}

/** Customer audit action text is already human ("Updated Customer", "Marked Section Complete") - keep it. */
export function customerActivityType(): string {
  return "customer";
}

export function customerActionKey(auditAction: string): string {
  return `customer.${auditAction.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}
