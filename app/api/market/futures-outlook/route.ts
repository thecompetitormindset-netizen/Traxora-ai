export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { viewer } from "@/app/lib/viewer";
import { supabaseConfigured } from "@/app/lib/supabase";
import { barsForMany, MIN_HISTORY_SESSIONS } from "@/app/lib/barsStore";
import { futuresMarkets, type FuturesMarket, type FuturesSpec } from "@/app/lib/futuresContracts";
import { evaluate } from "@/app/api/cron/daily-picks/route";
import { scoreCandidate, MIN_BACKTEST_SAMPLE } from "@/app/lib/dailyPicks";
import { leanFromScore, leanWords, type LeanStrength } from "@/app/lib/futuresLean";

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

/** One tradeable size of a market: the full contract, or its micro. */
export type ContractSize = {
  symbol: string;
  label: string;
  size: "standard" | "micro";
  unit: string;
  multiplier: number;
  tickValue: number;
  initialMargin: number;
  /** For a micro, the fraction of the full contract it represents. */
  fraction: number | null;
};

export type FuturesRow = {
  symbol: string;
  name: string;
  proxyEtf: string;
  proxyCaveat: string;
  /** Full size first, micro second where one exists. */
  sizes: ContractSize[];
  /** Which way the evidence points. Null only when it points nowhere at all. */
  direction: "BUY" | "SELL" | null;
  /** How hard it leans, on the scorer's own 0-10 scale. */
  strength: number | null;
  /** That strength in plain words, so a weak lean reads as weak. */
  strengthLabel: LeanStrength | null;
  /** Whether the lean clears the bar for a fund. */
  clearsBar: boolean;
  /** "Leaning up" / "Leaning down". */
  leanWords: string | null;
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

  const markets = futuresMarkets();

  let bars;
  try {
    bars = await barsForMany([...new Set(markets.map(m => m.standard.proxyEtf))], MIN_HISTORY_SESSIONS);
  } catch (err) {
    return Response.json({
      available: false,
      reason: "store_unavailable",
      hint: "Could not read the stored bars. /api/cron/bars-sync fills them.",
      detail: err instanceof Error ? err.message.slice(0, 160) : "query failed",
      rows: [],
    }, { status: 503 });
  }

  const asSize = (spec: FuturesSpec): ContractSize => ({
    symbol: spec.symbol,
    label: spec.size === "micro" ? "Micro" : "Full size",
    size: spec.size,
    unit: spec.unit,
    multiplier: spec.multiplier,
    tickValue: spec.tickSize * spec.multiplier,
    initialMargin: spec.initialMargin,
    fraction: spec.fraction ?? null,
  });

  const rows: FuturesRow[] = markets.map((market: FuturesMarket) => {
    const spec = market.standard;
    const base = {
      symbol: spec.symbol,
      name: spec.name,
      proxyEtf: spec.proxyEtf,
      proxyCaveat: spec.proxyCaveat,
      sizes: market.micro ? [asSize(spec), asSize(market.micro)] : [asSize(spec)],
      direction: null,
      strength: null,
      strengthLabel: null,
      clearsBar: false,
      leanWords: null,
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

    // allowNeutral: a broad fund sits inside the scorer's HOLD band most days,
    // and reporting nothing there discards a real if slight tilt rather than
    // finding none.
    const candidate = evaluate(spec.proxyEtf, series, new Set<string>(), { allowNeutral: true });
    if (!candidate) {
      return { ...base, note: `${spec.proxyEtf} is flat today — the evidence points neither way.` };
    }

    const lean = leanFromScore(candidate.score ?? 0, "fund");

    const scored = scoreCandidate(candidate);
    const edge = scored.backtest.avgReturn !== null && scored.backtest.baselineAvgReturn !== null
      ? (candidate.direction === "BUY"
          ? scored.backtest.avgReturn - scored.backtest.baselineAvgReturn
          : scored.backtest.baselineAvgReturn - scored.backtest.avgReturn)
      : null;

    return {
      ...base,
      direction: candidate.direction,
      strength: lean.strength,
      strengthLabel: lean.label,
      clearsBar: lean.clearsBar,
      leanWords: leanWords(lean),
      hitRate: scored.backtest.count >= MIN_BACKTEST_SAMPLE ? scored.backtest.hitRate : null,
      sample: scored.backtest.count,
      edge: edge === null ? null : Math.round(edge * 10) / 10,
      conviction: scored.rejected === null ? scored.conviction : null,
      why: scored.why,
      // The direction is always shown now, so this note explains what the
      // measurement could NOT establish rather than why there is no call.
      note: scored.backtest.count < MIN_BACKTEST_SAMPLE
        ? `Only ${scored.backtest.count} past signals like this (${MIN_BACKTEST_SAMPLE} needed) — not enough to say how often it works.`
        : scored.rejected,
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
