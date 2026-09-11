/**
 * One-time (idempotent) backfill of the immutable actor-name/role snapshot
 * columns added for safe supervisor hard-delete (see the safe-hard-delete
 * brief). Must be run BEFORE any production hard-delete of a user that has
 * existing history, so that history's attribution survives the delete.
 *
 * Idempotency: every statement is `UPDATE ... FROM users ... WHERE <snapshot
 * column> IS NULL`, so a row already backfilled (or created after the
 * write-time snapshot code shipped) is never touched again - safe to re-run
 * any number of times, and cheap to re-run after adding a new source table.
 *
 *   bun run src/scripts/backfill-actor-snapshots.ts
 */
import { sql } from "drizzle-orm";
import { getDb, getDbClient } from "@db";

const db = getDb();

async function run(label: string, query: ReturnType<typeof sql>) {
  const rows = await db.execute<{ id: string }>(query);
  console.info(`  ${label}: ${rows.length} row(s) backfilled`);
}

async function main() {
  console.info("Backfilling actor-name snapshots...");

  await run(
    "activity_events.actor_name/actor_role",
    sql`
      UPDATE activity_events ae SET actor_name = u.name, actor_role = u.role
      FROM users u WHERE ae.actor_id = u.id AND ae.actor_name IS NULL
      RETURNING ae.id
    `,
  );
  await run(
    "activity_events.on_behalf_of_name",
    sql`
      UPDATE activity_events ae SET on_behalf_of_name = u.name
      FROM users u WHERE ae.on_behalf_of_user_id = u.id AND ae.on_behalf_of_name IS NULL
      RETURNING ae.id
    `,
  );
  await run(
    "audit_logs.user_name/user_role",
    sql`
      UPDATE audit_logs al SET user_name = u.name, user_role = u.role
      FROM users u WHERE al.user_id = u.id AND al.user_name IS NULL
      RETURNING al.id
    `,
  );
  await run(
    "work_progress_updates.supervisor_name",
    sql`
      UPDATE work_progress_updates w SET supervisor_name = u.name
      FROM users u WHERE w.supervisor_id = u.id AND w.supervisor_name IS NULL
      RETURNING w.id
    `,
  );
  await run(
    "dpr_records.supervisor_name",
    sql`
      UPDATE dpr_records d SET supervisor_name = u.name
      FROM users u WHERE d.supervisor_id = u.id AND d.supervisor_name IS NULL
      RETURNING d.id
    `,
  );
  await run(
    "site_plans.supervisor_name",
    sql`
      UPDATE site_plans s SET supervisor_name = u.name
      FROM users u WHERE s.supervisor_id = u.id AND s.supervisor_name IS NULL
      RETURNING s.id
    `,
  );
  await run(
    "complaints.created_by_name",
    sql`
      UPDATE complaints c SET created_by_name = u.name
      FROM users u WHERE c.created_by_admin_id = u.id AND c.created_by_name IS NULL
      RETURNING c.id
    `,
  );
  await run(
    "attendance.user_name",
    sql`
      UPDATE attendance a SET user_name = u.name
      FROM users u WHERE a.user_id = u.id AND a.user_name IS NULL
      RETURNING a.id
    `,
  );
  await run(
    "attendance.marked_by_name",
    sql`
      UPDATE attendance a SET marked_by_name = u.name
      FROM users u WHERE a.marked_by = u.id AND a.marked_by_name IS NULL
      RETURNING a.id
    `,
  );
  await run(
    "customer_notes.author_name",
    sql`
      UPDATE customer_notes cn SET author_name = u.name
      FROM users u WHERE cn.author_id = u.id AND cn.author_name IS NULL
      RETURNING cn.id
    `,
  );
  await run(
    "customer_documents.uploaded_by_name",
    sql`
      UPDATE customer_documents cd SET uploaded_by_name = u.name
      FROM users u WHERE cd.uploaded_by = u.id AND cd.uploaded_by_name IS NULL
      RETURNING cd.id
    `,
  );
  await run(
    "payments.supervisor_name_snapshot",
    sql`
      UPDATE payments p SET supervisor_name_snapshot = u.name
      FROM users u WHERE p.supervisor_id = u.id AND p.supervisor_name_snapshot IS NULL
      RETURNING p.id
    `,
  );
  await run(
    "payments.created_by_name_snapshot",
    sql`
      UPDATE payments p SET created_by_name_snapshot = u.name
      FROM users u WHERE p.submitted_by = u.id AND p.created_by_name_snapshot IS NULL
      RETURNING p.id
    `,
  );

  console.info("Backfill complete.");
}

main()
  .then(() => getDbClient().end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Backfill failed:", error);
    await getDbClient().end();
    process.exit(1);
  });
