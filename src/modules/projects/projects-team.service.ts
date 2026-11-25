import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materialTransactions, plumbers, projectSites, staff, users, workProgressUpdates } from "@db/schema";


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

  // Customers are not permanently owned by one supervisor (R1) - the
  // project's supervisor roster comes from staff.assignedProjectId (the
  // canonical, project-level assignment), not customer.supervisorId.
  const [assignedStaff, totalCustomersRow, lastActivityRows] = await Promise.all([
    db
      .select({ userId: staff.userId })
      .from(staff)
      .innerJoin(users, eq(staff.userId, users.id))
      .where(and(eq(staff.assignedProjectId, projectId), eq(users.role, "supervisor"), eq(users.status, "active"))),
    db
      .select({ value: count() })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), ne(customers.status, "archived"))),
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
  const assignedSupervisorIds = assignedStaff.flatMap((row) => (row.userId ? [row.userId] : []));
  const distinctIds = Array.from(new Set([...siteSupervisorIds, ...assignedSupervisorIds]));
  if (!distinctIds.length) return [];

  const supervisorUsers = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(inArray(users.id, distinctIds), eq(users.status, "active")));

  // Not attributable per-supervisor any more (a customer belongs to the
  // project, not one owner) - this is the project's total for context.
  const projectCustomerCount = totalCustomersRow[0]?.value ?? 0;
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
      avatarUrl: user.avatarUrl,
      role: "Supervisor" as const,
      linked: true,
      sites: sitesBySupervisor.get(user.id) ?? [],
      customerCount: projectCustomerCount,
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

  const plumberRows = await db
    .select({ id: plumbers.id, name: plumbers.name, avatarUrl: plumbers.avatarUrl })
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
      avatarUrl: plumber.avatarUrl,
      role: "Plumber" as const,
      linked: true,
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
      name: sql<string>`coalesce(${users.name}, ${staff.name}, '')`,
      designation: staff.designation,
      status: sql<string>`coalesce(${users.status}::text, ${staff.status}::text)`,
    })
    .from(staff)
    .leftJoin(users, eq(staff.userId, users.id))
    .where(and(eq(staff.assignedProjectId, projectId), sql`coalesce(${users.status}::text, ${staff.status}::text) = 'active'`))
    .orderBy(sql`coalesce(${users.name}, ${staff.name}, '')`);
}

/**
 * People known only by the name typed in a sheet (customer "Plumber" column,
 * site "Supervisor" column) and not linked to a saved plumber/user record.
 * Without these, imported projects showed no plumbers at all.
 */
async function getNameOnlyPlumbers(projectId: string, sites: ProjectSiteRow[]) {
  const db = getDb();
  const rows = await db.execute<{ name: string; customerCount: number; siteIds: string[] | null }>(sql`
    SELECT min(trim(plumber_name)) AS name, count(*)::int AS "customerCount",
           array_remove(array_agg(DISTINCT site_id), NULL)::text[] AS "siteIds"
    FROM customers
    WHERE project_id = ${projectId} AND plumber_id IS NULL AND status != 'archived'
      AND coalesce(trim(plumber_name), '') <> ''
    GROUP BY lower(trim(plumber_name))
  `);
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));
  return rows.map((row) => ({
    id: `name:${row.name.toLowerCase()}`,
    name: row.name,
    avatarUrl: null,
    role: "Plumber" as const,
    linked: false,
    sites: (row.siteIds ?? []).flatMap((id) => (siteNameById.has(id) ? [{ id, name: siteNameById.get(id)! }] : [])),
    customerCount: row.customerCount,
    lastActivityAt: null,
  }));
}

async function getNameOnlySupervisors(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: projectSites.id, name: projectSites.name, supervisorName: projectSites.supervisorName })
    .from(projectSites)
    .where(and(eq(projectSites.projectId, projectId), sql`${projectSites.supervisorId} IS NULL`, sql`coalesce(trim(${projectSites.supervisorName}), '') <> ''`));
  const byName = new Map<string, { name: string; sites: SiteRef[] }>();
  for (const row of rows) {
    const name = (row.supervisorName ?? "").trim();
    const entry = byName.get(name.toLowerCase()) ?? { name, sites: [] };
    entry.sites.push({ id: row.id, name: row.name });
    byName.set(name.toLowerCase(), entry);
  }
  return Array.from(byName.entries()).map(([key, entry]) => ({
    id: `name:${key}`,
    name: entry.name,
    avatarUrl: null,
    role: "Supervisor" as const,
    linked: false,
    sites: entry.sites,
    customerCount: 0,
    lastActivityAt: null,
  }));
}

export const projectsTeamService = {
  async getTeam(projectId: string) {
    const sites = await getProjectSitesRaw(projectId);
    const [supervisors, plumbersList, staffRoster, nameOnlyPlumbers, nameOnlySupervisors] = await Promise.all([
      getSupervisors(projectId, sites),
      getPlumbers(projectId, sites),
      getStaffRoster(projectId),
      getNameOnlyPlumbers(projectId, sites),
      getNameOnlySupervisors(projectId),
    ]);

    return {
      supervisors: [...supervisors, ...nameOnlySupervisors],
      plumbers: [...plumbersList, ...nameOnlyPlumbers].sort((a, b) => b.customerCount - a.customerCount || a.name.localeCompare(b.name)),
      staff: staffRoster,
    };
  },
};
