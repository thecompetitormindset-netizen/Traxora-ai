// A direct Postgres connection, for the reads that cannot go through REST.
//
// Supabase's REST interface caps a response at around a thousand rows whatever
// limit is asked for. That is invisible: the query succeeds, returns fewer
// rows, and the caller treats what came back as the whole answer.
//
// It bit twice in the same table. The bars sync worked out which trading dates
// it already had by selecting every row and collecting the distinct dates —
// but daily_bars holds roughly 4,100 rows per date, so it saw part of one day
// and concluded almost nothing was stored, re-fetching the same dates run
// after run while reporting the backfill going backwards. And the scorer loads
// sixty symbols' worth of history at once, seven thousand rows or more, which
// the cap would have reduced to a fraction with no error.
//
// Both are the familiar shape: a truncated answer read as a complete one. The
// fix is to ask Postgres directly, where `select distinct` and a large result
// set are ordinary.

import { Client } from "pg";

export function pgConnectionString(): string | null {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL ?? null;
}

/** Matches the migrate route: Supabase's own CA, or an explicit opt-out. */
function sslOptions(): { ca?: string; rejectUnauthorized: boolean } {
  const ca = process.env.SUPABASE_CA_CERT;
  if (ca && ca.includes("BEGIN CERTIFICATE")) return { ca, rejectUnauthorized: true };
  if (process.env.DATABASE_SSL_INSECURE === "true") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

export class PgUnavailable extends Error {
  constructor(public readonly reason: "no_connection_string" | "query_failed", message: string) {
    super(message);
    this.name = "PgUnavailable";
  }
}

/**
 * Run one query with a short-lived connection.
 *
 * A connection per call rather than a pool: these are scheduled jobs running a
 * handful of queries a day, and a pool held across serverless invocations is a
 * source of stale sockets rather than a saving.
 */
export async function withPg<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const conn = pgConnectionString();
  if (!conn) {
    throw new PgUnavailable(
      "no_connection_string",
      "DATABASE_URL is not set, so this query cannot run. REST cannot answer it accurately because of its row cap.",
    );
  }

  const client = new Client({
    connectionString: conn,
    ssl: sslOptions(),
    connectionTimeoutMillis: 8_000,
    statement_timeout: 20_000,
  });

  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    if (err instanceof PgUnavailable) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new PgUnavailable(
      "query_failed",
      // The password lives in the connection string; keep it out of anything
      // that might reach a response body.
      message.replace(/postgres(ql)?:\/\/[^\s]+/gi, "[connection string]").slice(0, 200),
    );
  } finally {
    await client.end().catch(() => {});
  }
}

/** Postgres `date` columns come back as Date objects; normalise to YYYY-MM-DD. */
export const toIsoDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
