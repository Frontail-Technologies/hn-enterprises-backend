import { and, eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { masterValues } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { MASTER_VALUES_SEED } from "./master-values-seed.data";

/**
 * Production master-value seed (§3 of the bulk-toolbar / invoice /
 * master-data brief). Loads every master-value category the app actually
 * uses (see master-values-seed.data.ts for where each list came from).
 *
 * Safety:
 * - Insert-if-missing only, per (category, normalizedValue) - the same pair
 *   the `master_values_category_value_idx` unique index enforces, so this is
 *   safe to re-run any number of times without creating duplicates.
 * - Never updates or reactivates an existing row (including one an admin
 *   deliberately deactivated) and never deletes anything - no force-reset,
 *   no destructive behavior.
 */
async function seedMasterValues() {
  const db = getDb();
  let created = 0;
  let skipped = 0;

  for (const [category, values] of Object.entries(MASTER_VALUES_SEED)) {
    for (const value of values) {
      const normalizedValue = normalizeKey(value);
      const [existing] = await db
        .select({ id: masterValues.id })
        .from(masterValues)
        .where(and(eq(masterValues.category, category as keyof typeof MASTER_VALUES_SEED), eq(masterValues.normalizedValue, normalizedValue)))
        .limit(1);

      if (existing) {
        console.info(`Skipped  [${category}] "${value}" - already exists.`);
        skipped += 1;
        continue;
      }

      await db.insert(masterValues).values({
        category: category as keyof typeof MASTER_VALUES_SEED,
        value,
        normalizedValue,
        status: "active",
      });
      console.info(`Created  [${category}] "${value}".`);
      created += 1;
    }
  }

  console.info(`\nMaster value seed complete. Created: ${created}, Skipped (already existed): ${skipped}, Updated: 0.`);
}

await seedMasterValues();
await getDbClient().end();
