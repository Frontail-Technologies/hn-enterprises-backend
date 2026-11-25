-- Bill photos/attachments (uploaded files referenced by URL). Purely additive.
-- Applied via `drizzle-kit push` - see MIGRATION_JOURNAL_NOTE.md.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
