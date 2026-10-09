// v4.1 options analysis contracts. One zod definition per contract is the
// single source for the TypeScript types, runtime validation, and (for an
// explicitly enabled model run) the JSON Schema sent as the output format.
// Every object is strict: unknown keys fail validation instead of being dropped.

import { z } from "zod";

export const SCHEMA_VERSION = "4.1" as const;

const isoTimestamp = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const num = z.number().finite();

// ── Input (application → analyst) ───────────────────────────────────────────────

export const FreshnessStatus = z.enum(["FRESH", "STALE", "UNKNOWN"]);

const Freshness = z.strictObject({
  status: FreshnessStatus,
  age_seconds: num.nullable(),
  max_age_seconds: num.nullable(),
  basis: z.string(),   // what the age was measured against, in words
});

const Level = z.strictObject({ price: num, label: z.string() });

export const SignalKind = z.enum(["STRUCTURE", "POSITIONING", "VOLATILITY", "MODEL", "SENTIMENT", "ACTIVITY"]);
export const Direction = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);

const InputSignal = z.strictObject({
  name: z.string(),
  kind: SignalKind,
  reading: z.string(),
  direction: Direction.nullable(),  // null = non-directional or unknown
  source: z.string(),
});

const ContractSpec = z.strictObject({
  multiplier: num,
  deliverable: z.string(),
  exercise_style: z.enum(["AMERICAN", "EUROPEAN"]),
  settlement: z.enum(["PHYSICAL", "CASH"]),
  standard: z.boolean(),
});

export const InputContract = z.strictObject({
  contract_id: z.string(),
  type: z.enum(["CALL", "PUT"]),
  strike: num,
  expiry: isoDate,
  dte: z.number().int(),
  spec: ContractSpec.nullable(),
  bid: num.nullable(),
  ask: num.nullable(),
  // Time of the bid/ask itself (for a delayed snapshot: snapshot time minus the
  // published delay). A last-trade time never goes here.
  quote_timestamp: isoTimestamp.nullable(),
  last_trade_timestamp: isoTimestamp.nullable(),
  iv: num.nullable(),
  delta: num.nullable(),
  open_interest: z.number().int().nullable(),
  volume: z.number().int().nullable(),
  freshness: Freshness,
});

const ExpectedMove = z.strictObject({
  expiry: isoDate,
  amount: num,
  lower: num,
  upper: num,
  method: z.string(),
});

const CalendarEvent = z.strictObject({ type: z.enum(["EARNINGS"]), date: isoDate, name: z.string() });

const InputExpiry = z.strictObject({
  expiry: isoDate,
  dte: z.number().int(),
  expected_move: ExpectedMove.nullable(),
  event_coverage: z.strictObject({
    status: z.enum(["VERIFIED", "UNKNOWN"]),
    covered_through: isoDate.nullable(),
    events: z.array(CalendarEvent),
  }),
});

const Bar = z.strictObject({ date: isoDate, open: num, high: num, low: num, close: num, volume: num.nullable() });

const Rules = z.strictObject({
  rules_version: z.string(),
  min_swing_dte: z.number().int(),
  max_swing_dte: z.number().int(),
  review_dte: z.number().int().nullable(),
  approved_exit_dates: z.array(isoDate),
  freshness: z.strictObject({
    bands: z.array(z.strictObject({ min_dte: z.number().int(), max_dte: z.number().int().nullable(), max_quote_age_seconds: num })),
    max_underlying_age_seconds: num,
    max_leg_sync_seconds: num,
    clock_tolerance_seconds: num,
  }),
  liquidity: z.strictObject({
    min_open_interest: z.number().int(),
    min_volume: z.number().int().nullable(),
    max_spread_pct_of_mid: num,
  }),
  debit_long_leg_abs_delta: z.strictObject({ min: num, max: num }),
});

const RiskLabel = z.enum(["LOW", "MODERATE", "HIGH"]);

export const AnalysisInput = z.strictObject({
  schema_version: z.literal(SCHEMA_VERSION),
  symbol: z.string().nullable(),
  as_of: isoTimestamp.nullable(),
  paper_trading_only: z.boolean().nullable(),
  session: z.strictObject({
    status: z.enum(["OPEN", "CLOSED", "UNKNOWN"]),
    calendar: z.string(),
    early_close: z.boolean(),
    detail: z.string(),
  }),
  underlying: z.strictObject({
    price: num.nullable(),
    price_timestamp: isoTimestamp.nullable(),
    price_timestamp_kind: z.enum(["LAST_TRADE", "QUOTE"]).nullable(),
    source: z.string(),
    freshness: Freshness,
  }),
  bars: z.array(Bar).nullable(),
  levels: z.strictObject({
    support: z.array(Level).nullable(),
    resistance: z.array(Level).nullable(),
    liquidity_targets: z.array(Level).nullable(),
  }),
  signals: z.array(InputSignal),
  volatility: z.strictObject({
    iv_rank: num.nullable(),
    iv_rank_basis: z.string().nullable(),
    iv30: num.nullable(),
    hv20: num.nullable(),
  }),
  expiries: z.array(InputExpiry).nullable(),
  contracts: z.array(InputContract).nullable(),
  rules: Rules.nullable(),
  risk_classification: RiskLabel.nullable(),
  user_context: z.strictObject({
    experience: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
    request: z.string().nullable(),
  }).nullable(),
  sources: z.array(z.strictObject({ name: z.string(), snapshot_timestamp: isoTimestamp.nullable(), note: z.string() })),
});

