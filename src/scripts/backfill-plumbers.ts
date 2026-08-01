import { eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { customers, plumbers } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";

async function backfillPlumbers() {
  const db = getDb();

  const rows = await db.select({ id: customers.id, plumberName: customers.plumberName }).from(customers);

  const groups = new Map<string, { name: string; customerIds: string[] }>();
  for (const row of rows) {
    const raw = row.plumberName?.trim();
    if (!raw) continue;
    const normalized = normalizeKey(raw);
    if (!normalized) continue;

    const group = groups.get(normalized);
    if (group) group.customerIds.push(row.id);
    else groups.set(normalized, { name: raw, customerIds: [row.id] });
  }

  console.info(`Found ${groups.size} distinct plumber name(s) across ${rows.length} customer row(s).`);

  for (const [normalized, { name, customerIds }] of groups) {
    const type = /^(group|team)\b/i.test(name) ? "team" : "individual";

    const [existing] = await db
      .select({ id: plumbers.id })
      .from(plumbers)
      .where(eq(plumbers.normalizedName, normalized))
      .limit(1);

    const plumberId =
      existing?.id ??
      (
        await db
          .insert(plumbers)
          .values({ name, normalizedName: normalized, type })
          .returning({ id: plumbers.id })
      )[0]?.id;

    if (!plumberId) {
      console.warn(`Skipped "${name}" - could not create or find a plumber row.`);
      continue;
    }

    for (const customerId of customerIds) {
      await db.update(customers).set({ plumberId }).where(eq(customers.id, customerId));
    }

    console.info(`  "${name}" -> ${plumberId} (${customerIds.length} customer row(s), type=${type})`);
  }

  console.info("Plumber backfill complete. Spot-check the resulting roster before relying on it.");
}

await backfillPlumbers();
await getDbClient().end();
