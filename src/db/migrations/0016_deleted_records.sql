-- Recycle bin: snapshots of deleted customers (and their related rows) kept
-- for 30 days so they can be restored. Purely additive: a new table.
-- Applied via `drizzle-kit push` (diffs live DB against schema.ts) - see
-- MIGRATION_JOURNAL_NOTE.md for why additive SQL is hand-authored here.
CREATE TABLE IF NOT EXISTS "deleted_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "label" text NOT NULL,
  "data" jsonb NOT NULL,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "deleted_records_deleted_at_idx" ON "deleted_records" ("deleted_at");
CREATE INDEX IF NOT EXISTS "deleted_records_entity_idx" ON "deleted_records" ("entity_type", "entity_id");
