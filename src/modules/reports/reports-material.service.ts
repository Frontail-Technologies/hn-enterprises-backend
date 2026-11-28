import type { AuthTokenPayload } from "@types";
import type { ReportQuery } from "./reports.types";

/** Material report (filled in by the report work). */
export async function getMaterialReport(query: ReportQuery, currentUser: AuthTokenPayload) {
  void query;
  void currentUser;
  return {};
}
