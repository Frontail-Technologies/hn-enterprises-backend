-- Project members: supervisors and plumbers/labour linked to projects.
-- Supervisors (mobile app) only see their projects' data and plumbers.
-- Removal keeps the row (removed_at) as history. Additive + a one-time seed
-- from existing links. Safe to re-run.
DO $$ BEGIN
  CREATE TYPE "project_member_type" AS ENUM ('supervisor', 'plumber');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "member_type" "project_member_type" NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "plumber_id" uuid REFERENCES "plumbers"("id") ON DELETE CASCADE,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "removed_at" timestamp with time zone,
  "removed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_members_active_user_idx" ON "project_members" ("project_id", "user_id") WHERE "removed_at" IS NULL AND "user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_active_plumber_idx" ON "project_members" ("project_id", "plumber_id") WHERE "removed_at" IS NULL AND "plumber_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "project_members_user_idx" ON "project_members" ("user_id");
CREATE INDEX IF NOT EXISTS "project_members_plumber_idx" ON "project_members" ("plumber_id");
CREATE INDEX IF NOT EXISTS "project_members_project_idx" ON "project_members" ("project_id");

-- Seed supervisors: the staff "assigned project" and site supervisors.
INSERT INTO "project_members" ("project_id", "member_type", "user_id")
SELECT DISTINCT links.project_id, 'supervisor'::project_member_type, links.user_id
FROM (
  SELECT s.assigned_project_id AS project_id, s.user_id FROM staff s WHERE s.assigned_project_id IS NOT NULL AND s.user_id IS NOT NULL
  UNION
  SELECT ps.project_id, ps.supervisor_id FROM project_sites ps WHERE ps.supervisor_id IS NOT NULL
) links
JOIN users u ON u.id = links.user_id AND u.role = 'supervisor'
WHERE NOT EXISTS (
  SELECT 1 FROM project_members m WHERE m.project_id = links.project_id AND m.user_id = links.user_id AND m.removed_at IS NULL
);

-- Seed plumbers: everyone already set as plumber on a customer of the project.
INSERT INTO "project_members" ("project_id", "member_type", "plumber_id")
SELECT DISTINCT c.project_id, 'plumber'::project_member_type, c.plumber_id
FROM customers c
WHERE c.plumber_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_members m WHERE m.project_id = c.project_id AND m.plumber_id = c.plumber_id AND m.removed_at IS NULL
  );
