import { getDbClient, getDb } from "@db";
import { sql } from "drizzle-orm";

async function cleanup() {
  const db = getDb();
  
  const result = await db.execute<{ table_name: string }>(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name != 'drizzle_migrations';
  `);
  
  for (const row of result) {
    if (row.table_name) {
      console.log(`Truncating ${row.table_name}...`);
      await db.execute(sql.raw(`TRUNCATE TABLE "${row.table_name}" CASCADE;`));
    }
  }
  
  console.log("Cleanup complete!");
}

await cleanup();
await getDbClient().end();
