-- Safe supervisor hard-delete with permanent history (see the safe-hard-
-- delete brief). Purely additive/relaxing - no column or row is dropped.
-- Applied via `drizzle-kit push` (diffs live DB against schema.ts) - see
-- MIGRATION_JOURNAL_NOTE.md for why this repo hand-authors additive SQL
-- alongside push instead of `drizzle-kit generate`.
--
-- Two kinds of change:
-- 1. Immutable actor-name (and role, where useful) snapshot columns, added
--    so historical rows stay attributable after the actor is hard-deleted -
--    never re-resolved from the live users table.
-- 2. For tables whose supervisor/creator FK was previously NOT NULL +
--    ON DELETE CASCADE (which would have deleted this historical business
--    data the moment its supervisor/creator was hard-deleted), the column is
--    relaxed to nullable + ON DELETE SET NULL. Constraint names below are
--    the exact ones drizzle generated in 0003_common_gambit.sql.

-- 1. Actor-name snapshot columns (safe on every existing row - NULL until
--    backfilled by scripts/backfill-actor-snapshots.ts).
ALTER TABLE "activity_events" ADD COLUMN IF NOT EXISTS "actor_name" text;
ALTER TABLE "activity_events" ADD COLUMN IF NOT EXISTS "actor_role" text;
ALTER TABLE "activity_events" ADD COLUMN IF NOT EXISTS "on_behalf_of_name" text;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_name" text;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_role" text;

ALTER TABLE "work_progress_updates" ADD COLUMN IF NOT EXISTS "supervisor_name" text;
ALTER TABLE "dpr_records" ADD COLUMN IF NOT EXISTS "supervisor_name" text;
ALTER TABLE "site_plans" ADD COLUMN IF NOT EXISTS "supervisor_name" text;
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "created_by_name" text;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "user_name" text;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "marked_by_name" text;
ALTER TABLE "customer_notes" ADD COLUMN IF NOT EXISTS "author_name" text;
ALTER TABLE "customer_documents" ADD COLUMN IF NOT EXISTS "uploaded_by_name" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "supervisor_name_snapshot" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "created_by_name_snapshot" text;

-- 2. Relax NOT NULL + CASCADE -> nullable + SET NULL so a hard-deleted
--    supervisor/creator never takes this historical business data with them.
ALTER TABLE "work_progress_updates" ALTER COLUMN "supervisor_id" DROP NOT NULL;
ALTER TABLE "work_progress_updates" DROP CONSTRAINT IF EXISTS "work_progress_updates_supervisor_id_users_id_fk";
ALTER TABLE "work_progress_updates" ADD CONSTRAINT "work_progress_updates_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;

ALTER TABLE "dpr_records" ALTER COLUMN "supervisor_id" DROP NOT NULL;
ALTER TABLE "dpr_records" DROP CONSTRAINT IF EXISTS "dpr_records_supervisor_id_users_id_fk";
ALTER TABLE "dpr_records" ADD CONSTRAINT "dpr_records_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;

ALTER TABLE "site_plans" ALTER COLUMN "supervisor_id" DROP NOT NULL;
ALTER TABLE "site_plans" DROP CONSTRAINT IF EXISTS "site_plans_supervisor_id_users_id_fk";
ALTER TABLE "site_plans" ADD CONSTRAINT "site_plans_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;

ALTER TABLE "complaints" ALTER COLUMN "created_by_admin_id" DROP NOT NULL;
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_created_by_admin_id_users_id_fk";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;

ALTER TABLE "attendance" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_user_id_users_id_fk";
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
