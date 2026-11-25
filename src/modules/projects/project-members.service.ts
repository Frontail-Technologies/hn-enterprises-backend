import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@db";
import { plumbers, projectMembers, projects, users } from "@db/schema";
import { auditService } from "@services";
import { forgetProjectAccess } from "./project-access.service";

export type ProjectMemberRow = {
  id: string;
  memberType: "supervisor" | "plumber";
  /** "supervisor" | "plumber" | "labour" */
  kind: string;
  personId: string;
  name: string;
  avatarUrl: string | null;
  mobile: string | null;
  addedAt: string;
  addedByName: string | null;
  removedAt: string | null;
  removedByName: string | null;
};

async function getProjectOrThrow(projectId: string) {
  const [project] = await getDb().select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  return project;
}

export const projectMembersService = {
  /** Current members first, then former ones (history), newest change first. */
  async list(projectId: string): Promise<ProjectMemberRow[]> {
    await getProjectOrThrow(projectId);
    const addedBy = alias(users, "added_by_user");
    const removedBy = alias(users, "removed_by_user");
    const rows = await getDb()
      .select({
        id: projectMembers.id,
        memberType: projectMembers.memberType,
        kind: sql<string>`CASE WHEN ${projectMembers.memberType} = 'supervisor' THEN 'supervisor' ELSE coalesce(${plumbers.category}::text, 'plumber') END`,
        personId: sql<string>`coalesce(${projectMembers.userId}, ${projectMembers.plumberId})`,
        name: sql<string>`coalesce(${users.name}, ${plumbers.name}, 'Removed person')`,
        avatarUrl: sql<string | null>`coalesce(${users.avatarUrl}, ${plumbers.avatarUrl})`,
        mobile: sql<string | null>`coalesce(${users.mobile}, ${plumbers.contactNumber})`,
        addedAt: projectMembers.addedAt,
        addedByName: addedBy.name,
        removedAt: projectMembers.removedAt,
        removedByName: removedBy.name,
      })
      .from(projectMembers)
      .leftJoin(users, eq(projectMembers.userId, users.id))
      .leftJoin(plumbers, eq(projectMembers.plumberId, plumbers.id))
      .leftJoin(addedBy, eq(projectMembers.addedBy, addedBy.id))
      .leftJoin(removedBy, eq(projectMembers.removedBy, removedBy.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(sql`${projectMembers.removedAt} IS NOT NULL`, desc(sql`coalesce(${projectMembers.removedAt}, ${projectMembers.addedAt})`));
    return rows.map((row) => ({
      ...row,
      addedAt: new Date(row.addedAt).toISOString(),
      removedAt: row.removedAt ? new Date(row.removedAt).toISOString() : null,
    }));
  },

  /** Add supervisors and/or plumbers/labour; people already on the project are skipped. */
  async add(projectId: string, input: { supervisorIds?: string[]; plumberIds?: string[] }, actorId: string) {
    const project = await getProjectOrThrow(projectId);
    const db = getDb();
    const supervisorIds = [...new Set(input.supervisorIds ?? [])];
    const plumberIds = [...new Set(input.plumberIds ?? [])];

    const validSupervisors = supervisorIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, supervisorIds), eq(users.role, "supervisor")))
      : [];
    if (validSupervisors.length !== supervisorIds.length) throw new Error("Only supervisor accounts can be added as project supervisors");
    const validPlumbers = plumberIds.length ? await db.select({ id: plumbers.id, name: plumbers.name }).from(plumbers).where(inArray(plumbers.id, plumberIds)) : [];
    if (validPlumbers.length !== plumberIds.length) throw new Error("Plumber not found");

    const rows = [
      ...validSupervisors.map((person) => ({ projectId, memberType: "supervisor" as const, userId: person.id, addedBy: actorId })),
      ...validPlumbers.map((person) => ({ projectId, memberType: "plumber" as const, plumberId: person.id, addedBy: actorId })),
    ];
    if (!rows.length) return { added: 0 };
    const inserted = await db.insert(projectMembers).values(rows).onConflictDoNothing().returning({ id: projectMembers.id });
    forgetProjectAccess();

    if (inserted.length) {
      const names = [...validSupervisors, ...validPlumbers].map((person) => person.name).join(", ");
      await auditService.log({
        userId: actorId,
        module: "Projects",
        action: "Added Project Members",
        recordId: projectId,
        projectId,
        description: `Added ${names} to project ${project.name}`,
      });
    }
    return { added: inserted.length };
  },

  /** Take someone off the project. The row stays as history (removed_at). */
  async remove(projectId: string, memberId: string, actorId: string) {
    const project = await getProjectOrThrow(projectId);
    const db = getDb();
    const [member] = await db
      .update(projectMembers)
      .set({ removedAt: new Date(), removedBy: actorId })
      .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId), isNull(projectMembers.removedAt)))
      .returning({ userId: projectMembers.userId, plumberId: projectMembers.plumberId });
    if (!member) throw new Error("Member not found on this project");
    forgetProjectAccess();

    const [person] = member.userId
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, member.userId)).limit(1)
      : await db.select({ name: plumbers.name }).from(plumbers).where(eq(plumbers.id, member.plumberId!)).limit(1);
    await auditService.log({
      userId: actorId,
      module: "Projects",
      action: "Removed Project Member",
      recordId: projectId,
      projectId,
      description: `Removed ${person?.name ?? "a member"} from project ${project.name}`,
    });
    return { id: memberId };
  },
};
