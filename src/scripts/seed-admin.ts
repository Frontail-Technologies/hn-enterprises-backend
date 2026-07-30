import { eq } from "drizzle-orm";
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_MOBILE,
  SEED_ADMIN_NAME,
  SEED_ADMIN_PASSWORD,
  SEED_ADMIN_USERNAME,
} from "@constants";
import { getDbClient, getDb } from "@db";
import { users } from "@db/schema";
import { assertStrongPassword, hashPassword } from "@utils";

async function seedAdmin() {
  assertStrongPassword(SEED_ADMIN_PASSWORD);

  const db = getDb();
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_ADMIN_EMAIL.toLowerCase()))
    .limit(1);

  if (existingAdmin) {
    console.info("Seed admin already exists.");
    return;
  }

  await db.insert(users).values({
    name: SEED_ADMIN_NAME,
    username: SEED_ADMIN_USERNAME.toLowerCase(),
    email: SEED_ADMIN_EMAIL.toLowerCase(),
    mobile: SEED_ADMIN_MOBILE || null,
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    role: "super_admin",
    status: "active",
    isSystemUser: true,
    passwordChangedAt: new Date(),
  });

  console.info("Seed admin created.");
}

await seedAdmin();
await getDbClient().end();
