# Migration journal gap (0008+)

`meta/_journal.json` only lists migrations `0000`–`0007`. Two migration files
exist in this folder that are **not** registered there and have no matching
`meta/NNNN_snapshot.json`:

- `0008_import_rows_is_removed.sql`
- `0009_material_transactions_material_type_idx.sql` (added in the API
  optimization Batch 1)
- `0010_material_transactions_project_type_date_idx.sql` (added in Batch 2)

This predates Batch 1/2 - `0008` was already in this state before this work
started.

## Why this hasn't been fixed by regenerating

This repo's actual deploy mechanism is `npm run migrate` → `drizzle-kit push`
(a live-DB schema diff), **not** a journal-replay `drizzle-kit migrate`. The
`migrations/*.sql` + `meta/*.json` files are `drizzle-kit generate`'s output
and are otherwise unused by any script here - so the gap has had no
functional impact on deploys, only on `generate`'s own bookkeeping.

Running `drizzle-kit generate` today fails outright, before it even gets to
the 0008 gap:

```
Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or
process.stdout.isTTY is false).
    at enumsResolver (.../drizzle-kit/bin.cjs:32129:60)
```

It's asking an enum add-vs-rename disambiguation question (some enum in the
current `schema.ts` doesn't have a snapshot to diff against, and drizzle-kit
can't tell whether it's new or a rename of something from the last real
snapshot at `0007`). This requires an interactive terminal to answer - it
cannot be resolved non-interactively without risking silently telling
drizzle-kit the wrong answer (treating a genuinely new enum as a rename of
an existing one would produce a `RENAME TYPE` migration instead of a
`CREATE TYPE`, which is wrong and only detectable by someone who already
knows the schema history).

## How to actually close this gap

From a real terminal (with a TTY), from `backend/`:

```
npx drizzle-kit generate
```

Answer the enum prompt (it will ask "is `<enum>` created or renamed from
`<other enum>`" - answer "create" unless you specifically know it's a
rename). This produces one consolidated `00NN_xxx.sql` + snapshot capturing
everything since `0007`, including the `0008`/`0009`/`0010` changes above,
and fixes `_journal.json` going forward.

Until that's done, new schema changes in this repo should keep following
the same safe pattern Batches 1-2 used: hand-authored, purely-additive SQL
migration files (numbered sequentially, non-destructive only - e.g.
`CREATE INDEX IF NOT EXISTS`) applied via `drizzle-kit push` (which diffs
the live DB directly and doesn't depend on the journal), never
`drizzle-kit push --force` for anything that could drop or alter existing
data.
