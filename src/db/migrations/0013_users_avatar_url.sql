-- Supervisor/user profile photo. Purely additive (nullable column).
-- Applied via `drizzle-kit push` (diffs live DB against schema.ts) - see
-- MIGRATION_JOURNAL_NOTE.md for why additive SQL is hand-authored here.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
