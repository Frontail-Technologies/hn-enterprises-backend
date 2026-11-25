-- DPR approval: who reviewed it, when, and the reason when it was sent back.
-- Purely additive. Safe to re-run.
ALTER TABLE "dpr_records" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "dpr_records" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "dpr_records" ADD COLUMN IF NOT EXISTS "review_note" text;
