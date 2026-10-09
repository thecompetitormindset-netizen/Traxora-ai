// Read-time gate between a stored analysis and the screen. An approved
// candidate is only shown as actionable if, at display time, the session is
// still open and the underlying and every selected leg are still within their
// freshness limits — v4.1 forbids presenting a cached candidate as current
// without refreshed checks. A rejected output is never shown at all.

import type { AnalysisInput, AnalysisOutput, InputContract } from "./schema";
import type { CandidatePricing } from "./pricing";
import type { Review } from "./validate";
import { findContract, legFreshness } from "./strategies";
import { etTradingDate, nyseSessionStatus } from "../marketTime";

export type StoredAnalysis = {
  symbol: string;
  as_of: string;
  input: AnalysisInput;
  output: AnalysisOutput | null;
  review_status: Review["status"];
  review_errors: string[];
  pricing: CandidatePricing | null;
};

export type DisplayAnalysis = {
  symbol: string;
  as_of: string;
  price: number | null;
  price_timestamp: string | null;
  price_timestamp_kind: AnalysisInput["underlying"]["price_timestamp_kind"];
  // vs the last completed session's close in the supplied bars; null if unknown
  change_pct: number | null;
  // PAPER_CANDIDATE: approved and still current — paper trading only.
  // STALE_CANDIDATE: was approved, no longer current; legs/pricing withheld.
  // UNAVAILABLE: output failed review; nothing from it is shown.
  status: "PAPER_CANDIDATE" | "STALE_CANDIDATE" | "NO_TRADE" | "UNAVAILABLE";
  output: AnalysisOutput | null;
  pricing: CandidatePricing | null;
  note: string | null;
};

export function currentProblem(row: StoredAnalysis, now: Date): string | null {
  const { input, output } = row;
  const rules = input.rules;
  if (!output?.proposed_structure || !rules) return "Candidate is incomplete";
  if (nyseSessionStatus(now).status !== "OPEN") return "Market session is no longer open";
  const nowIso = now.toISOString();
  const ts = input.underlying.price_timestamp;
  if (!ts || (now.getTime() - Date.parse(ts)) / 1000 > rules.freshness.max_underlying_age_seconds) {
    return "Underlying price is no longer fresh";
  }
  for (const leg of output.proposed_structure.legs) {
    const c = findContract(input, leg);
    if (!c || legFreshness(c, nowIso, rules).status !== "FRESH") return `Quote for ${leg.contract_id} is no longer fresh`;
  }
  return null;
}

function changePct(input: AnalysisInput): number | null {
  const price = input.underlying.price;
  if (price === null || !input.as_of || !input.bars) return null;
  const today = etTradingDate(new Date(input.as_of));
  const prev = [...input.bars].reverse().find(b => b.date < today);
  return prev && prev.close > 0 ? ((price - prev.close) / prev.close) * 100 : null;
}

export function toDisplay(row: StoredAnalysis, now: Date = new Date()): DisplayAnalysis {
  const u = row.input.underlying;
  const base = {
    symbol: row.symbol, as_of: row.as_of, price: u.price,
    price_timestamp: u.price_timestamp, price_timestamp_kind: u.price_timestamp_kind,
    change_pct: changePct(row.input),
  };
  switch (row.review_status) {
    case "REJECTED":
      return { ...base, status: "UNAVAILABLE", output: null, pricing: null, note: "Analysis failed application checks and is not shown." };
    case "NO_TRADE":
      return { ...base, status: "NO_TRADE", output: row.output, pricing: null, note: null };
    case "APPROVED_CANDIDATE": {
      const problem = currentProblem(row, now);
      return problem
        ? { ...base, status: "STALE_CANDIDATE", output: null, pricing: null, note: `${problem} — needs a fresh run before it can be shown.` }
        : { ...base, status: "PAPER_CANDIDATE", output: row.output, pricing: row.pricing, note: null };
    }
  }
}

// ── Research detail (one symbol) ────────────────────────────────────────────────

export type ResearchLeg = Pick<
  InputContract,
  "contract_id" | "type" | "strike" | "expiry" | "dte" | "bid" | "ask" | "quote_timestamp" | "last_trade_timestamp"
  | "iv" | "delta" | "open_interest" | "volume" | "freshness" | "spec"
> & { action: "BUY" | "SELL"; quantity: 1 };

export type ResearchDetail = {
  display: DisplayAnalysis;
  // An approved candidate that is no longer current, kept as a historical
  // observation: thesis, levels and legs are shown, pricing and actions are not.
  historical: AnalysisOutput | null;
  session: AnalysisInput["session"];
  underlying: AnalysisInput["underlying"];
  bars: AnalysisInput["bars"];
  levels: AnalysisInput["levels"];
  signals: AnalysisInput["signals"];
  volatility: AnalysisInput["volatility"];
  expiries: NonNullable<AnalysisInput["expiries"]>;
  legs: ResearchLeg[] | null;
  sources: AnalysisInput["sources"];
  rules: {
    review_dte: number | null; min_swing_dte: number; max_swing_dte: number;
    max_underlying_age_seconds: number; min_open_interest: number; max_spread_pct_of_mid: number;
  } | null;
  user_supplied: boolean;
};

export function toResearch(row: StoredAnalysis, now: Date = new Date(), opts: { userSupplied?: boolean } = {}): ResearchDetail {
  const display = toDisplay(row, now);
  const { input } = row;
  const historical = display.status === "STALE_CANDIDATE" ? row.output : null;
  const structure = (display.status === "PAPER_CANDIDATE" ? display.output : historical)?.proposed_structure ?? null;
  const legs: ResearchLeg[] | null = structure
    ? structure.legs.flatMap(l => {
      const c = findContract(input, l);
      return c ? [{
        contract_id: c.contract_id, action: l.action, quantity: 1 as const, type: c.type, strike: c.strike, expiry: c.expiry,
        dte: c.dte, bid: c.bid, ask: c.ask, quote_timestamp: c.quote_timestamp, last_trade_timestamp: c.last_trade_timestamp,
        iv: c.iv, delta: c.delta, open_interest: c.open_interest, volume: c.volume, freshness: c.freshness, spec: c.spec,
      }] : [];
    })
    : null;
  const r = input.rules;
  return {
    display,
    historical,
    session: input.session,
    underlying: input.underlying,
    bars: input.bars,
    levels: input.levels,
    signals: input.signals,
    volatility: input.volatility,
    expiries: input.expiries ?? [],
    legs,
    sources: input.sources,
    rules: r ? {
      review_dte: r.review_dte, min_swing_dte: r.min_swing_dte, max_swing_dte: r.max_swing_dte,
      max_underlying_age_seconds: r.freshness.max_underlying_age_seconds,
      min_open_interest: r.liquidity.min_open_interest, max_spread_pct_of_mid: r.liquidity.max_spread_pct_of_mid,
    } : null,
    user_supplied: opts.userSupplied ?? false,
  };
}
