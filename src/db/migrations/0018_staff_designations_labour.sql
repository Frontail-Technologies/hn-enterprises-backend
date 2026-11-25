-- Staff designations + staff without a login, and labour alongside plumbers.
-- Purely additive (existing staff become "supervisor", existing plumbers
-- "plumber"). Applied via `drizzle-kit push` - see MIGRATION_JOURNAL_NOTE.md.
DO $$ BEGIN
  CREATE TYPE "staff_designation" AS ENUM ('supervisor', 'site_manager', 'project_manager', 'driver', 'jointer', 'helper', 'operator', 'store_incharge');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "staff" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "designation" "staff_designation" DEFAULT 'supervisor' NOT NULL;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "mobile" text;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "status" "user_status" DEFAULT 'active' NOT NULL;

DO $$ BEGIN
  CREATE TYPE "plumber_category" AS ENUM ('plumber', 'labour');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "plumbers" ADD COLUMN IF NOT EXISTS "category" "plumber_category" DEFAULT 'plumber' NOT NULL;
-- A labourer may share a name with a plumber: names are unique per category.
DROP INDEX IF EXISTS "plumbers_normalized_name_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "plumbers_category_normalized_name_idx" ON "plumbers" ("category", "normalized_name");
