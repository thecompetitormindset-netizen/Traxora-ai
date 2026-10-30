export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { viewer } from "@/app/lib/viewer";
import { supabaseConfigured } from "@/app/lib/supabase";
import { barsForMany, MIN_HISTORY_SESSIONS } from "@/app/lib/barsStore";
import { allFutures, type FuturesSpec } from "@/app/lib/futuresContracts";
import { evaluate } from "@/app/api/cron/daily-picks/route";
import { scoreCandidate, MIN_BACKTEST_SAMPLE } from "@/app/lib/dailyPicks";

// A measured read on each futures market, taken on a fund that tracks it.
//
// There is no free source of futures history. Polygon's free tier is US stocks
// and ETFs, Finnhub's excludes futures entirely, and Yahoo is the source whose
// throttling caused this project's original data outage. So a signal measured
// directly on CL or ES would be measured on data nobody here can stand behind.
//
// What IS in the stored bars is the fund that tracks each market — USO for
// crude, GLD for gold, SPY for the S&P — because those are ordinary US-listed
// securities and already clear the universe's liquidity filters. Scoring runs
// against those, using exactly the machinery the daily picks use: the same
// signal, the same walk-forward backtest, the same sample floor below which a
// hit rate is refused.
//
// The proxy is NOT the contract, and every row says which fund it was measured
// on and how the two can come apart. A fund that rolls futures pays the roll;
// in contango that cost is real and the spot price never shows it. Presenting
// a USO signal as a crude signal without saying so would be the same category
// of error as every other one this codebase has had to remove.

export type FuturesRow = {
  symbol: string;
  name: string;
  proxyEtf: string;
  proxyCaveat: string;
  unit: string;
  multiplier: number;
  tickValue: number;
  initialMargin: number;
  /** Null when the proxy has no directional signal today, or too little history. */
  direction: "BUY" | "SELL" | null;
  /** Null until the backtest has enough occurrences to mean anything. */
  hitRate: number | null;
  sample: number;
  /** Points better than doing nothing, in the direction asserted. */
  edge: number | null;
  conviction: number | null;
  why: string[];
  /** Why there is no call today, in plain words. */
  note: string | null;
};

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (!supabaseConfigured()) {
    return Response.json(
      { available: false, reason: "not_configured", hint: "This install has no database connection, so there is nothing stored to measure against.", rows: [] },
      { status: 200 },
    );
  }

  const specs = allFutures();

  let bars;
  try {
    bars = await barsForMany(specs.map(s => s.proxyEtf), MIN_HISTORY_SESSIONS);
  } catch (err) {
    return Response.json({
      available: false,
      reason: "store_unavailable",
      hint: "Could not read the stored bars. /api/cron/bars-sync fills them.",
      detail: err instanceof Error ? err.message.slice(0, 160) : "query failed",
      rows: [],
    }, { status: 503 });
  }

  const rows: FuturesRow[] = specs.map((spec: FuturesSpec) => {
    const base = {
      symbol: spec.symbol,
      name: spec.name,
      proxyEtf: spec.proxyEtf,
      proxyCaveat: spec.proxyCaveat,
      unit: spec.unit,
      multiplier: spec.multiplier,
      tickValue: spec.tickSize * spec.multiplier,
      initialMargin: spec.initialMargin,
      direction: null,
      hitRate: null,
      sample: 0,
      edge: null,
      conviction: null,
      why: [] as string[],
    };

    const series = bars.get(spec.proxyEtf);
    if (!series) {
      // Not enough stored history yet. Saying so beats showing a blank row
      // that reads as "no opportunity".
      return { ...base, note: `Not enough stored history for ${spec.proxyEtf} yet — ${MIN_HISTORY_SESSIONS} sessions are needed before a hit rate means anything.` };
    }

    const candidate = evaluate(spec.proxyEtf, series, new Set<string>());
    if (!candidate) {
      return { ...base, note: `No directional signal on ${spec.proxyEtf} today. Waiting is a real answer.` };
    }

    const scored = scoreCandidate(candidate);
    const edge = scored.backtest.avgReturn !== null && scored.backtest.baselineAvgReturn !== null
      ? (candidate.direction === "BUY"
          ? scored.backtest.avgReturn - scored.backtest.baselineAvgReturn
          : scored.backtest.baselineAvgReturn - scored.backtest.avgReturn)
      : null;

    return {
      ...base,
      direction: candidate.direction,
      hitRate: scored.backtest.count >= MIN_BACKTEST_SAMPLE ? scored.backtest.hitRate : null,
      sample: scored.backtest.count,
      edge: edge === null ? null : Math.round(edge * 10) / 10,
      conviction: scored.rejected === null ? scored.conviction : null,
      why: scored.why,
      note: scored.rejected,
    };
  });

  return Response.json({
    available: true,
    measuredOn: "proxy_etf",
    rows,
    disclaimer:
      "Measured on US-listed funds that track each market, because no free source carries futures history. " +
      "A fund is not the contract: those holding futures roll them, and in contango that roll costs money the spot price never shows.",
  }, { headers: { "Cache-Control": "no-store" } });
}
