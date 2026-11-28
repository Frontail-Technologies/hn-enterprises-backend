-- Planning is project-wise now: one plan and one DPR per supervisor, project
-- and day. The old per-customer plans / DPRs are cleared (agreed: 2 plans,
-- 0 DPRs on 28 Nov 2026). Safe to re-run.
CREATE TABLE IF NOT EXISTS "project_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "supervisor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "supervisor_name" text,
  "date" date NOT NULL,
  "tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "remarks" text,
  "status" "plan_status" DEFAULT 'submitted' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_plans_project_date_supervisor_idx" ON "project_plans" ("project_id", "date", "supervisor_id");
CREATE INDEX IF NOT EXISTS "project_plans_date_idx" ON "project_plans" ("date");
CREATE INDEX IF NOT EXISTS "project_plans_status_idx" ON "project_plans" ("status");

CREATE TABLE IF NOT EXISTS "project_dprs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "supervisor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "supervisor_name" text,
  "date" date NOT NULL,
  "tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "manpower" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "remarks" text,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "dpr_status" DEFAULT 'submitted' NOT NULL,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_dprs_project_date_supervisor_idx" ON "project_dprs" ("project_id", "date", "supervisor_id");
CREATE INDEX IF NOT EXISTS "project_dprs_date_idx" ON "project_dprs" ("date");

-- Old per-customer records (replaced by the tables above).
DELETE FROM "dpr_records";
DELETE FROM "site_plans";
