export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { viewer } from "@/app/lib/viewer";
import { supabaseAdmin, supabaseConfigured } from "@/app/lib/supabase";
import { etTradingDate } from "@/app/lib/marketTime";
import { trackRecord, type PickOutcome } from "@/app/lib/dailyPicks";

// The day's picks, read from storage.
//
// This route calls NO market-data provider. Everything it returns was computed
// once by the scheduled job and written to the database, so every viewer sees
// the same rows, the result does not shift during the day, and the hundredth
// reader costs exactly what the first did: one query.
//
// That is the whole point of the design. The free tiers that make this app
// possible are small — Polygon allows about five calls a minute — and no
// per-request fetch can be made to fit inside that. Moving the work to a
// schedule removes the limit from the path people actually wait on.

/**
 * How many past picks the history view returns.
 *
 * Deliberately a named limit rather than a number buried in a query: the UI has
 * to tell the reader this is a window, and it cannot do that honestly without
 * knowing how wide the window is.
 */
const HISTORY_LIMIT = 90;

export type ServedPick = {
  symbol: string;
  rank: number;
  direction: "BUY" | "SELL";
  conviction: number;
  entryPrice: number;
  asOf: string;
  horizonDays: number;
  why: string[];
  /** Present once the horizon has passed. */
  outcome: { date: string; price: number; returnPct: number; correct: boolean } | null;
};

type Row = {
  symbol: string; rank: number; direction: string; conviction: number;
  entry_price: number; as_of: string; horizon_days: number; why: unknown;
  outcome_date: string | null; outcome_price: number | null;
  return_pct: number | null; correct: boolean | null;
};

const asPick = (r: Row): ServedPick => ({
  symbol: r.symbol,
  rank: r.rank,
  direction: r.direction === "SELL" ? "SELL" : "BUY",
  conviction: Number(r.conviction),
  entryPrice: Number(r.entry_price),
  asOf: r.as_of,
  horizonDays: r.horizon_days,
  why: Array.isArray(r.why) ? (r.why as string[]) : [],
  outcome:
    r.outcome_date && r.outcome_price !== null && r.return_pct !== null && r.correct !== null
      ? { date: r.outcome_date, price: Number(r.outcome_price), returnPct: Number(r.return_pct), correct: r.correct }
      : null,
});

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (!supabaseConfigured()) {
    // Local development without secrets. Say so rather than returning an empty
    // list, which would read as "no picks today".
    return Response.json({ available: false, picks: [], record: null, asOfDate: null });
  }

  const url = new URL(req.url);
  const history = url.searchParams.get("history") === "1";

  try {
    const db = supabaseAdmin();

    // Today's picks. If the job has not run yet today — before the pre-market
    // run, or on a non-trading day — fall back to the most recent day that has
    // any, so the page is never blank, and say which day it is showing.
    const today = etTradingDate();
    const { data: todayRows, error: readErr } = await db
      .from("daily_picks")
      .select("symbol, rank, direction, conviction, entry_price, as_of, horizon_days, why, outcome_date, outcome_price, return_pct, correct")
      .eq("run_date", today)
      .order("rank", { ascending: true });

    // An unreadable table and an empty one produce the same `data: null`, and
    // treating both as "no picks today" is the exact failure this codebase has
    // spent its time removing: an absence rendered as a fact. A missing table
    // needs a migration run; an empty one needs the job to fire. Say which.
    if (readErr) {
      console.error("daily-picks read error:", readErr.message);
      return Response.json({
        available: false,
        reason: /relation .* does not exist|schema cache/i.test(readErr.message)
          ? "table_missing"
          : "query_failed",
        hint: "Run the daily_picks block from supabase/migrations.sql in the Supabase SQL editor.",
        detail: readErr.message.slice(0, 160),
        picks: [],
        record: null,
        asOfDate: null,
      }, { status: 503 });
    }

    let rows = todayRows;
    let asOfDate = today;

    if (!rows || rows.length === 0) {
      const { data: latest } = await db
        .from("daily_picks")
        .select("run_date")
        .order("run_date", { ascending: false })
        .limit(1);
      const fallbackDate = latest?.[0]?.run_date ?? null;
      if (fallbackDate) {
        const { data: prior } = await db
          .from("daily_picks")
          .select("symbol, rank, direction, conviction, entry_price, as_of, horizon_days, why, outcome_date, outcome_price, return_pct, correct")
          .eq("run_date", fallbackDate)
          .order("rank", { ascending: true });
        rows = prior ?? [];
        asOfDate = fallbackDate;
      }
    }

    // Rank is renumbered from the row order rather than served as stored.
    // The stored value is assigned when a day's picks are written and becomes
    // wrong the moment one is removed — a lone survivor of a two-pick day came
    // back as "rank 2" with no rank 1, which would render as a broken list.
    // Ordering is what the rank describes, so deriving it from the ordering
    // cannot drift. The stored column stays as the historical record.
    const picks = (rows ?? []).map((r, i) => ({ ...asPick(r as Row), rank: i + 1 }));

    // The realised record across every graded pick — what these calls have
    // actually been worth, as distinct from what the backtest predicted.
    const { data: graded } = await db
      .from("daily_picks")
      // direction comes too: return_pct is the move in the underlying, so a
      // short that worked is negative, and averaging the raw numbers would
      // report a loss on exactly the calls that were right.
      .select("return_pct, correct, direction")
      .not("resolved_at", "is", null);

    const outcomes: PickOutcome[] = (graded ?? [])
      .filter(g => g.return_pct !== null && g.correct !== null)
      .map(g => ({
        returnPct: Number(g.return_pct),
        correct: Boolean(g.correct),
        direction: g.direction === "SELL" ? "SELL" : "BUY",
      }));

    const payload: Record<string, unknown> = {
      available: true,
      asOfDate,
      stale: asOfDate !== today,
      picks,
      record: trackRecord(outcomes),
    };

    // Empty is two different situations, and the caller cannot tell them apart
    // from an empty array. Either the job has not run, or it ran and nothing
    // cleared the certainty bar — the second is a real answer and the UI
    // should say so rather than looking broken.
    if (picks.length === 0) {
      payload.emptyReason = "no_run_yet";
      payload.hint = "The scheduled job has not produced picks for this date yet.";
    }

    if (history) {
      // The window is bounded because this table only grows, and the total
      // comes back alongside it so the screen can say WHICH window it is
      // showing. Serving 90 rows and letting the caller present them as the
      // complete record is the same defect this system keeps having to remove:
      // a truncated answer read as the whole answer.
      const { count: historyTotal } = await db
        .from("daily_picks")
        .select("symbol", { count: "exact", head: true });

      const { data: past } = await db
        .from("daily_picks")
        .select("run_date, symbol, rank, direction, conviction, entry_price, as_of, horizon_days, why, outcome_date, outcome_price, return_pct, correct")
        // Both keys. run_date alone is a partial order, so the picks inside a
        // single day come back in whatever arrangement the server chooses —
        // and that arrangement may differ between two requests for the same
        // data, which would shuffle the list under a reader.
        .order("run_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(HISTORY_LIMIT);

      payload.history = (past ?? []).map(r => ({ runDate: (r as Row & { run_date: string }).run_date, ...asPick(r as Row) }));
      payload.historyTotal = historyTotal ?? null;
      payload.historyLimit = HISTORY_LIMIT;
    }

    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("daily-picks read error:", err instanceof Error ? err.message : err);
    return Response.json({ available: false, picks: [], record: null, asOfDate: null }, { status: 503 });
  }
}
