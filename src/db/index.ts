import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL } from "@constants";
import * as schema from "./schema";

let clientInstance: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  if (!clientInstance) {
    clientInstance = postgres(DATABASE_URL, { prepare: false });
  }

  if (!dbInstance) {
    dbInstance = drizzle(clientInstance, { schema });
  }

  return dbInstance;
}

export function getDbClient() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  if (!clientInstance) {
    clientInstance = postgres(DATABASE_URL, { prepare: false });
  }

  return clientInstance;
}
