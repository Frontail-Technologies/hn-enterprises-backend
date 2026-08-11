import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materialTransactions, plumbers, projectSites, staff, users, workProgressUpdates } from "@db/schema";

// "Show the people actually working on this project" (§10-14) - every
// person here is derived from a REAL existing relationship (project sites'
// assigned supervisor, a customer's assigned supervisor/plumber, staff's
// assignedProjectId). Nothing is fabricated and no new assignment table is
// introduced - see the Phase 1 spec's explicit "do not create
// project_team_assignments / project_plumber_assignments" instruction.
//
// "Customer assignment is the primary relationship" (§12): workload for
// both supervisors and plumbers is the count of this project's customers
// directly assigned to them (`customers.supervisorId` / `customers.plumberId`),
// not an indirect site-population count - deterministic and matches the
// spec's own pseudocode. Archived customers are excluded so a fully wound
// -down relationship doesn't keep someone on the "currently working" list.

type SiteRef = { id: string; name: string };
type ProjectSiteRow = { id: string; name: string; supervisorId: string | null };

async function getProjectSitesRaw(projectId: string): Promise<ProjectSiteRow[]> {
  const db = getDb();
  return db
    .select({ id: projectSites.id, name: projectSites.name, supervisorId: projectSites.supervisorId })
    .from(projectSites)
    .where(eq(projectSites.projectId, projectId));
}

async function getSupervisors(projectId: string, sites: ProjectSiteRow[]) {
  const db = getDb();

  const [customerAgg, lastActivityRows] = await Promise.all([
    db
      .select({ supervisorId: customers.supervisorId, customerCount: count() })
      .from(customers)
      .where(
        and(eq(customers.projectId, projectId), isNotNull(customers.supervisorId), ne(customers.status, "archived")),
      )
      .groupBy(customers.supervisorId),
    // Real, reliable "last activity" signal for a supervisor on THIS project -
    // their most recent field update against one of this project's customers.
    db
      .select({
        supervisorId: workProgressUpdates.supervisorId,
        lastActivityAt: sql<string>`max(${workProgressUpdates.createdAt})`,
      })
      .from(workProgressUpdates)
      .innerJoin(customers, eq(customers.id, workProgressUpdates.customerId))
      .where(eq(customers.projectId, projectId))
      .groupBy(workProgressUpdates.supervisorId),
  ]);

  const siteSupervisorIds = sites.map((site) => site.supervisorId).filter((id): id is string => Boolean(id));
  const customerSupervisorIds = customerAgg
    .map((row) => row.supervisorId)
    .filter((id): id is string => Boolean(id));
  const distinctIds = Array.from(new Set([...siteSupervisorIds, ...customerSupervisorIds]));
  if (!distinctIds.length) return [];

  // Filtering by status="active" here doubles as the "exclude inactive
  // people" rule (§14) - a deactivated supervisor's user row simply won't
  // resolve a name and is silently dropped from the roster.
  const supervisorUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(inArray(users.id, distinctIds), eq(users.status, "active")));

  const customerCountById = new Map(customerAgg.map((row) => [row.supervisorId as string, row.customerCount]));
  const lastActivityById = new Map(lastActivityRows.map((row) => [row.supervisorId as string, row.lastActivityAt]));
  const sitesBySupervisor = new Map<string, SiteRef[]>();
  for (const site of sites) {
    if (!site.supervisorId) continue;
    const list = sitesBySupervisor.get(site.supervisorId) ?? [];
    list.push({ id: site.id, name: site.name });
    sitesBySupervisor.set(site.supervisorId, list);
  }

  return supervisorUsers
    .map((user) => ({
      id: user.id,
      name: user.name,
      role: "Supervisor" as const,
      sites: sitesBySupervisor.get(user.id) ?? [],
      customerCount: customerCountById.get(user.id) ?? 0,
      lastActivityAt: lastActivityById.get(user.id) ?? null,
    }))
    .sort((a, b) => b.customerCount - a.customerCount || a.name.localeCompare(b.name));
}

