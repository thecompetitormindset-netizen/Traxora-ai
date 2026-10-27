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

/**
 * How to verify the database's certificate.
 *
 * Supabase signs its Postgres certificates with its own CA rather than a
 * publicly-trusted one, so Node rejects them out of the box with
 * "self-signed certificate in certificate chain". There are two honest ways
 * past that and one dishonest one.
 *
 * The right way is to hand Node the CA. Supabase publishes it — project
 * Settings → Database → SSL Configuration → Download certificate — and
 * putting its contents in SUPABASE_CA_CERT keeps verification fully on: the
 * connection is still proved to be Supabase's.
 *
 * The escape hatch is DATABASE_SSL_INSECURE, which turns verification off. It
 * exists because being permanently unable to apply a migration is its own kind
 * of failure, but it is deliberately a separate, explicit variable rather than
 * a silent fallback. A connection string carries the database password, and
 * unverified TLS means anything that can sit in the path can read it. When it
 * is used, the response says so, every time — a weakened connection should
 * never be quiet about it.
 */
function sslOptions(): { ca?: string; rejectUnauthorized: boolean } {
  const ca = process.env.SUPABASE_CA_CERT;
  if (ca && ca.includes("BEGIN CERTIFICATE")) {
    return { ca, rejectUnauthorized: true };
  }
  if (process.env.DATABASE_SSL_INSECURE === "true") {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export function sslMode(): "verified-with-supabase-ca" | "verified-with-system-ca" | "UNVERIFIED" {
  const ca = process.env.SUPABASE_CA_CERT;
  if (ca && ca.includes("BEGIN CERTIFICATE")) return "verified-with-supabase-ca";
  if (process.env.DATABASE_SSL_INSECURE === "true") return "UNVERIFIED";
  return "verified-with-system-ca";
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
    // "Not set" and "set but this build predates it" look identical from here,
    // and so does "set under a slightly different name". Reporting which
    // candidate names the running process can see — names only, never values —
    // turns one error into the answer, instead of a round of guessing.
    const candidates = ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"];
    const seen = Object.fromEntries(candidates.map(n => [n, Boolean(process.env[n])]));

    // Anything else that looks like a Postgres URL, in case it was saved under
    // a name none of the above match.
    const otherLikelyNames = Object.keys(process.env)
      .filter(n => /(^|_)(DB|DATABASE|POSTGRES|PG)([_A-Z]*)?(URL|URI|STRING)$/i.test(n))
      .filter(n => !candidates.includes(n));

    return Response.json({
      applied: [],
      error: "No database connection string",
      reason: "missing_database_url",
      seen,
      otherLikelyNames,
      hint:
        otherLikelyNames.length > 0
          ? `This build sees ${otherLikelyNames.join(", ")} but not DATABASE_URL — rename it to DATABASE_URL in Vercel.`
          : "This build sees none of them. If the variable is saved in Vercel, the running " +
            "deployment was built before it was added: Deployments → the top entry → ⋯ → Redeploy. " +
            "Environment variables are only passed in at build time.",
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
    ssl: sslOptions(),
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
      sslMode: sslMode(),
      hint: /self.signed|certificate|CERT_/i.test(message)
        ? "Supabase signs its database certificates with its own CA, which Node does not trust by default. " +
          "Fix it properly: Supabase → Settings → Database → SSL Configuration → Download certificate, " +
          "then paste the file's contents into Vercel as SUPABASE_CA_CERT (Production) and redeploy. " +
          "That keeps verification on. As a last resort set DATABASE_SSL_INSECURE=true, which disables " +
          "verification for this connection and will be reported on every run."
        : /password|authentication/i.test(message)
        ? "Authentication failed — the [YOUR-PASSWORD] placeholder may not have been replaced."
        : undefined,
    }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }

  const mode = sslMode();
  return Response.json({
    applied,
    sslMode: mode,
    // A weakened connection is reported on every successful run too, not only
    // when something fails. An insecure setting added to get unblocked is
    // exactly the kind that gets forgotten.
    warning: mode === "UNVERIFIED"
      ? "TLS verification is disabled for the database connection (DATABASE_SSL_INSECURE). " +
        "Set SUPABASE_CA_CERT to the downloaded Supabase certificate and remove this flag."
      : undefined,
    note: `${applied.length} statement group(s) applied. All are "if not exists", so this is a no-op once the schema is in place.`,
  });
}
