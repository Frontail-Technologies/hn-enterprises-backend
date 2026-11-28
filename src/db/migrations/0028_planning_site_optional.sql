-- Planning is per project now: a plan / DPR no longer needs a site.
-- Older app versions still send one. Safe to re-run.
ALTER TABLE "site_plans" ALTER COLUMN "site_id" DROP NOT NULL;
ALTER TABLE "dpr_records" ALTER COLUMN "site_id" DROP NOT NULL;
