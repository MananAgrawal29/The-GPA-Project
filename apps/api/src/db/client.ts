import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool, types } from "pg";
import * as schema from "./schema.js";

/** PostgreSQL's OID for the `date` type. */
const DATE_OID = 1082;

/**
 * Keeps `date` values as the exact `YYYY-MM-DD` string the server sent.
 *
 * By default `pg` parses `date` into a JS `Date` at local midnight. In any
 * time zone east of UTC that instant is the previous day in UTC, so
 * converting it back to a calendar date shifts the semester by one day
 * (for example `2026-07-01` becomes `2026-06-30` in India). A semester
 * boundary is a calendar date, not an instant, so the value is never
 * converted at all. Every other OID keeps the driver's default parser.
 */
function getTypeParser(oid: number, format?: "text" | "binary") {
  if (oid === DATE_OID) {
    return (value: string) => value;
  }

  return types.getTypeParser(oid, format);
}

/**
 * The database surface the repositories depend on.
 *
 * It is the driver-agnostic `PgDatabase` base type rather than the
 * `node-postgres` subclass, so the same repository code runs against the
 * production driver and against the in-memory PostgreSQL used by the
 * integration tests.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  readonly db: NodePgDatabase<typeof schema>;
  readonly pool: Pool;
  close(): Promise<void>;
}

/**
 * Creates a connection pool and a Drizzle client for it.
 *
 * The caller supplies the connection string; this module never reads
 * `process.env`, because environment access belongs to `config/env.ts`
 * (D016).
 */
export function createDatabase(connectionString: string): DatabaseHandle {
  if (connectionString.trim() === "") {
    throw new Error(
      "DATABASE_URL is empty. Set it to a PostgreSQL connection string.",
    );
  }

  const pool = new Pool({ connectionString, types: { getTypeParser } });

  // An idle client can fail (server restart, network drop). Without a
  // listener Node treats it as an unhandled 'error' event and exits the
  // process. Log the fact only: the event carries no user data.
  pool.on("error", () => {
    console.error("Unexpected PostgreSQL pool error");
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
