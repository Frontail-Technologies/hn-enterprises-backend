-- Batch 4 follow-up: dedicated operational Recent Activity feed table.
-- Purely additive. Applied via `drizzle-kit push` (diffs live DB against
-- schema.ts) - see MIGRATION_JOURNAL_NOTE.md for why this repo hand-authors
-- additive SQL alongside push instead of `drizzle-kit generate`.
--
-- activity_events is NOT audit_logs: audit_logs stays the raw immutable
-- technical audit history (super_admin only); activity_events is the
-- sanitized, human-readable, project-permissioned feed.

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "action" text NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "on_behalf_of_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "activity_events_occurred_at_idx" ON "activity_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "activity_events_actor_idx" ON "activity_events" ("actor_id");
CREATE INDEX IF NOT EXISTS "activity_events_customer_idx" ON "activity_events" ("customer_id");
CREATE INDEX IF NOT EXISTS "activity_events_project_idx" ON "activity_events" ("project_id");
CREATE INDEX IF NOT EXISTS "activity_events_type_idx" ON "activity_events" ("type");
CREATE INDEX IF NOT EXISTS "activity_events_project_occurred_idx" ON "activity_events" ("project_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "activity_events_source_idx" ON "activity_events" ("source_type", "source_id", "action");
