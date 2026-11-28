import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, sitePlans } from "@db/schema";
import { RETENTION_DAYS } from "@modules/recycle-bin/recycle-bin.service";
import { auditService, notificationService } from "@services";
import type { DprTaskPayload, PlanTaskPayload } from "@db/schema";

export type PlanReviewAction = "approve" | "reject";

/**
 * Admin review of submitted plans.
 * - approve: submitted -> approved (final; the supervisor can't change it)
 * - reject:  submitted -> sent_back, with a reason; the supervisor is notified,
 *            fixes the plan and saves it again (which re-submits it).
 * Plans that aren't "submitted" are skipped (reported back as `skipped`).
 */
export async function reviewSitePlans(ids: string[], action: PlanReviewAction, note: string | undefined, actorId: string) {
  const unique = [...new Set(ids)];
  const reason = note?.trim() ?? "";
  if (action === "reject" && !reason) throw new Error("A reason is required to send a plan back");
  const db = getDb();

  const updated = await db
    .update(sitePlans)
    .set(
      action === "approve"
        ? { status: "approved", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: null, updatedAt: new Date() }
        : { status: "sent_back", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: reason, updatedAt: new Date() },
    )
    .where(and(inArray(sitePlans.id, unique), eq(sitePlans.status, "submitted")))
    .returning({ id: sitePlans.id, supervisorId: sitePlans.supervisorId, customerId: sitePlans.customerId, date: sitePlans.date, projectId: sitePlans.projectId });

  if (updated.length) {
    await auditService.log({
      userId: actorId,
      module: "Planning",
      action: action === "approve" ? "Approved Plan" : "Sent Back Plan",
      recordId: updated.length === 1 ? updated[0].id : undefined,
      projectId: updated.length === 1 ? updated[0].projectId : undefined,
      description:
        action === "approve"
          ? `Approved ${updated.length} plan${updated.length === 1 ? "" : "s"}`
          : `Sent back ${updated.length} plan${updated.length === 1 ? "" : "s"}: ${reason}`,
    });
  }

  if (action === "reject" && updated.length) {
    const customerRows = await db
      .select({ id: customers.id, name: customers.customerName, trBpNumber: customers.trBpNumber })
      .from(customers)
      .where(inArray(customers.id, updated.map((row) => row.customerId)));
    const nameById = new Map(customerRows.map((row) => [row.id, row.name]));
    const bpById = new Map(customerRows.map((row) => [row.id, row.trBpNumber ?? ""]));
    for (const row of updated) {
      if (!row.supervisorId) continue;
      await notificationService
        .queue({
          userIds: [row.supervisorId],
          title: "Plan sent back",
          message: `${nameById.get(row.customerId) ?? "Customer"} (${row.date}): ${reason}`,
          category: "work",
          sourceType: "plan",
          sourceId: row.id,
          // Opens the plan itself in the app (older apps fall back to the notifications list).
          route: {
            pathname: "/planning/plan",
            params: {
              customerId: row.customerId,
              customerName: nameById.get(row.customerId) ?? "",
              trBpNumber: bpById.get(row.customerId) ?? "",
              projectId: row.projectId,
              date: row.date,
            },
          },
        })
        .catch((error: unknown) => console.error("[plan] notify failed", error));
    }
  }

  return { updated: updated.length, skipped: unique.length - updated.length };
}

/** Admin edit of a plan's quantities / workers. */
export async function updateSitePlanByAdmin(id: string, input: { tasks: PlanTaskPayload[] }, actorId: string) {
  const db = getDb();
  const [record] = await db.update(sitePlans).set({ tasks: input.tasks, updatedAt: new Date() }).where(eq(sitePlans.id, id)).returning();
  if (!record) throw new Error("Plan not found");
  await auditService.log({ userId: actorId, module: "Planning", action: "Edited Plan", recordId: id, projectId: record.projectId, description: `Edited plan of ${record.date}` });
  return record;
}

/** Admin edit of a DPR's work done, remarks and status (draft / submitted). */
export async function updateDprRecordByAdmin(
  id: string,
  input: { tasks?: DprTaskPayload[]; remarks?: string; status?: "draft" | "submitted" },
  actorId: string,
) {
  const db = getDb();
  const patch = {
    ...(input.tasks ? { tasks: input.tasks } : {}),
    ...(input.remarks !== undefined ? { remarks: input.remarks || null } : {}),
    ...(input.status ? { status: input.status, ...(input.status === "submitted" ? { submittedAt: sql`coalesce(${dprRecords.submittedAt}, now())` } : {}) } : {}),
    updatedAt: new Date(),
  };
  const [record] = await db.update(dprRecords).set(patch).where(eq(dprRecords.id, id)).returning();
  if (!record) throw new Error("DPR not found");
  await auditService.log({ userId: actorId, module: "Planning", action: "Edited DPR", recordId: id, projectId: record.projectId, description: `Edited DPR of ${record.date}` });
  return record;
}

/**
 * Delete a plan or DPR made by mistake. A copy goes to the recycle bin
 * (30 days) and can be restored while its customer still exists.
 */
export async function deletePlanningRecord(kind: "plan" | "dpr", id: string, actorId: string) {
  const db = getDb();
  const table = kind === "plan" ? "site_plans" : "dpr_records";
  const entityType = kind === "plan" ? "site_plan" : "dpr_record";
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ label: string; projectId: string; customerId: string; date: string }>(sql`
      SELECT coalesce(c.customer_name, 'Customer') || ' - ' || r.date::text AS label,
             r.project_id AS "projectId", r.customer_id AS "customerId", r.date::text AS date
      FROM ${sql.raw(table)} r LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.id = ${id}::uuid
    `);
    if (!row) throw new Error(kind === "plan" ? "Plan not found" : "DPR not found");
    await tx.execute(sql`
      INSERT INTO deleted_records (entity_type, entity_id, label, data, deleted_by, expires_at)
      SELECT ${entityType}, r.id, ${`${kind === "plan" ? "Plan" : "DPR"}: ${row.label}`},
             jsonb_build_object('row', to_jsonb(r)), ${actorId}::uuid, now() + make_interval(days => ${RETENTION_DAYS})
      FROM ${sql.raw(table)} r WHERE r.id = ${id}::uuid
    `);
    await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE id = ${id}::uuid`);
    await auditService.log({
      userId: actorId,
      module: "Planning",
      action: kind === "plan" ? "Deleted Plan" : "Deleted DPR",
      recordId: id,
      projectId: row.projectId,
      description: `Deleted ${kind === "plan" ? "plan" : "DPR"} ${row.label} (recycle bin)`,
    });
    return { id, label: row.label };
  });
}
