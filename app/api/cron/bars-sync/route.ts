export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured } from "@/app/lib/supabase";
import { nyseCalendar } from "@/app/lib/marketTime";
import { polygonGroupedDaily, type GroupedBar } from "@/app/lib/polygonGrouped";
import { storedBarDates } from "@/app/lib/barsStore";
import { PgUnavailable } from "@/app/lib/pgClient";
import { refusalMeans, datesRemaining } from "@/app/lib/backfillProgress";

// Fills daily_bars from Polygon's grouped endpoint, one trading date per call.
//
// Run repeatedly: each invocation fetches the dates it is missing, newest
// first, within its time budget. A first run covers a few days, and a week of
// runs builds the history the scoring needs. Once caught up, there is one date
// a day to add and the job finishes in a second.
//
// Newest-first matters. A half-filled table is more useful holding the most
// recent weeks than the oldest ones: scoring needs recent bars to say anything
// about now, and the deeper history only improves the backtest's sample.

const DAY_MS = 86_400_000;

/** How far back to keep history. A year covers the 52-week range and a 14-session backtest with room. */
const LOOKBACK_DAYS = 400;

/** Dates per invocation. Polygon allows ~5 calls a minute and a run has under one. */
const MAX_DATES_PER_RUN = 4;

/** Leaves room to write the last batch before the ceiling. */
const WORK_BUDGET_MS = 45_000;

/** Rows per insert. Large enough to be few round trips, small enough not to time out. */
const CHUNK = 500;

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

