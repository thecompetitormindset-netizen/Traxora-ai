// Synthetic validator fixtures — not market data, not examples for a model.
// A clean bullish setup at spot 100 where every gate passes; tests mutate a
// copy to exercise one gate at a time.

import type { AnalysisInput, InputContract } from "../schema";
import { OPTIONS_RULES, PAPER_TRADING_ONLY } from "../rules";
import { legFreshness } from "../strategies";

export const AS_OF = "2026-10-08T15:00:00.000Z";       // Thu 11:00 ET, regular session
export const EXPIRY = "2026-11-06";                     // 29 DTE
const QUOTE_TS = "2026-10-08T14:59:00.000Z";

type Row = [type: "CALL" | "PUT", strike: number, bid: number, ask: number, delta: number];
const ROWS: Row[] = [
  ["CALL", 95, 6.40, 6.60, 0.72], ["CALL", 100, 3.00, 3.10, 0.52], ["CALL", 105, 1.50, 1.58, 0.33],
  ["CALL", 110, 0.80, 0.86, 0.18], ["CALL", 115, 0.40, 0.43, 0.09], ["CALL", 120, 0.20, 0.21, 0.04],
  ["PUT", 80, 0.20, 0.21, -0.04], ["PUT", 85, 0.40, 0.43, -0.08], ["PUT", 90, 0.75, 0.80, -0.15],
  ["PUT", 95, 1.40, 1.48, -0.29], ["PUT", 100, 2.90, 3.00, -0.48], ["PUT", 105, 5.60, 5.80, -0.68],
];

export function contract(type: "CALL" | "PUT", strike: number, bid: number, ask: number, delta: number): InputContract {
  const id = `XYZ261106${type[0]}${String(strike * 1000).padStart(8, "0")}`;
  const c = {
    contract_id: id, type, strike, expiry: EXPIRY, dte: 29,
    spec: { multiplier: 100, deliverable: "100 shares of XYZ", exercise_style: "AMERICAN" as const, settlement: "PHYSICAL" as const, standard: true },
    bid, ask, quote_timestamp: QUOTE_TS, last_trade_timestamp: QUOTE_TS,
    iv: 0.3, delta, open_interest: 1500, volume: 200,
  };
  return { ...c, freshness: legFreshness(c, AS_OF, OPTIONS_RULES) };
}

export function cleanBullishInput(): AnalysisInput {
  return {
    schema_version: "4.1",
    symbol: "XYZ",
    as_of: AS_OF,
    paper_trading_only: PAPER_TRADING_ONLY,
    session: { status: "OPEN", calendar: "NYSE", early_close: false, detail: "Regular session" },
    underlying: {
      price: 100, price_timestamp: "2026-10-08T14:55:00.000Z", price_timestamp_kind: "LAST_TRADE", source: "fixture",
      freshness: { status: "FRESH", age_seconds: 300, max_age_seconds: 1200, basis: "fixture" },
    },
    bars: null,
    levels: {
      support: [{ price: 95, label: "Swing low" }, { price: 92, label: "Swing low" }],
      resistance: [{ price: 108, label: "Swing high" }, { price: 112, label: "Swing high" }],
      liquidity_targets: [{ price: 110, label: "20-session high" }, { price: 90, label: "20-session low" }],
    },
    signals: [
      { name: "EMA_STACK", kind: "STRUCTURE", reading: "Stacked upward", direction: "BULLISH", source: "fixture" },
      { name: "TREND_5D", kind: "STRUCTURE", reading: "+2.0%", direction: "BULLISH", source: "fixture" },
      { name: "TREND_20D", kind: "STRUCTURE", reading: "+5.0%", direction: "BULLISH", source: "fixture" },
      { name: "VOLUME_ACTIVITY", kind: "ACTIVITY", reading: "1.1x average", direction: null, source: "fixture" },
    ],
    volatility: { iv_rank: 30, iv_rank_basis: "fixture", iv30: 28, hv20: 25 },
    expiries: [{
      expiry: EXPIRY, dte: 29,
      expected_move: { expiry: EXPIRY, amount: 6, lower: 94, upper: 106, method: "fixture" },
      event_coverage: { status: "VERIFIED", covered_through: "2027-01-04", events: [] },
    }],
    contracts: ROWS.map(r => contract(...r)),
    rules: structuredClone(OPTIONS_RULES),
    risk_classification: null,
    user_context: null,
    sources: [],
  };
}
