export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured } from "@/app/lib/supabase";
import { etTradingDate, nyseCalendar } from "@/app/lib/marketTime";
import { polygonGroupedDaily, type GroupedBar } from "@/app/lib/polygonGrouped";

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

  // Which dates are already stored. One distinct-date query beats asking per
  // date, and the set is small — at most a year of trading days.
  const since = iso(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const { data: present, error: presentErr } = await db
    .from("daily_bars")
    .select("date")
    .gte("date", since)
    .limit(500_000);

  if (presentErr) {
    return Response.json({
      error: "Could not read daily_bars",
      reason: /relation .* does not exist|schema cache/i.test(presentErr.message) ? "table_missing" : "query_failed",
      hint: "Run the daily_bars block from supabase/migrations.sql in the Supabase SQL editor.",
      detail: presentErr.message.slice(0, 160),
    }, { status: 503 });
  }

  const have = new Set((present ?? []).map(r => String(r.date)));
  const missing = tradingDates().filter(d => !have.has(d));

  const done: string[] = [];
  const skipped: Array<{ date: string; outcome: string; detail?: string }> = [];
  let written = 0;

  for (const date of missing.slice(0, MAX_DATES_PER_RUN)) {
    if (Date.now() >= deadline) break;

    const result = await polygonGroupedDaily(date);

    if (result.outcome === "not_entitled") {
      // A permanent no, not a transient one. Stop rather than spend the rest
      // of the run discovering the same thing date by date.
      return Response.json({
        stopped: "not_entitled",
        hint: "Polygon's grouped-daily endpoint is not on this key's plan. The per-symbol path still works; the universe stays small without this.",
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

  const remaining = Math.max(0, missing.length - done.length);
  return Response.json({
    datesWritten: done,
    rowsWritten: written,
    skipped,
    datesRemaining: remaining,
    // Said plainly so the state of the backfill is never a guess.
    note: remaining > 0
      ? `${remaining} trading date(s) still missing — run again to continue the backfill`
      : "history is complete for the lookback window",
  });
}
