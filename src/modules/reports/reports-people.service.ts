import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/** People report (filled in by the report work). */
export async function getPeopleReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  void query;
  void currentUser;
  return {};
}
