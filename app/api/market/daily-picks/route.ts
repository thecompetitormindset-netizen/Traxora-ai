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

    const picks = (rows ?? []).map(r => asPick(r as Row));

    // The realised record across every graded pick — what these calls have
    // actually been worth, as distinct from what the backtest predicted.
    const { data: graded } = await db
      .from("daily_picks")
      .select("return_pct, correct")
      .not("resolved_at", "is", null);

    const outcomes: PickOutcome[] = (graded ?? [])
      .filter(g => g.return_pct !== null && g.correct !== null)
      .map(g => ({ returnPct: Number(g.return_pct), correct: Boolean(g.correct) }));

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
      const { data: past } = await db
        .from("daily_picks")
        .select("run_date, symbol, rank, direction, conviction, entry_price, as_of, horizon_days, why, outcome_date, outcome_price, return_pct, correct")
        .order("run_date", { ascending: false })
        .limit(90);
      payload.history = (past ?? []).map(r => ({ runDate: (r as Row & { run_date: string }).run_date, ...asPick(r as Row) }));
    }

    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("daily-picks read error:", err instanceof Error ? err.message : err);
    return Response.json({ available: false, picks: [], record: null, asOfDate: null }, { status: 503 });
  }
}
