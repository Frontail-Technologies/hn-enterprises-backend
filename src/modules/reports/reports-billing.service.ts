import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/** Billing report (filled in by the report work). */
export async function getBillingReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  void query;
  void currentUser;
  return {};
}