async function authorize(req: Request): Promise<boolean> {
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

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Trading dates in the lookback window, newest first. */
function tradingDates(): string[] {
  const out: string[] = [];
  const today = Date.now();
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const t = today - i * DAY_MS;
    const d = new Date(t);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const date = iso(t);
    if (nyseCalendar(d.getUTCFullYear()).holidays.has(date)) continue;
    out.push(date);
  }
  return out;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return Response.json(
      { error: "Unauthorized", hint: "Sign in as the owner in this browser, or pass CRON_SECRET." },
      { status: 401 },
    );
  }
  if (!supabaseConfigured()) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = supabaseAdmin();
  const deadline = Date.now() + WORK_BUDGET_MS;

  // Which dates are already stored.
  //
  // This is the question the whole job turns on, and getting it slightly wrong
  // is indistinguishable from working. It used to be asked over REST, which
  // caps a response at a fixed number of rows however large a limit is given —
  // and daily_bars holds roughly 4,100 rows per date, so the answer was part of
  // one day's rows. The job concluded it held nothing, re-fetched dates it
  // already had, and reported the backfill getting FURTHER from done on every
  // run. Twenty-nine manual runs, no progress, no error.
  //
  // So it is asked of Postgres: `select distinct date` returns one row per
  // date and is exact by construction. If that is not available the job stops
  // rather than falling back, because the fallback is the bug.
  const since = iso(Date.now() - LOOKBACK_DAYS * DAY_MS);
  let have: Set<string>;
  try {
    have = await storedBarDates(since);
  } catch (err) {
    if (err instanceof PgUnavailable) {
      return Response.json({
        error: "Could not determine which dates are already stored",
        reason: err.reason,
        hint: err.reason === "no_connection_string"
          ? "Set DATABASE_URL to the Supabase Postgres connection string. REST cannot answer this accurately: it caps rows, and one trading date is ~4,100 of them, so the sync would re-fetch dates it already has."
          : "The database refused the query. Check DATABASE_URL and that daily_bars exists — /api/cron/migrate creates it.",
        detail: err.message,
      }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({
      error: "Could not read daily_bars",
      reason: /relation .* does not exist/i.test(message) ? "table_missing" : "query_failed",
      hint: "Run /api/cron/migrate to create daily_bars.",
      detail: message.slice(0, 160),
    }, { status: 503 });
  }

  const missing = tradingDates().filter(d => !have.has(d));

  const done: string[] = [];
  const skipped: Array<{ date: string; outcome: string; detail?: string }> = [];
  // Dates the provider refuses to serve this key. Held apart from `skipped`
  // because they are not "try again in a minute" — they are "not from here".
  const unavailable: Array<{ date: string; detail?: string }> = [];
  let written = 0;

  for (const date of missing.slice(0, MAX_DATES_PER_RUN)) {
    if (Date.now() >= deadline) break;

    // Each call waits for a slot in the shared per-minute budget, bounded by
    // the run's own deadline, so the run spends its time fetching rather than
    // collecting 429s.
    const result = await polygonGroupedDaily(date, 20_000, deadline);

    if (result.outcome === "rate_limited" || result.outcome === "budget") {
      // The minute is spent. Every remaining date in this run would meet the
      // same wall, so stop and report progress instead of marching through
      // them. The next invocation continues from here.
      skipped.push({ date, outcome: result.outcome, detail: result.detail });
      break;
    }

    if (result.outcome === "forbidden") {
      // Polygon answers both "your plan excludes this endpoint" and "your plan
      // does not include this date yet" with a 403, so the response alone
      // cannot tell them apart. What tells them apart is whether this key has
      // ever been served: dates already in the table came from this endpoint.
      //
      // Getting this wrong once already cost a working backfill. The run had
      // written 49 dates when the clock passed midnight UTC, which put the
      // previous session at the head of the queue before the free tier
      // released it. The 403 for that one date was reported as the endpoint
      // being unavailable, and the job stopped with 80 dates left to fetch.
      const meaning = refusalMeans({ storedDates: have.size, writtenThisRun: done.length });

      if (meaning === "this_date") {
        // About this date, then. Skip it and carry on to the older ones, which
        // is the whole point of a backfill.
        unavailable.push({ date, detail: result.detail });
        continue;
      }

      // Nothing has ever come back from this endpoint, so the plan is a real
      // possibility — stated as one, because it is still not proven.
      return Response.json({
        stopped: "forbidden",
        hint: "Polygon refused every grouped-daily request and this key has never been served by it, so the endpoint may not be on the plan. The per-symbol path still works; the universe stays small without this.",
        detail: result.detail,
        date,
        datesWritten: done, rowsWritten: written,
      }, { status: 200 });
    }

    if (result.outcome !== "ok") {
      // An empty date is normal — a holiday the calendar did not know about,
      // or a date Polygon has no data for. Record it and move on.
      skipped.push({ date, outcome: result.outcome, detail: result.detail });
      continue;
    }

    const rows = result.bars.map((b: GroupedBar) => ({
      date: b.date, symbol: b.symbol,
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }));

    let ok = true;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from("daily_bars")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "date,symbol", ignoreDuplicates: true });
      if (error) {
        console.error("bars-sync write error:", error.message);
        ok = false;
        break;
      }
    }
    if (ok) { done.push(result.date); written += rows.length; }
    else skipped.push({ date, outcome: "write_failed" });
  }

  // Drop bars that have fallen out of the lookback window, so storage
  // plateaus rather than growing without end. About 4,100 symbols a day means
  // roughly a million rows a year, and the free tier allows 500MB — a table
  // that only ever grows would eventually take the whole project down with it,
  // and it would do so silently.
  //
  // Safe to run unconditionally: these rows are a cache of public market data
  // and can be refetched. The picks that reference them keep their own
  // entry_price, so grading never depends on a bar still being here.
  let pruned = 0;
  try {
    const cutoff = iso(Date.now() - (LOOKBACK_DAYS + 30) * DAY_MS);
    const { error, count } = await db
      .from("daily_bars")
      .delete({ count: "exact" })
      .lt("date", cutoff);
    if (error) console.error("bars-sync prune error:", error.message);
    else pruned = count ?? 0;
  } catch (err) {
    console.error("bars-sync prune threw:", err instanceof Error ? err.message : err);
  }

  // Dates the provider will not serve are not work left to do, so they do not
  // count toward "run again" — a backfill that is as complete as this key can
  // make it should be able to say so. They are reported separately rather than
  // quietly dropped, because a missing date the operator cannot see is how
  // this job misled everyone for twenty-nine runs.
  const remaining = datesRemaining({
    missing: missing.length, written: done.length, unavailable: unavailable.length,
  });
  return Response.json({
    pruned,
    // Reported so progress is checkable from one run's output. When this was
    // being read over REST it stuck near a single date while the sync claimed
    // to be writing — the two numbers together would have shown that at once.
    datesStored: have.size + done.length,
    datesWritten: done,
    rowsWritten: written,
    skipped,
    datesRemaining: remaining,
    datesUnavailable: unavailable,
    // Said plainly so the state of the backfill is never a guess.
    note: remaining > 0
      ? `${remaining} trading date(s) still missing — run again to continue the backfill`
      : unavailable.length > 0
        ? `history is as complete as this key allows; ${unavailable.length} recent date(s) not released to it yet — the daily run will add them`
        : "history is complete for the lookback window",
  });
}
