import { getDbClient, getDb } from "@db";
import { users } from "@db/schema";
import { hashPassword } from "@utils";

async function addAdmin() {
  const db = getDb();
  
  await db.insert(users).values({
    name: "Admin User 2",
    username: "admin2",
    email: "admin2@gmail.com",
    mobile: "8588888888",
    passwordHash: await hashPassword("Test1234"),
    role: "super_admin",
    status: "active",
    isSystemUser: false,
    passwordChangedAt: new Date(),
  });

  console.info("Custom admin created: admin2 / Test1234");
}

await addAdmin();
await getDbClient().end();
