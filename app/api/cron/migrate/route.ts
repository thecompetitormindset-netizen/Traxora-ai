export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { Client } from "pg";
import { auth } from "@/auth";
import { safeMigrations } from "@/app/lib/schema";

// Applies this system's schema, so a table never has to be created by hand.
//
// Every statement is `if not exists`, so running this is a no-op once the
// schema is in place. That is what lets it sit on a schedule: it is not a
// one-time setup step that someone has to remember, it is a daily assertion
// that the tables the app needs are the tables that exist.
//
// Supabase's REST interface cannot run DDL, so this needs a real Postgres
// connection. That is the one credential this route adds, and it is the only
// manual step left — after it is set, schema changes ship with a deploy like
// anything else.
//
// Nothing destructive is applied. schema.ts refuses to hand over a statement
// that drops, truncates or deletes, because a migration that can lose data is
// one nobody should automate. Destructive changes stay deliberate and manual.

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  const query = new URL(req.url).searchParams.get("secret");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : query;
  if (secret && presented) return presented === secret;
  if (presented) return false;
  try {
    const session = await auth();
    return session?.user?.email === OWNER_EMAIL;
  } catch {
    return false;
  }
}

/** Supabase names it differently depending on where it was copied from. */
function connectionString(): string | null {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.SUPABASE_DB_URL ??
    null
  );
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return Response.json(
      { error: "Unauthorized", hint: "Sign in as the owner in this browser, or pass CRON_SECRET." },
      { status: 401 },
    );
  }

  const conn = connectionString();
  if (!conn) {
    return Response.json({
      applied: [],
      error: "No database connection string",
      reason: "missing_database_url",
      hint:
        "Supabase project → Settings → Database → Connection string → URI. " +
        "Copy it, replace [YOUR-PASSWORD] with the database password, and add it to Vercel " +
        "as DATABASE_URL for Production. This is the only manual step; after it, schema " +
        "changes apply themselves.",
    }, { status: 503 });
  }

  let migrations;
  try {
    migrations = safeMigrations();
  } catch (err) {
    // A destructive statement reached the list. Refuse the whole run rather
    // than apply the safe ones and leave the schema half-moved.
    return Response.json({
      applied: [],
      error: err instanceof Error ? err.message : "Unsafe migration",
      reason: "destructive_statement",
    }, { status: 500 });
  }

  const client = new Client({
    connectionString: conn,
    // Supabase presents a publicly-trusted certificate. Verification stays on:
    // a connection carrying the database password is the last place to turn it
    // off for convenience.
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
  });

  const applied: string[] = [];
  try {
    await client.connect();
    for (const m of migrations) {
      await client.query(m.sql);
      applied.push(m.name);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({
      applied,
      error: "Migration failed",
      // The password lives in the connection string; keep it out of the body.
      detail: message.replace(/postgres(ql)?:\/\/[^\s]+/gi, "[connection string]").slice(0, 200),
      hint: /self.signed|certificate/i.test(message)
        ? "TLS verification failed. Check the host in the connection string is the Supabase one, not a proxy."
        : /password|authentication/i.test(message)
        ? "Authentication failed — the [YOUR-PASSWORD] placeholder may not have been replaced."
        : undefined,
    }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }

  return Response.json({
    applied,
    note: `${applied.length} statement group(s) applied. All are "if not exists", so this is a no-op once the schema is in place.`,
  });
}
