import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { getBillingReport } from "./reports-billing.service";
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

/** Bills by month and pending by age (charts on the Billing page). */
export const reportsRoutes = new Elysia({ prefix: "/reports" })
  .use(auth)
  .get("/billing", ({ query: q, currentUser, set }) =>
    run(set, "Unable to load the billing report", () => getBillingReport(q as ReportQuery, currentUser as AuthTokenPayload)),
    { query, requireRole: [...ADMINS] });
