import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "@db";
import { projectDprs, projectPlans, projects, users, type ProjectDprManpower, type ProjectDprTask, type ProjectPlanTask } from "@db/schema";
import { accessibleProjectIds, assertProjectAccess, inProjects } from "@modules/projects/project-access.service";
import { auditService, notificationService } from "@services";
import type { AuthTokenPayload } from "@types";

/**
 * Project-wise planning: each supervisor files one plan (morning) and one DPR
 * (evening) per project per day, with a quantity per task. Plans are reviewed
 * by an admin (approve, or send back with a reason); an approved plan is final
 * for the supervisor. DPRs are reported against the plan.
 */

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

/** For a project_plans row: its supervisor has not submitted that project / day's DPR yet. */
export const DPR_MISSING_FOR_PLAN = sql`NOT EXISTS (
  SELECT 1 FROM project_dprs d
  WHERE d.project_id = ${projectPlans.projectId}
    AND d.date = ${projectPlans.date}
    AND d.supervisor_id IS NOT DISTINCT FROM ${projectPlans.supervisorId}
    AND d.status <> 'draft'
)`;
const isAdmin = (user: AuthTokenPayload) => ADMIN_ROLES.has(user.role);

export type ProjectPlanningListQuery = {
  projectId?: string;
  supervisorId?: string;
  date?: string;
  from?: string;
  to?: string;
  status?: string;
};

type EvidenceFile = { id: string; fileName: string; fileUrl: string; mimeType?: string; capturedAt?: string };

const clean = (value: string | undefined) => (value ?? "").trim();
const cleanManpower = (rows: ProjectDprManpower[]) =>
  rows
    .map((row) => ({ ...(row.plumberId ? { plumberId: row.plumberId } : {}), name: clean(row.name), ...(row.category ? { category: row.category } : {}) }))
    .filter((row) => row.name);
