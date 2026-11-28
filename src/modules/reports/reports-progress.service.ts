import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/** Progress report (filled in by the report work). */
export async function getProgressReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  void query;
  void currentUser;
  return {};
}
