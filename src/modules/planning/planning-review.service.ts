import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords } from "@db/schema";
import { auditService, notificationService } from "@services";

export type DprReviewAction = "approve" | "reject";

/**
 * Admin review of submitted DPRs.
 * - approve: submitted -> approved (final; the supervisor can no longer edit it)
 * - reject:  submitted -> draft, with a reason; the supervisor is notified,
 *            fixes it and submits again.
 * DPRs that aren't "submitted" are skipped (reported back as `skipped`).
 */
export async function reviewDprRecords(ids: string[], action: DprReviewAction, note: string | undefined, actorId: string) {
  const unique = [...new Set(ids)];
  const reason = note?.trim() ?? "";
  if (action === "reject" && !reason) throw new Error("A reason is required to send a DPR back");
  const db = getDb();

  const updated = await db
    .update(dprRecords)
    .set(
      action === "approve"
        ? { status: "approved", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: null, updatedAt: new Date() }
        : { status: "draft", reviewedBy: actorId, reviewedAt: new Date(), reviewNote: reason, updatedAt: new Date() },
    )
    .where(and(inArray(dprRecords.id, unique), eq(dprRecords.status, "submitted")))
    .returning({ id: dprRecords.id, supervisorId: dprRecords.supervisorId, customerId: dprRecords.customerId, date: dprRecords.date, projectId: dprRecords.projectId });

  if (updated.length) {
    await auditService.log({
      userId: actorId,
      module: "DPR",
      action: action === "approve" ? "Approved DPR" : "Sent Back DPR",
      recordId: updated.length === 1 ? updated[0].id : undefined,
      projectId: updated.length === 1 ? updated[0].projectId : undefined,
      description:
        action === "approve"
          ? `Approved ${updated.length} DPR${updated.length === 1 ? "" : "s"}`
          : `Sent back ${updated.length} DPR${updated.length === 1 ? "" : "s"}: ${reason}`,
    });
  }

  // Tell each supervisor their DPR was sent back, with the reason.
  if (action === "reject") {
    const customerRows = updated.length
      ? await db.select({ id: customers.id, name: customers.customerName }).from(customers).where(inArray(customers.id, updated.map((row) => row.customerId)))
      : [];
    const nameById = new Map(customerRows.map((row) => [row.id, row.name]));
    for (const row of updated) {
      if (!row.supervisorId) continue;
      await notificationService
        .queue({
          userIds: [row.supervisorId],
          title: "DPR sent back",
          message: `${nameById.get(row.customerId) ?? "Customer"} (${row.date}): ${reason}`,
          category: "work",
          sourceType: "dpr",
          sourceId: row.id,
          route: { pathname: "/customers/[id]", params: { id: row.customerId } },
        })
        .catch((error: unknown) => console.error("[dpr] notify failed", error));
    }
  }

  return { updated: updated.length, skipped: unique.length - updated.length };
}