/** Workers on a task: cleaned, without repeats (same person once). */
const cleanWorkers = (rows: ProjectDprManpower[] | undefined) => {
  const seen = new Set<string>();
  return cleanManpower(rows ?? []).filter((row) => {
    const key = row.plumberId ?? row.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const cleanPlanTasks = (tasks: ProjectPlanTask[]) =>
  tasks
    .map((task) => {
      const workers = cleanWorkers(task.workers);
      return { id: task.id, qty: clean(task.qty), ...(workers.length ? { workers } : {}) };
    })
    .filter((task) => task.qty || task.workers?.length);
const cleanDprTasks = (tasks: ProjectDprTask[]) =>
  tasks
    .map((task) => {
      const workers = cleanWorkers(task.workers);
      return {
        id: task.id,
        plannedQty: clean(task.plannedQty),
        doneQty: clean(task.doneQty),
        delayReason: clean(task.delayReason),
        ...(workers.length ? { workers } : {}),
      };
    })
    .filter((task) => task.plannedQty || task.doneQty || task.delayReason || task.workers?.length);

async function supervisorName(userId: string) {
  const [row] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? null;
}

/** Shared filters; supervisors are limited to their projects and their own entries. */
async function listConditions(
  table: typeof projectPlans | typeof projectDprs,
  query: ProjectPlanningListQuery,
  currentUser: AuthTokenPayload,
) {
  const projectIds = await accessibleProjectIds(currentUser);
  const conditions: (SQL | undefined)[] = [
    inProjects(table.projectId, projectIds),
    isAdmin(currentUser) ? undefined : eq(table.supervisorId, currentUser.id),
    query.projectId ? eq(table.projectId, query.projectId) : undefined,
    query.supervisorId ? eq(table.supervisorId, query.supervisorId) : undefined,
    query.date ? eq(table.date, query.date) : undefined,
    query.from ? gte(table.date, query.from) : undefined,
    query.to ? lte(table.date, query.to) : undefined,
  ];
  return conditions.filter((condition): condition is SQL => Boolean(condition));
}

// ---------- Plans ----------

export async function listProjectPlans(query: ProjectPlanningListQuery, currentUser: AuthTokenPayload) {
  const conditions = await listConditions(projectPlans, query, currentUser);
  if (query.status && ["submitted", "approved", "sent_back"].includes(query.status)) {
    conditions.push(eq(projectPlans.status, query.status as "submitted" | "approved" | "sent_back"));
  }
  const rows = await getDb()
    .select({
      id: projectPlans.id,
      projectId: projectPlans.projectId,
      projectName: projects.name,
      supervisorId: projectPlans.supervisorId,
      supervisorName: sql<string | null>`coalesce(${users.name}, ${projectPlans.supervisorName})`,
      date: projectPlans.date,
      tasks: projectPlans.tasks,
      remarks: projectPlans.remarks,
      status: projectPlans.status,
      reviewNote: projectPlans.reviewNote,
      reviewedAt: projectPlans.reviewedAt,
      reviewedByName: sql<string | null>`(SELECT u.name FROM users u WHERE u.id = ${projectPlans.reviewedBy})`,
      updatedAt: projectPlans.updatedAt,
    })
    .from(projectPlans)
    .leftJoin(projects, eq(projectPlans.projectId, projects.id))
    .leftJoin(users, eq(projectPlans.supervisorId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projectPlans.date), projects.name);
  return rows;
}

/** The supervisor's plan for a project and day: saving again re-submits it (an approved plan is locked). */
export async function upsertProjectPlan(
  input: { projectId: string; date: string; tasks: ProjectPlanTask[]; remarks?: string },
  currentUser: AuthTokenPayload,
) {
  await assertProjectAccess(currentUser, input.projectId);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(projectPlans)
    .where(and(eq(projectPlans.projectId, input.projectId), eq(projectPlans.date, input.date), eq(projectPlans.supervisorId, currentUser.id)))
    .limit(1);
  if (existing?.status === "approved" && !isAdmin(currentUser)) {
    throw new Error("You do not have permission to change a plan that is already approved");
  }
  const values = {
    tasks: cleanPlanTasks(input.tasks),
    remarks: input.remarks?.trim() || null,
    status: "submitted" as const,
    reviewNote: null,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(projectPlans).set(values).where(eq(projectPlans.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(projectPlans)
    .values({ ...values, projectId: input.projectId, date: input.date, supervisorId: currentUser.id, supervisorName: await supervisorName(currentUser.id) })
    .returning();
  return row;
}

export async function reviewProjectPlans(ids: string[], action: "approve" | "reject", note: string | undefined, actorId: string) {
  const reason = note?.trim() ?? "";
  if (action === "reject" && !reason) throw new Error("A reason is required to send a plan back");
  const db = getDb();
  const updated = await db
    .update(projectPlans)
    .set(
      action === "approve"
        ? { status: "approved", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: null, updatedAt: new Date() }
        : { status: "sent_back", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: reason, updatedAt: new Date() },
    )
    .where(and(inArray(projectPlans.id, [...new Set(ids)]), eq(projectPlans.status, "submitted")))
    .returning({ id: projectPlans.id, projectId: projectPlans.projectId, supervisorId: projectPlans.supervisorId, date: projectPlans.date });

  if (updated.length) {
    await auditService.log({
      userId: actorId,
      module: "Planning",
      action: action === "approve" ? "Approved Plan" : "Sent Back Plan",
      recordId: updated.length === 1 ? updated[0].id : undefined,
      projectId: updated.length === 1 ? updated[0].projectId : undefined,
      description: `${action === "approve" ? "Approved" : "Sent back"} ${updated.length} plan${updated.length === 1 ? "" : "s"}${reason ? `: ${reason}` : ""}`,
    });
  }
  if (action === "reject") {
    const projectRows = updated.length
      ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, updated.map((row) => row.projectId)))
      : [];
    const nameById = new Map(projectRows.map((row) => [row.id, row.name]));
    for (const row of updated) {
      if (!row.supervisorId) continue;
      await notificationService
        .queue({
          userIds: [row.supervisorId],
          title: "Plan sent back",
          message: `${nameById.get(row.projectId) ?? "Project"} (${row.date}): ${reason}`,
          category: "work",
          sourceType: "project_plan",
          sourceId: row.id,
          route: { pathname: "/planning/plan", params: { projectId: row.projectId, projectName: nameById.get(row.projectId) ?? "", date: row.date } },
        })
        .catch((error: unknown) => console.error("[project-plan] notify failed", error));
    }
  }
  return { updated: updated.length, skipped: ids.length - updated.length };
}

export async function updateProjectPlanByAdmin(id: string, input: { tasks?: ProjectPlanTask[]; remarks?: string }, actorId: string) {
  const [row] = await getDb()
    .update(projectPlans)
    .set({
      ...(input.tasks ? { tasks: cleanPlanTasks(input.tasks) } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projectPlans.id, id))
    .returning();
  if (!row) throw new Error("Plan not found");
  await auditService.log({ userId: actorId, module: "Planning", action: "Edited Plan", recordId: id, projectId: row.projectId, description: `Edited plan of ${row.date}` });
  return row;
}

// ---------- DPRs ----------

export async function listProjectDprs(query: ProjectPlanningListQuery, currentUser: AuthTokenPayload) {
  const conditions = await listConditions(projectDprs, query, currentUser);
  return getDb()
    .select({
      id: projectDprs.id,
      projectId: projectDprs.projectId,
      projectName: projects.name,
      supervisorId: projectDprs.supervisorId,
      supervisorName: sql<string | null>`coalesce(${users.name}, ${projectDprs.supervisorName})`,
      date: projectDprs.date,
      tasks: projectDprs.tasks,
      manpower: projectDprs.manpower,
      remarks: projectDprs.remarks,
      evidence: projectDprs.evidence,
      status: projectDprs.status,
      submittedAt: projectDprs.submittedAt,
      updatedAt: projectDprs.updatedAt,
    })
    .from(projectDprs)
    .leftJoin(projects, eq(projectDprs.projectId, projects.id))
    .leftJoin(users, eq(projectDprs.supervisorId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projectDprs.date), projects.name);
}

export async function upsertProjectDpr(
  input: {
    projectId: string;
    date: string;
    tasks: ProjectDprTask[];
    manpower?: ProjectDprManpower[];
    remarks?: string;
    evidence?: EvidenceFile[];
    status?: "draft" | "submitted";
  },
  currentUser: AuthTokenPayload,
) {
  await assertProjectAccess(currentUser, input.projectId);
  const db = getDb();
  // A DPR reports against an approved plan: the supervisor's plan for this
  // project and day must be approved first (admins can still file / fix one).
  if (!isAdmin(currentUser)) {
    const [plan] = await db
      .select({ status: projectPlans.status })
      .from(projectPlans)
      .where(and(eq(projectPlans.projectId, input.projectId), eq(projectPlans.date, input.date), eq(projectPlans.supervisorId, currentUser.id)))
      .limit(1);
    if (!plan) throw new Error("File the plan for this day first. The DPR opens once the plan is approved.");
    if (plan.status !== "approved") {
      throw new Error(
        plan.status === "sent_back"
          ? "Your plan for this day was sent back. Fix and resubmit it; the DPR opens once it is approved."
          : "The plan for this day is waiting for approval. The DPR opens once it is approved.",
      );
    }
  }
  const [existing] = await db
    .select()
    .from(projectDprs)
    .where(and(eq(projectDprs.projectId, input.projectId), eq(projectDprs.date, input.date), eq(projectDprs.supervisorId, currentUser.id)))
    .limit(1);
  const status = input.status ?? "submitted";
  const values = {
    tasks: cleanDprTasks(input.tasks),
    manpower: cleanManpower(input.manpower ?? []),
    remarks: input.remarks?.trim() || null,
    evidence: input.evidence ?? existing?.evidence ?? [],
    status,
    submittedAt: status === "submitted" ? (existing?.submittedAt ?? new Date()) : (existing?.submittedAt ?? null),
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(projectDprs).set(values).where(eq(projectDprs.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(projectDprs)
    .values({ ...values, projectId: input.projectId, date: input.date, supervisorId: currentUser.id, supervisorName: await supervisorName(currentUser.id) })
    .returning();
  return row;
}

export async function updateProjectDprByAdmin(
  id: string,
  input: { tasks?: ProjectDprTask[]; manpower?: ProjectDprManpower[]; remarks?: string },
  actorId: string,
) {
  const [row] = await getDb()
    .update(projectDprs)
    .set({
      ...(input.tasks ? { tasks: cleanDprTasks(input.tasks) } : {}),
      ...(input.manpower ? { manpower: cleanManpower(input.manpower) } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projectDprs.id, id))
    .returning();
  if (!row) throw new Error("DPR not found");
  await auditService.log({ userId: actorId, module: "Planning", action: "Edited DPR", recordId: id, projectId: row.projectId, description: `Edited DPR of ${row.date}` });
  return row;
}

/** Admin delete of a plan or DPR (kept in the audit log). */
export async function deleteProjectPlanning(kind: "plan" | "dpr", id: string, actorId: string) {
  const table = kind === "plan" ? projectPlans : projectDprs;
  const [row] = await getDb().delete(table).where(eq(table.id, id)).returning({ projectId: table.projectId, date: table.date });
  if (!row) throw new Error(kind === "plan" ? "Plan not found" : "DPR not found");
  await auditService.log({
    userId: actorId,
    module: "Planning",
    action: kind === "plan" ? "Deleted Plan" : "Deleted DPR",
    recordId: id,
    projectId: row.projectId,
    description: `Deleted ${kind === "plan" ? "plan" : "DPR"} of ${row.date}`,
  });
  return { id };
}