export type AnalysisInput = z.infer<typeof AnalysisInput>;
export type InputContract = z.infer<typeof InputContract>;
export type InputExpiry = z.infer<typeof InputExpiry>;
export type InputSignal = z.infer<typeof InputSignal>;
export type InputLevel = z.infer<typeof Level>;
export type InputRules = NonNullable<AnalysisInput["rules"]>;

// ── Output (analyst → application) ──────────────────────────────────────────────

export const Strategy = z.enum([
  "LONG_CALL", "LONG_PUT", "BULL_CALL_SPREAD", "BEAR_PUT_SPREAD",
  "BULL_PUT_SPREAD", "BEAR_CALL_SPREAD", "IRON_CONDOR",
]);

export const NoTradeCode = z.enum([
  "G1_DATA", "G2_FRESHNESS", "G3_SESSION", "G4_EVENT", "G6_UNSUPPORTED", "G7_EXIT",
  "WELLBEING", "CONFLICTING_SIGNALS", "LOW_CHECKLIST", "NO_EDGE",
]);

export const CHECKLIST_ORDER = [
  "STRUCTURE", "TARGET", "VOLATILITY", "LEG_DATA", "POSITIONING", "INVALIDATION", "EVENT_TIME",
] as const;
export const ChecklistItem = z.enum(CHECKLIST_ORDER);

const OutputLeg = z.strictObject({
  contract_id: z.string(),
  action: z.enum(["BUY", "SELL"]),
  type: z.enum(["CALL", "PUT"]),
  strike: num,
  expiry: isoDate,
  quantity: z.literal(1),
});

export const AnalysisOutput = z.strictObject({
  schema_version: z.literal(SCHEMA_VERSION),
  symbol: z.string().nullable(),
  as_of: isoTimestamp.nullable(),
  paper_trading_only: z.boolean().nullable(),
  canonical_direction: Direction,
  trade_decision: z.enum(["TRADE", "NO_TRADE"]),
  no_trade_reason: z.strictObject({ code: NoTradeCode, detail: z.string() }).nullable(),
  confidence_band: z.enum(["LOW", "MODERATE", "HIGH"]),
  risk_label: RiskLabel.nullable(),
  regime: z.string().nullable(),
  thesis: z.string(),
  key_levels: z.strictObject({
    support: z.array(num).nullable(),
    resistance: z.array(num).nullable(),
    liquidity_targets: z.array(num).nullable(),
    invalidation: z.strictObject({
      lower_price: num.nullable(),
      upper_price: num.nullable(),
      condition: z.string(),
    }).nullable(),
  }),
  volatility: z.strictObject({
    iv_rank: num.nullable(),
    iv_vs_hv: z.string().nullable(),
    expected_move: ExpectedMove.nullable(),
  }),
  proposed_structure: z.strictObject({
    strategy: Strategy,
    legs: z.array(OutputLeg),
    profit_plan: z.strictObject({ target_level: num.nullable(), note: z.string() }),
    time_rule: z.strictObject({
      type: z.enum(["REVIEW_AT_DTE", "EXIT_BY_DATE"]),
      dte: z.number().int().nullable(),
      date: isoDate.nullable(),
    }),
  }).nullable(),
  signals_breakdown: z.array(z.strictObject({
    signal: z.string(),
    reading: z.string(),
    supports_direction: z.boolean().nullable(),
    evidence: z.enum(["PROVIDED", "INFERRED"]),
  })),
  checklist: z.array(z.strictObject({
    item: ChecklistItem,
    result: z.enum(["PASS", "FAIL"]),
    reason: z.string(),
  })),
  risks: z.array(z.string()),
  data_gaps: z.array(z.string()),
  user_note: z.string(),
  disclaimer: z.string(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutput>;
export type StrategyName = z.infer<typeof Strategy>;
export type NoTradeCodeName = z.infer<typeof NoTradeCode>;
export type ChecklistEntry = AnalysisOutput["checklist"][number];
export type OutputLegT = z.infer<typeof OutputLeg>;

export const DISCLAIMER_EN =
  "Educational analysis, not financial advice. Options involve risk of loss, including the full amount invested.";

// For an explicitly enabled model run only (structured output format).
export function analysisOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AnalysisOutput, { target: "draft-2020-12" }) as Record<string, unknown>;
}