async function getPlumbers(projectId: string, sites: ProjectSiteRow[]) {
  const db = getDb();

  const [customerAgg, siteLinkRows, lastActivityRows] = await Promise.all([
    db
      .select({ plumberId: customers.plumberId, customerCount: count() })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), isNotNull(customers.plumberId), ne(customers.status, "archived")))
      .groupBy(customers.plumberId),
    db
      .selectDistinct({ plumberId: customers.plumberId, siteId: customers.siteId })
      .from(customers)
      .where(
        and(
          eq(customers.projectId, projectId),
          isNotNull(customers.plumberId),
          isNotNull(customers.siteId),
          ne(customers.status, "archived"),
        ),
      ),
    // Real "last activity" signal for a plumber on THIS project - their most
    // recent material transaction at one of this project's sites. Optional
    // enrichment only (§12) - a plumber with customers but no material
    // transactions still appears, just without this field.
    db
      .select({
        plumberId: materialTransactions.plumberId,
        lastActivityAt: sql<string>`max(${materialTransactions.transactionDate})`,
      })
      .from(materialTransactions)
      .innerJoin(projectSites, eq(projectSites.id, materialTransactions.siteId))
      .where(and(eq(projectSites.projectId, projectId), isNotNull(materialTransactions.plumberId)))
      .groupBy(materialTransactions.plumberId),
  ]);

  const distinctIds = Array.from(
    new Set(customerAgg.map((row) => row.plumberId).filter((id): id is string => Boolean(id))),
  );
  if (!distinctIds.length) return [];

  // Same "inactive people silently drop off" rule as supervisors, applied to
  // the plumber roster.
  const plumberRows = await db
    .select({ id: plumbers.id, name: plumbers.name })
    .from(plumbers)
    .where(and(inArray(plumbers.id, distinctIds), eq(plumbers.status, "active")));

  const customerCountById = new Map(customerAgg.map((row) => [row.plumberId as string, row.customerCount]));
  const lastActivityById = new Map(lastActivityRows.map((row) => [row.plumberId as string, row.lastActivityAt]));
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));
  const sitesByPlumber = new Map<string, SiteRef[]>();
  for (const row of siteLinkRows) {
    if (!row.plumberId || !row.siteId) continue;
    const siteName = siteNameById.get(row.siteId);
    if (!siteName) continue;
    const list = sitesByPlumber.get(row.plumberId) ?? [];
    list.push({ id: row.siteId, name: siteName });
    sitesByPlumber.set(row.plumberId, list);
  }

  return plumberRows
    .map((plumber) => ({
      id: plumber.id,
      name: plumber.name,
      role: "Plumber" as const,
      sites: sitesByPlumber.get(plumber.id) ?? [],
      customerCount: customerCountById.get(plumber.id) ?? 0,
      lastActivityAt: lastActivityById.get(plumber.id) ?? null,
    }))
    .sort((a, b) => b.customerCount - a.customerCount || a.name.localeCompare(b.name));
}

async function getStaffRoster(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: staff.id,
      name: users.name,
      // No separate "designation" field exists anywhere in the schema - the
      // user's role is the real, closest equivalent (not fabricated).
      designation: users.role,
      status: users.status,
    })
    .from(staff)
    .innerJoin(users, eq(staff.userId, users.id))
    .where(and(eq(staff.assignedProjectId, projectId), eq(users.status, "active")))
    .orderBy(users.name);
}

export const projectsTeamService = {
  async getTeam(projectId: string) {
    const sites = await getProjectSitesRaw(projectId);
    const [supervisors, plumbersList, staffRoster] = await Promise.all([
      getSupervisors(projectId, sites),
      getPlumbers(projectId, sites),
      getStaffRoster(projectId),
    ]);

    return { supervisors, plumbers: plumbersList, staff: staffRoster };
  },
};
