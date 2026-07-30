import { eq } from "drizzle-orm";
import {
  SEED_SUPERVISOR_EMAIL,
  SEED_SUPERVISOR_MOBILE,
  SEED_SUPERVISOR_NAME,
  SEED_SUPERVISOR_PASSWORD,
  SEED_SUPERVISOR_USERNAME,
} from "@constants";
import { getDb, getDbClient } from "@db";
import { users } from "@db/schema";
import { assertStrongPassword, hashPassword } from "@utils";

async function seedSupervisor() {
  assertStrongPassword(SEED_SUPERVISOR_PASSWORD);

  const db = getDb();
  const [existingSupervisor] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_SUPERVISOR_EMAIL.toLowerCase()))
    .limit(1);

  if (existingSupervisor) {
    console.info("Seed supervisor already exists.");
    return;
  }

  await db.insert(users).values({
    name: SEED_SUPERVISOR_NAME,
    username: SEED_SUPERVISOR_USERNAME.toLowerCase(),
    email: SEED_SUPERVISOR_EMAIL.toLowerCase(),
    mobile: SEED_SUPERVISOR_MOBILE || null,
    passwordHash: await hashPassword(SEED_SUPERVISOR_PASSWORD),
    role: "supervisor",
    status: "active",
    isSystemUser: true,
    passwordChangedAt: new Date(),
  });

  console.info("Seed supervisor created.");
}

await seedSupervisor();
await getDbClient().end();
