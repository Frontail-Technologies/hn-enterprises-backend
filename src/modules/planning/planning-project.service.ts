import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, projects, projectSites, sitePlans } from "@db/schema";
import { accessibleProjectIds, assertProjectAccess, inProjects } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";

/**
 * Project-wise planning for the mobile app: one row per project (instead of
 * per site) with how many of its customers have a plan / DPR on the date, and
 * the project's customers (each with its site, which a plan still needs).
 */

export type ProjectOverviewRow = {
  projectId: string;
  projectName: string;
  totalCustomers: number;
  completedCustomers: number;
  status: "pending" | "partial" | "done";
};

export type ProjectCustomerRow = {
  id: string;
  trBpNumber: string;
  customerName: string;
  projectId: string;
  siteId: string | null;
  siteName: string | null;
};

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

function status(total: number, completed: number): ProjectOverviewRow["status"] {
  if (total <= 0 || completed <= 0) return "pending";
  return completed >= total ? "done" : "partial";
}

export async function getProjectPlanningOverview(
  date: string,
  mode: "work" | "dpr",
  currentUser: AuthTokenPayload,
): Promise<ProjectOverviewRow[]> {
  const db = getDb();
  const projectIds = await accessibleProjectIds(currentUser);
  if (projectIds && !projectIds.length) return [];

  const totals = await db
    .select({ projectId: customers.projectId, name: projects.name, total: sql<number>`COUNT(DISTINCT ${customers.id})::int` })
    .from(customers)
    .innerJoin(projects, eq(customers.projectId, projects.id))
    .where(and(isNotNull(customers.projectId), inProjects(customers.projectId, projectIds)))
    .groupBy(customers.projectId, projects.name);
  if (!totals.length) return [];

  const table = mode === "work" ? sitePlans : dprRecords;
  // A supervisor's "completed" counts only their own plans / DPRs.
  const scopeId = ADMIN_ROLES.has(currentUser.role) ? undefined : currentUser.id;
  const ids = totals.map((row) => row.projectId as string);
  const done = await db
    .select({ projectId: table.projectId, completed: sql<number>`COUNT(DISTINCT ${table.customerId})::int` })
    .from(table)
    .where(and(eq(table.date, date), inArray(table.projectId, ids), scopeId ? eq(table.supervisorId, scopeId) : undefined))
    .groupBy(table.projectId);
  const doneBy = new Map(done.map((row) => [row.projectId, Number(row.completed)]));

  return totals
    .map((row) => {
      const total = Number(row.total);
      const completed = Math.min(doneBy.get(row.projectId as string) ?? 0, total);
      return {
        projectId: row.projectId as string,
        projectName: row.name,
        totalCustomers: total,
        completedCustomers: completed,
        status: status(total, completed),
      };
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export async function listProjectCustomers(projectId: string, currentUser: AuthTokenPayload): Promise<ProjectCustomerRow[]> {
  await assertProjectAccess(currentUser, projectId);
  const db = getDb();
  const rows = await db
    .select({
      id: customers.id,
      trBpNumber: customers.trBpNumber,
      customerName: customers.customerName,
      projectId: customers.projectId,
      siteId: customers.siteId,
      siteName: projectSites.name,
    })
    .from(customers)
    .leftJoin(projectSites, eq(customers.siteId, projectSites.id))
    .where(eq(customers.projectId, projectId))
    .orderBy(customers.customerName);
  return rows.map((row) => ({ ...row, projectId: row.projectId as string }));
}
