import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Driver-agnostic type so tests can swap in an in-memory database. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | undefined;

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema }) as unknown as Db;
}

/** Lazy so builds and tests don't need a database. */
export function getDb(): Db {
  return (_db ??= create());
}

/** Test hook: route all queries to the given database. */
export function setDb(db: Db | undefined) {
  _db = db;
}

export * from "./schema";
