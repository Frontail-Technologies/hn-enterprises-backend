/**
 * One-time (idempotent) backfill of activity_events from the historical
 * sources the Recent Activity feed used before the dedicated table existed:
 * audit_logs (non-auth), work_progress_updates, dpr_records, payments,
 * complaints.
 *
 * Idempotency: every candidate carries a deterministic (sourceType, sourceId,
 * action) key and is inserted via activityService.recordIfAbsent(), so
 * re-running this script never double-writes.
 *
 *   bun run src/scripts/backfill-activity-events.ts
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { activityService } from "../modules/activity/activity.service";
import {
  dprAction,
  dprTitle,
  expenseTitle,
  humanizeToken,
  workProgressTitle,
  workProgressType,
} from "../modules/activity/activity.catalog";

const db = getDb();

let written = 0;
let skipped = 0;

async function run(label: string, fn: () => Promise<void>) {
  const before = written;
  await fn();
  console.log(`  ${label}: +${written - before} written`);
}

async function backfillAuditLogs() {
  const rows = await db.execute<{
    id: string;
    module: string;
    action: string;
    description: string | null;
    user_id: string | null;
    project_id: string | null;
    created_at: string;
    customer_id: string | null;
  }>(sql`
    SELECT al.id, al.module, al.action, al.description, al.user_id, al.project_id, al.created_at,
      c.id AS customer_id
    FROM audit_logs al
    LEFT JOIN customers c ON c.id = (
      CASE WHEN al.record_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN al.record_id::uuid ELSE NULL END
    )
    WHERE lower(al.module) <> 'auth'
    ORDER BY al.created_at
  `);
  for (const r of rows) {
    const isCustomer = r.module.toLowerCase() === "customers";
    const actionSlug = r.action.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const ok = await activityService.recordIfAbsent({
      type: isCustomer ? "customer" : "system",
      action: `${isCustomer ? "customer" : "system"}.${actionSlug}`,
      actorId: r.user_id,
      customerId: r.customer_id,
      projectId: r.project_id,
      entityType: r.module.toLowerCase(),
      entityId: r.customer_id,
      sourceType: "audit_log",
      sourceId: r.id,
      title: r.action,
      description: r.description ?? `${r.module} — ${r.action}`,
      occurredAt: new Date(r.created_at),
    });
    ok ? written++ : skipped++;
  }
}

async function backfillWorkProgress() {
  const rows = await db.execute<{
    id: string;
    stage: string;
    status: string;
    remarks: string | null;
    next_required_action: string | null;
    supervisor_id: string;
    customer_id: string;
    project_id: string | null;
    created_at: string;
  }>(sql`
    SELECT w.id, w.stage, w.status, w.remarks, w.next_required_action, w.supervisor_id,
      w.customer_id, c.project_id, w.created_at
    FROM work_progress_updates w
    LEFT JOIN customers c ON c.id = w.customer_id
    ORDER BY w.created_at
  `);
  for (const r of rows) {
    const ok = await activityService.recordIfAbsent({
      type: workProgressType(r.stage),
      action: `work_progress.${r.status}`,
      actorId: r.supervisor_id,
      customerId: r.customer_id,
      projectId: r.project_id,
      entityType: "work_progress_update",
      entityId: r.id,
      sourceType: "work_progress_update",
      sourceId: r.id,
      title: workProgressTitle(r.stage, r.status),
      description: r.remarks || r.next_required_action || "Work progress updated",
      metadata: { stage: r.stage, status: r.status },
      occurredAt: new Date(r.created_at),
    });
    ok ? written++ : skipped++;
  }
}

async function backfillDpr() {
  const rows = await db.execute<{
    id: string;
    status: string;
    remarks: string | null;
    supervisor_id: string;
    customer_id: string;
    project_id: string;
    date: string;
    occurred_at: string;
  }>(sql`
    SELECT d.id, d.status, d.remarks, d.supervisor_id, d.customer_id, d.project_id, d.date,
      coalesce(d.submitted_at, d.updated_at, d.created_at) AS occurred_at
    FROM dpr_records d
    ORDER BY coalesce(d.submitted_at, d.updated_at, d.created_at)
  `);
  for (const r of rows) {
    const ok = await activityService.recordIfAbsent({
      type: "dpr",
      action: dprAction(r.status, false),
      actorId: r.supervisor_id,
      customerId: r.customer_id,
      projectId: r.project_id,
      entityType: "dpr_record",
      entityId: r.id,
      sourceType: "dpr_record",
      sourceId: r.id,
      title: dprTitle(r.status, false),
      description: r.remarks || "Daily progress report",
      metadata: { status: r.status, date: r.date },
      occurredAt: new Date(r.occurred_at),
    });
    ok ? written++ : skipped++;
  }
}

async function backfillPayments() {
  const rows = await db.execute<{
    id: string;
    category: string;
    status: string;
    purpose: string | null;
    remarks: string | null;
    amount: string;
    submitted_by: string | null;
    supervisor_id: string | null;
    customer_id: string | null;
    project_id: string | null;
    payment_date: string;
    occurred_at: string;
  }>(sql`
    SELECT pm.id, pm.category, pm.status, pm.purpose, pm.remarks, pm.amount, pm.submitted_by,
      pm.supervisor_id, pm.customer_id, pm.project_id, pm.payment_date,
      coalesce(pm.updated_at, pm.created_at) AS occurred_at
    FROM payments pm
    ORDER BY coalesce(pm.updated_at, pm.created_at)
  `);
  for (const r of rows) {
    const ok = await activityService.recordIfAbsent({
      type: "expense",
      action: `expense.${r.status}`,
      actorId: r.submitted_by,
      onBehalfOfUserId: r.supervisor_id,
      customerId: r.customer_id,
      projectId: r.project_id,
      entityType: "payment",
      entityId: r.id,
      sourceType: "payment",
      sourceId: r.id,
      title: expenseTitle(r.category, r.status),
      description: r.purpose || r.remarks || "Expense added",
      metadata: { category: r.category, status: r.status, amount: r.amount, paymentDate: r.payment_date },
      occurredAt: new Date(r.occurred_at),
    });
    ok ? written++ : skipped++;
  }
}

async function backfillComplaints() {
  const rows = await db.execute<{
    id: string;
    title: string;
    priority: string;
    status: string;
    created_by_admin_id: string;
    customer_id: string;
    project_id: string | null;
    created_at: string;
  }>(sql`
    SELECT cp.id, cp.title, cp.priority, cp.status, cp.created_by_admin_id, cp.customer_id,
      c.project_id, cp.created_at
    FROM complaints cp
    LEFT JOIN customers c ON c.id = cp.customer_id
    ORDER BY cp.created_at
  `);
  for (const r of rows) {
    const ok = await activityService.recordIfAbsent({
      type: "complaint",
      action: "complaint.created",
      actorId: r.created_by_admin_id,
      customerId: r.customer_id,
      projectId: r.project_id,
      entityType: "complaint",
      entityId: r.id,
      sourceType: "complaint",
      sourceId: r.id,
      title: "Complaint created",
      description: `${r.title} · ${humanizeToken(r.priority)} priority`,
      metadata: { priority: r.priority, status: r.status },
      occurredAt: new Date(r.created_at),
    });
    ok ? written++ : skipped++;
  }
}

async function main() {
  console.log("Backfilling activity_events...");
  await run("audit_logs", backfillAuditLogs);
  await run("work_progress_updates", backfillWorkProgress);
  await run("dpr_records", backfillDpr);
  await run("payments", backfillPayments);
  await run("complaints", backfillComplaints);
  console.log(`Done. ${written} written, ${skipped} already present.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
