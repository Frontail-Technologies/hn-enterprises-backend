import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { getBillingReport } from "./reports-billing.service";
import { getMaterialReport } from "./reports-material.service";
import { getPeopleReport } from "./reports-people.service";
import { getProgressReport } from "./reports-progress.service";
import type { ReportQuery } from "./reports.types";

type SetContext = { status?: number | string };
async function run<T>(set: SetContext, fallback: string, action: () => Promise<T>) {
  try {
    return ok(await action());
  } catch (error) {
    set.status = statusFromError(error);
    return { success: false, message: errorMessage(error, fallback) };
  }
}

const query = t.Object({
  from: t.String({ minLength: 10, maxLength: 10 }),
  to: t.String({ minLength: 10, maxLength: 10 }),
  projectId: t.Optional(t.String()),
});
const ADMINS = ["super_admin", "admin"] as const;

/** HN's own reports for the admin panel (Reports page). */
export const reportsRoutes = new Elysia({ prefix: "/reports" })
  .use(auth)
  .get("/progress", ({ query: q, currentUser, set }) =>
    run(set, "Unable to load the progress report", () => getProgressReport(q as ReportQuery, currentUser as AuthTokenPayload)),
    { query, requireRole: [...ADMINS] })
  .get("/people", ({ query: q, currentUser, set }) =>
    run(set, "Unable to load the plumbers & labour report", () => getPeopleReport(q as ReportQuery, currentUser as AuthTokenPayload)),
    { query, requireRole: [...ADMINS] })
  .get("/material", ({ query: q, currentUser, set }) =>
    run(set, "Unable to load the material report", () => getMaterialReport(q as ReportQuery, currentUser as AuthTokenPayload)),
    { query, requireRole: [...ADMINS] })
  .get("/billing", ({ query: q, currentUser, set }) =>
    run(set, "Unable to load the billing report", () => getBillingReport(q as ReportQuery, currentUser as AuthTokenPayload)),
    { query, requireRole: [...ADMINS] });
