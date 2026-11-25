import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@db";
import { customers, projectMembers, users } from "@db/schema";

/**
 * Project boundary for supervisors (mobile app).
 *
 * A supervisor sees only the projects they are an ACTIVE member of
 * (project_members, removed_at IS NULL) - no membership means nothing - and
 * only the plumbers/labour that are active members of those projects.
 * Admins (and other roles) are not scoped: helpers return `null` = "all".
 *
 * Every helper takes the current user so callers can stay one-liners:
 *   const ids = await accessibleProjectIds(currentUser);
 *   where(and(..., inProjects(customers.projectId, ids)))
 */

type Viewer = { id: string; role: string } | null | undefined;

const CACHE_TTL_MS = 15_000;
const projectCache = new Map<string, { at: number; ids: string[] }>();
const plumberCache = new Map<string, { at: number; ids: string[] }>();

export function isProjectScoped(viewer: Viewer): boolean {
  return viewer?.role === "supervisor";
}

/** Call after adding/removing members so supervisors see the change at once. */
export function forgetProjectAccess() {
  projectCache.clear();
  plumberCache.clear();
}

/** Project ids the viewer may see; `null` = all (not scoped). */
export async function accessibleProjectIds(viewer: Viewer): Promise<string[] | null> {
  if (!isProjectScoped(viewer)) return null;
  const userId = viewer!.id;
  const cached = projectCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.ids;
  const rows = await getDb()
    .selectDistinct({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), isNull(projectMembers.removedAt)));
  const ids = rows.map((row) => row.projectId);
  projectCache.set(userId, { at: Date.now(), ids });
  return ids;
}

/** Plumber/labour ids the viewer may pick or see; `null` = all (not scoped). */
export async function accessiblePlumberIds(viewer: Viewer): Promise<string[] | null> {
  const projectIds = await accessibleProjectIds(viewer);
  if (projectIds === null) return null;
  const userId = viewer!.id;
  const cached = plumberCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.ids;
  const ids = projectIds.length
    ? (
        await getDb()
          .selectDistinct({ plumberId: projectMembers.plumberId })
          .from(projectMembers)
          .where(and(inArray(projectMembers.projectId, projectIds), isNull(projectMembers.removedAt), sql`${projectMembers.plumberId} IS NOT NULL`))
      ).flatMap((row) => (row.plumberId ? [row.plumberId] : []))
    : [];
  plumberCache.set(userId, { at: Date.now(), ids });
  return ids;
}

/**
 * WHERE fragment limiting `column` (a project id column) to the allowed ids.
 * `null` ids = no limit (undefined, so it drops out of and(...)); an empty
 * list matches nothing.
 */
export function inProjects(column: AnyPgColumn | SQL, ids: string[] | null): SQL | undefined {
  if (ids === null) return undefined;
  if (!ids.length) return sql`false`;
  return inArray(column as AnyPgColumn, ids);
}

/** Same as inProjects, for a plumber id column. */
export function inPlumbers(column: AnyPgColumn | SQL, ids: string[] | null): SQL | undefined {
  return inProjects(column, ids);
}

const NO_ACCESS = "You do not have permission to access this project";

export async function canAccessProject(viewer: Viewer, projectId: string | null | undefined): Promise<boolean> {
  const ids = await accessibleProjectIds(viewer);
  if (ids === null) return true;
  return Boolean(projectId) && ids.includes(projectId!);
}

/** Throws a 403 ("you do not have permission...") when a supervisor isn't on the project. */
export async function assertProjectAccess(viewer: Viewer, projectId: string | null | undefined) {
  if (!(await canAccessProject(viewer, projectId))) throw new Error(NO_ACCESS);
}

/** Throws a 403 when the customer belongs to a project the supervisor isn't on. */
export async function assertCustomerAccess(viewer: Viewer, customerId: string) {
  if (!isProjectScoped(viewer)) return;
  const [row] = await getDb().select({ projectId: customers.projectId }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!row) throw new Error("Customer not found");
  await assertProjectAccess(viewer, row.projectId);
}

/** Throws when a supervisor picks a plumber/labourer that isn't on any of their projects. */
export async function assertPlumberAccess(viewer: Viewer, plumberId: string | null | undefined) {
  if (!plumberId) return;
  const ids = await accessiblePlumberIds(viewer);
  if (ids !== null && !ids.includes(plumberId)) {
    throw new Error("You do not have permission to use this plumber - they are not on your project");
  }
}

/**
 * Add people to a project if they aren't active members yet (used when an
 * admin assigns a plumber/supervisor somewhere, so the membership follows).
 */
export async function ensureProjectMembers(
  projectId: string | null | undefined,
  members: { userIds?: (string | null | undefined)[]; plumberIds?: (string | null | undefined)[] },
  actorId?: string | null,
) {
  if (!projectId) return;
  const candidateUserIds = [...new Set((members.userIds ?? []).filter((id): id is string => Boolean(id)))];
  // Only supervisor accounts become project supervisors.
  const userIds = candidateUserIds.length
    ? (await getDb().select({ id: users.id }).from(users).where(and(inArray(users.id, candidateUserIds), eq(users.role, "supervisor")))).map((row) => row.id)
    : [];
  const plumberIds = [...new Set((members.plumberIds ?? []).filter((id): id is string => Boolean(id)))];
  if (!userIds.length && !plumberIds.length) return;
  const db = getDb();
  const rows = [
    ...userIds.map((userId) => ({ projectId, memberType: "supervisor" as const, userId, addedBy: actorId ?? null })),
    ...plumberIds.map((plumberId) => ({ projectId, memberType: "plumber" as const, plumberId, addedBy: actorId ?? null })),
  ];
  // The partial unique indexes skip people who are already active members.
  await db.insert(projectMembers).values(rows).onConflictDoNothing();
  forgetProjectAccess();
}
