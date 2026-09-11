/**
 * One-off runner for a hand-authored migrations/*.sql file (see
 * MIGRATION_JOURNAL_NOTE.md for why this repo hand-authors additive SQL
 * instead of relying on `drizzle-kit generate`/migrate). `drizzle-kit push`
 * diffs schema.ts against the live DB and applies its own generated DDL
 * interactively; this instead runs the exact, already-reviewed SQL file
 * directly, which is more predictable for a hand-authored migration.
 *
 * Usage: bun run src/scripts/apply-sql-migration.ts <filename-in-migrations-folder>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDbClient } from "@db";

const fileName = process.argv[2];
if (!fileName) {
  console.error("Usage: bun run src/scripts/apply-sql-migration.ts <filename-in-migrations-folder>");
  process.exit(1);
}

const filePath = join(import.meta.dir, "..", "db", "migrations", fileName);
const sqlContent = readFileSync(filePath, "utf-8");

const client = getDbClient();

async function main() {
  console.info(`Applying ${fileName}...`);
  await client.unsafe(sqlContent);
  console.info("Applied successfully.");
}

main()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await client.end();
    process.exit(1);
  });
