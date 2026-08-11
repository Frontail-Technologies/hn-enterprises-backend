import { eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@db";
import { bills, customers } from "@db/schema";

// One-time backfill for the bills.projectId migration (customer-linked bills
// → project-linked bills). Existing bills only have a customerId - this
// derives projectId from that customer's own project and fills it in, so
// projectId can then be made NOT NULL without losing any existing rows.
// Run once: `bun run backfill:bill-projects`.
async function backfillBillProjects() {
  const db = getDb();

  const rows = await db
    .select({ id: bills.id, customerId: bills.customerId })
    .from(bills)
    .where(isNull(bills.projectId));

  console.info(`Found ${rows.length} bill(s) missing a projectId.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.customerId) {
      console.warn(`  Bill ${row.id} has no customerId either - cannot derive a project, skipping.`);
      skipped++;
      continue;
    }

    const [customer] = await db
      .select({ projectId: customers.projectId })
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);

    if (!customer) {
      console.warn(`  Bill ${row.id}'s customer ${row.customerId} no longer exists, skipping.`);
      skipped++;
      continue;
    }

    await db.update(bills).set({ projectId: customer.projectId }).where(eq(bills.id, row.id));
    updated++;
  }

  console.info(`Backfilled ${updated} bill(s). ${skipped} skipped (need manual review before projectId can be required).`);

  const [{ remaining }] = await db.execute<{ remaining: number }>(
    sql`SELECT COUNT(*)::int as remaining FROM bills WHERE project_id IS NULL`,
  );
  console.info(`${remaining} bill(s) still missing a projectId.`);
}

await backfillBillProjects();
process.exit(0);
