import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { type Db, setDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** Fresh in-memory Postgres with the real migrations applied. */
export async function useTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  setDb(db as unknown as Db);
  return { db: db as unknown as Db, close: () => client.close() };
}
