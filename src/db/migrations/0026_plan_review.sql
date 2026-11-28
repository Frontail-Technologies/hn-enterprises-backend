-- Plan approval: plans are submitted, then approved or sent back by an admin.
-- Existing plans start as "submitted". Purely additive. Safe to re-run.
DO $$ BEGIN
  CREATE TYPE "plan_status" AS ENUM ('submitted', 'approved', 'sent_back');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "site_plans" ADD COLUMN IF NOT EXISTS "status" "plan_status" DEFAULT 'submitted' NOT NULL;
ALTER TABLE "site_plans" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "site_plans" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "site_plans" ADD COLUMN IF NOT EXISTS "review_note" text;
