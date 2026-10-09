// Leg-shape and freshness rules shared by the deterministic engine (which
// builds candidates) and the validator (which re-checks any output, from the
// engine or a model). Keeping one implementation means the two can't drift.

import type { AnalysisInput, InputContract, InputRules, OutputLegT, StrategyName } from "./schema";
import { freshnessBandFor } from "./rules";

export const STRATEGY_DIRECTION: Record<StrategyName, "BULLISH" | "BEARISH" | "NEUTRAL"> = {
  LONG_CALL: "BULLISH", BULL_CALL_SPREAD: "BULLISH", BULL_PUT_SPREAD: "BULLISH",
  LONG_PUT: "BEARISH", BEAR_PUT_SPREAD: "BEARISH", BEAR_CALL_SPREAD: "BEARISH",
  IRON_CONDOR: "NEUTRAL",
};

export const LONG_PREMIUM_SINGLE: ReadonlySet<StrategyName> = new Set(["LONG_CALL", "LONG_PUT"]);
export const DEBIT_SPREADS: ReadonlySet<StrategyName> = new Set(["BULL_CALL_SPREAD", "BEAR_PUT_SPREAD"]);
export const CREDIT_SPREADS: ReadonlySet<StrategyName> = new Set(["BULL_PUT_SPREAD", "BEAR_CALL_SPREAD"]);

type LegShape = { action: "BUY" | "SELL"; type: "CALL" | "PUT"; strike: number };

/** Leg actions/types/strike ordering per the policy's strategy table. Returns an error or null. */
export function checkLegShape(strategy: StrategyName, legs: LegShape[]): string | null {
  const sorted = [...legs].sort((a, b) => a.strike - b.strike);
  const sig = sorted.map(l => `${l.action}_${l.type}`).join(",");
  const strictlyAscending = sorted.every((l, i) => i === 0 || l.strike > sorted[i - 1].strike);
  const expect = (want: string, n: number) =>
    legs.length !== n ? `${strategy} needs ${n} legs, got ${legs.length}`
    : !strictlyAscending ? `${strategy} legs need distinct strikes`
    : sig !== want ? `${strategy} leg shape is ${sig}, expected ${want}`
    : null;

  switch (strategy) {
    case "LONG_CALL":        return expect("BUY_CALL", 1);
    case "LONG_PUT":         return expect("BUY_PUT", 1);
    case "BULL_CALL_SPREAD": return expect("BUY_CALL,SELL_CALL", 2);
    case "BEAR_PUT_SPREAD":  return expect("SELL_PUT,BUY_PUT", 2);
    case "BULL_PUT_SPREAD":  return expect("BUY_PUT,SELL_PUT", 2);
    case "BEAR_CALL_SPREAD": return expect("SELL_CALL,BUY_CALL", 2);
    case "IRON_CONDOR": {
      const err = expect("BUY_PUT,SELL_PUT,SELL_CALL,BUY_CALL", 4);
      if (err) return err;
      const putWidth = sorted[1].strike - sorted[0].strike;
      const callWidth = sorted[3].strike - sorted[2].strike;
      return Math.abs(putWidth - callWidth) > 1e-9 ? "IRON_CONDOR wing widths are not equal" : null;
    }
  }
}

/**
 * Per-leg freshness, recomputed from the quote timestamp itself rather than
 * trusting a precomputed flag. A missing quote_timestamp is UNKNOWN; a
 * last-trade time is never substituted (for CBOE the quote time is the
 * snapshot time minus its published delay — see payload.ts).
 */
