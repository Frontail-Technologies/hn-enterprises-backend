import { eq, and } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { masterValues } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";

const BASIC_PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "NEFT", "Cheque", "Other"];

async function seedPaymentModes() {
  const db = getDb();

  for (const value of BASIC_PAYMENT_MODES) {
    const normalizedValue = normalizeKey(value);
    const [existing] = await db
      .select({ id: masterValues.id })
      .from(masterValues)
      .where(and(eq(masterValues.category, "payment_types"), eq(masterValues.normalizedValue, normalizedValue)))
      .limit(1);

    if (existing) {
      console.info(`Skipped "${value}" - already exists.`);
      continue;
    }

    await db.insert(masterValues).values({
      category: "payment_types",
      value,
      normalizedValue,
      status: "active",
    });
    console.info(`Created "${value}".`);
  }

  console.info("Payment mode seed complete.");
}

await seedPaymentModes();
await getDbClient().end();
