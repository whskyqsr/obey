import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>["db"];
/** A database handle or an open transaction; services accept either. */
export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Runs pending migrations under a session advisory lock, so the API and worker can both start at once.
 * Uses its own single-connection client so the lock and the migration share one session.
 */
export async function runMigrations(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(7426001)`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

export { schema };
