export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { auth } from "@/auth";
import { etTradingDate } from "@/app/lib/marketTime";
import { rotateSteps, runChain, summarise, type ChainStep } from "@/app/lib/cronChain";

// Six scheduled jobs in one cron slot.
//
// The project declared eight cron entries and Vercel registered three. Among
// the five dropped were daily-picks — the job the entire picks feature depends
// on — and three upkeep jobs that have presumably not run since. Nothing
// reported any of it: a scheduled job that is never registered does not fail,
// it simply never happens, which is the quietest way for a feature to be
// broken.
//
// So the entries are now three, and the jobs that lost their slots run from
// here instead. Two groups, treated differently because they differ:
//
//   CORE is a sequence, and its order is a dependency rather than a
//   preference — the schema before the bars, the bars before the scoring.
//
//   UPKEEP is independent, and rotates by date so that a short minute costs a
//   different job each day. Recreating "the last item never runs" one level
//   down would be a poor way to fix exactly that bug.
//
// Every route remains callable on its own, which is how the backfill is driven
// by hand and how any of this is debugged.

/**
 * The picks pipeline. Order is a dependency, not a preference: the schema must
 * exist before bars can be written, and bars must exist before anything can be
 * scored. These are never rotated.
 */
const CORE: ChainStep[] = [
  // Fast and idempotent; makes sure the tables the rest need are there.
  { path: "/api/cron/migrate", timeoutMs: 15_000 },
  // The expensive one: fetches whatever trading dates are missing.
  { path: "/api/cron/bars-sync", timeoutMs: 25_000 },
  // Reads what the sync stored; worthless if it runs first.
  { path: "/api/cron/daily-picks", timeoutMs: 15_000 },
];

/**
 * Independent upkeep, run with whatever time the core leaves.
 *
 * These had their own cron entries and none was registered, so they have
 * presumably not run at all. They are folded in here rather than given a
 * fourth slot, because a fourth slot is what caused the problem — the project
 * declared eight entries and only three were registered.
 *
 * Rotated by date: if the minute runs short, a different one misses out each
 * day rather than the last one starving permanently. A job that never runs
 * because of where it sits in a list is exactly the failure this route exists
 * to fix, and it would be careless to recreate it one level down.
 */
const UPKEEP: ChainStep[] = [
  { path: "/api/cron/sentiment-collect",   timeoutMs: 12_000 },
  { path: "/api/cron/check-subscriptions", timeoutMs: 10_000 },
  { path: "/api/cron/sports-track-record", timeoutMs: 12_000 },
];

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

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return Response.json(
      { error: "Unauthorized", hint: "Sign in as the owner in this browser, or pass CRON_SECRET." },
      { status: 401 },
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // The chain authenticates to its own steps with this. Without it the chain
    // cannot run them even though a person reached this route by session.
    return Response.json({
      error: "CRON_SECRET is not set",
      hint: "The chain presents it to each step. Set it in the environment, or run the steps individually.",
    }, { status: 503 });
  }

  // The origin this request arrived on, rather than a guessed env var — it is
  // correct on production, previews and locally without configuration.
  const origin = new URL(req.url).origin;

  // Leave headroom so the summary is written rather than the invocation being
  // killed mid-chain with nothing reported.
  const deadline = Date.now() + 52_000;

  // Core first and in order; upkeep with what is left, starting at a
  // different step each day.
  const steps = [...CORE, ...rotateSteps(UPKEEP, etTradingDate())];
  const results = await runChain(steps, { origin, secret, deadline });

  return Response.json({
    runDate: etTradingDate(),
    summary: summarise(results),
    steps: results,
  });
}
