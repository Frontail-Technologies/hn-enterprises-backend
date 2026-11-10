-- Admin edits to report templates (title/category/description and paper
-- field labels). Purely additive: a new table, nothing existing changes.
-- Applied via `drizzle-kit push` (diffs live DB against schema.ts) - see
-- MIGRATION_JOURNAL_NOTE.md for why additive SQL is hand-authored here.
CREATE TABLE IF NOT EXISTS "report_template_overrides" (
  "template_id" text PRIMARY KEY,
  "title" text,
  "category" text,
  "description" text,
  "field_labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