export function legFreshness(c: Pick<InputContract, "quote_timestamp" | "dte">, asOf: string, rules: InputRules): {
  status: "FRESH" | "STALE" | "UNKNOWN"; age_seconds: number | null; max_age_seconds: number | null; basis: string;
} {
  const band = freshnessBandFor(c.dte, rules);
  const max = band?.max_quote_age_seconds ?? null;
  if (!c.quote_timestamp) {
    return { status: "UNKNOWN", age_seconds: null, max_age_seconds: max, basis: "No bid/ask timestamp supplied for this contract" };
  }
  if (max === null) {
    return { status: "UNKNOWN", age_seconds: null, max_age_seconds: null, basis: `No configured age limit for ${c.dte} DTE` };
  }
  const age = (Date.parse(asOf) - Date.parse(c.quote_timestamp)) / 1000;
  if (age < -rules.freshness.clock_tolerance_seconds) {
    return { status: "UNKNOWN", age_seconds: age, max_age_seconds: max, basis: "Quote timestamp is in the future beyond clock tolerance" };
  }
  return {
    status: age <= max ? "FRESH" : "STALE",
    age_seconds: Math.max(0, age),
    max_age_seconds: max,
    basis: "Bid/ask quote timestamp vs analysis time",
  };
}

/** Every per-leg requirement from G1/G2 plus configured liquidity. Returns failures tagged by gate. */
export function legProblems(
  c: InputContract | undefined, input: AnalysisInput, rules: InputRules, opts: { needsDelta: boolean },
): { gate: "G1_DATA" | "G2_FRESHNESS"; detail: string }[] {
  if (!c) return [{ gate: "G1_DATA", detail: "Contract not in supplied chain" }];
  const out: { gate: "G1_DATA" | "G2_FRESHNESS"; detail: string }[] = [];
  const id = c.contract_id;
  if (!c.spec) out.push({ gate: "G1_DATA", detail: `${id}: contract specification unknown` });
  else if (!c.spec.standard) out.push({ gate: "G1_DATA", detail: `${id}: nonstandard contract specification` });
  if (c.bid === null || c.ask === null || c.bid <= 0 || c.ask < c.bid) out.push({ gate: "G1_DATA", detail: `${id}: invalid or missing bid/ask` });
  if (c.iv === null) out.push({ gate: "G1_DATA", detail: `${id}: IV missing` });
  if (c.open_interest === null) out.push({ gate: "G1_DATA", detail: `${id}: open interest missing` });
  if (opts.needsDelta && c.delta === null) out.push({ gate: "G1_DATA", detail: `${id}: delta missing` });
  if (c.dte <= 0) out.push({ gate: "G2_FRESHNESS", detail: `${id}: contract expired` });

  if (c.open_interest !== null && c.open_interest < rules.liquidity.min_open_interest) {
    out.push({ gate: "G1_DATA", detail: `${id}: open interest below configured minimum` });
  }
  if (rules.liquidity.min_volume !== null && (c.volume === null || c.volume < rules.liquidity.min_volume)) {
    out.push({ gate: "G1_DATA", detail: `${id}: volume below configured minimum or missing` });
  }
  if (c.bid !== null && c.ask !== null && c.bid > 0 && c.ask >= c.bid) {
    const mid = (c.bid + c.ask) / 2;
    if ((c.ask - c.bid) / mid > rules.liquidity.max_spread_pct_of_mid) {
      out.push({ gate: "G1_DATA", detail: `${id}: bid/ask spread wider than configured maximum` });
    }
  }

  if (input.as_of) {
    const f = legFreshness(c, input.as_of, rules);
    if (f.status !== "FRESH") out.push({ gate: "G2_FRESHNESS", detail: `${id}: quote freshness ${f.status.toLowerCase()} (${f.basis})` });
  } else {
    out.push({ gate: "G2_FRESHNESS", detail: "Analysis timestamp missing" });
  }
  return out;
}

/** Oldest-to-newest quote gap across legs must stay within the configured sync limit. */
export function legSyncProblem(legs: InputContract[], rules: InputRules): string | null {
  const ts = legs.map(l => (l.quote_timestamp ? Date.parse(l.quote_timestamp) : NaN));
  if (ts.some(Number.isNaN)) return null; // already reported as missing freshness
  const spread = (Math.max(...ts) - Math.min(...ts)) / 1000;
  return spread > rules.freshness.max_leg_sync_seconds ? "Leg quotes are not synchronized within the configured limit" : null;
}

export function findContract(input: AnalysisInput, leg: Pick<OutputLegT, "contract_id">): InputContract | undefined {
  return input.contracts?.find(c => c.contract_id === leg.contract_id);
}
