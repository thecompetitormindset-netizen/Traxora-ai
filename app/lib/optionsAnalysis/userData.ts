// User-supplied market data → v4.1 analysis input. The user provides
// observations (prices, quotes and their times, contract terms, bars, event
// coverage); everything else — analysis time, session, rules, freshness,
// expected move, paper restriction — is set by the server and cannot be
// overridden. The data is checked for internal consistency only; it is not
// independently verified, and results are never persisted or shared.

import { z } from "zod";
import { AnalysisInput, SCHEMA_VERSION, type InputContract, type InputExpiry } from "./schema";
import { OPTIONS_RULES, PAPER_TRADING_ONLY, type OptionsRules } from "./rules";
import { legFreshness } from "./strategies";
import { calcRealizedVol20, deriveLevels, deriveSignals, expectedMoveFor, type DailyBar } from "./payload";
import { etTradingDate, nyseSessionStatus } from "../marketTime";

const isoTs = z.iso.datetime({ offset: true, message: "Use an ISO time with zone, e.g. 2026-10-08T14:59:00Z" });
const isoDay = z.iso.date({ message: "Use a date like 2026-11-06" });
const positive = z.number({ message: "Must be a number" }).finite().positive({ message: "Must be greater than zero" });
const nonNeg = z.number({ message: "Must be a number" }).finite().nonnegative({ message: "Cannot be negative" });

export const USER_SUPPLIED_SOURCE = "User-supplied data";

export const UserSuppliedData = z.strictObject({
  symbol: z.string().regex(/^[A-Z]{1,5}(\.[A-Z])?$/, { message: "Use 1–5 capital letters, e.g. AAPL" }),
  underlying: z.strictObject({
    price: positive,
    price_time: isoTs,
    price_time_kind: z.enum(["LAST_TRADE", "QUOTE"], { message: "Use LAST_TRADE or QUOTE" }),
  }),
  // Consistency checks live on each object so they report alongside field
  // errors elsewhere (a root-level refinement is skipped while any field fails).
  bars: z.array(z.strictObject({
    date: isoDay, open: positive, high: positive, low: positive, close: positive, volume: nonNeg.nullable().optional(),
  }).superRefine((b, ctx) => {
    if (b.high < b.low) ctx.addIssue({ code: "custom", path: ["high"], message: "High is below low" });
    else if (b.open > b.high || b.open < b.low || b.close > b.high || b.close < b.low) {
      ctx.addIssue({ code: "custom", path: [], message: "Open and close must sit between low and high" });
    }
  })).max(400, { message: "At most 400 daily bars" }).optional(),
  levels: z.strictObject({
    support: z.array(positive).max(10),
    resistance: z.array(positive).max(10),
  }).optional(),
  contracts: z.array(z.strictObject({
    contract_id: z.string().min(1, { message: "Required" }).max(40),
    type: z.enum(["CALL", "PUT"], { message: "Use CALL or PUT" }),
    strike: positive,
    expiry: isoDay,
    bid: nonNeg,
    ask: nonNeg,
    quote_time: isoTs.nullable(),
    iv: nonNeg.nullable(),
    delta: z.number({ message: "Must be a number" }).min(-1).max(1).nullable(),
    open_interest: z.number().int({ message: "Whole number" }).nonnegative().nullable(),
    volume: z.number().int({ message: "Whole number" }).nonnegative().nullable(),
    multiplier: positive,
    exercise_style: z.enum(["AMERICAN", "EUROPEAN"], { message: "Use AMERICAN or EUROPEAN" }),
    settlement: z.enum(["PHYSICAL", "CASH"], { message: "Use PHYSICAL or CASH" }),
  }).superRefine((c, ctx) => {
    if (c.ask < c.bid) ctx.addIssue({ code: "custom", path: ["ask"], message: "Ask is below bid" });
  })).min(1, { message: "Add at least one option contract" }).max(400, { message: "At most 400 contracts" }),
  events: z.strictObject({
    covered_through: isoDay.nullable(),
    earnings_dates: z.array(isoDay).max(20),
  }),
}).superRefine((d, ctx) => {
  const ids = new Set<string>();
  d.contracts.forEach((c, i) => {
    if (ids.has(c.contract_id)) ctx.addIssue({ code: "custom", path: ["contracts", i, "contract_id"], message: "Duplicate contract ID" });
    ids.add(c.contract_id);
  });
});

export type UserSuppliedData = z.infer<typeof UserSuppliedData>;
export type FieldIssue = { path: string; message: string };

export function parseUserData(raw: unknown): { ok: true; data: UserSuppliedData } | { ok: false; issues: FieldIssue[] } {
  const r = UserSuppliedData.safeParse(raw);
  return r.success
    ? { ok: true, data: r.data }
    : { ok: false, issues: r.error.issues.slice(0, 50).map(i => ({ path: i.path.join(".") || "(root)", message: i.message })) };
}

/** Times later than the analysis clock (beyond tolerance) are inconsistent, not just stale. */
export function futureTimeIssues(d: UserSuppliedData, asOf: string, rules: OptionsRules = OPTIONS_RULES): FieldIssue[] {
  const limit = Date.parse(asOf) + rules.freshness.clock_tolerance_seconds * 1000;
  const out: FieldIssue[] = [];
  if (Date.parse(d.underlying.price_time) > limit) out.push({ path: "underlying.price_time", message: "This time is in the future" });
  d.contracts.forEach((c, i) => {
    if (c.quote_time && Date.parse(c.quote_time) > limit) out.push({ path: `contracts.${i}.quote_time`, message: "This time is in the future" });
  });
  return out;
}

export function buildUserInput(d: UserSuppliedData, asOf: string, rules: OptionsRules = OPTIONS_RULES): AnalysisInput {
  const today = etTradingDate(new Date(asOf));
  const days = (to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  const price = d.underlying.price;

  const bars: DailyBar[] | null = d.bars?.length
    ? [...d.bars].sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ ...b, volume: b.volume ?? null }))
    : null;

  const contractsBase = d.contracts.map(c => {
    const standard = c.multiplier === 100 && c.exercise_style === "AMERICAN" && c.settlement === "PHYSICAL";
    return {
      contract_id: c.contract_id, type: c.type, strike: c.strike, expiry: c.expiry, dte: days(c.expiry),
      spec: {
        multiplier: c.multiplier,
        deliverable: standard ? `100 shares of ${d.symbol}` : "As stated by user",
        exercise_style: c.exercise_style, settlement: c.settlement, standard,
      },
      bid: c.bid, ask: c.ask, quote_timestamp: c.quote_time, last_trade_timestamp: null,
      iv: c.iv, delta: c.delta, open_interest: c.open_interest, volume: c.volume,
    };
  });
  const contracts: InputContract[] = contractsBase.map(c => ({ ...c, freshness: legFreshness(c, asOf, rules) }));

  const expiries: InputExpiry[] = [...new Set(contracts.map(c => c.expiry))].sort().map(expiry => {
    const covered = d.events.covered_through;
    const events = d.events.earnings_dates
      .filter(e => e >= today && e <= expiry)
      .map(date => ({ type: "EARNINGS" as const, date, name: `${d.symbol} earnings (user-supplied)` }));
    return {
      expiry,
      dte: days(expiry),
      expected_move: expectedMoveFor(contractsBase, expiry, price),
      event_coverage: covered && covered >= expiry
        ? { status: "VERIFIED" as const, covered_through: covered, events }
        : { status: "UNKNOWN" as const, covered_through: covered, events },
    };
  });

  const uAge = (Date.parse(asOf) - Date.parse(d.underlying.price_time)) / 1000;
  const uMax = rules.freshness.max_underlying_age_seconds;
  const derived = bars ? deriveLevels(bars, price, today) : { support: null, resistance: null, liquidity_targets: null };
  const hv = bars ? calcRealizedVol20(bars.filter(b => b.date < today).map(b => b.close)) : null;

  const input: AnalysisInput = {
    schema_version: SCHEMA_VERSION,
    symbol: d.symbol,
    as_of: asOf,
    paper_trading_only: PAPER_TRADING_ONLY,
    session: nyseSessionStatus(new Date(asOf)),
    underlying: {
      price,
      price_timestamp: d.underlying.price_time,
      price_timestamp_kind: d.underlying.price_time_kind,
      source: USER_SUPPLIED_SOURCE,
      freshness: {
        status: uAge < -rules.freshness.clock_tolerance_seconds ? "UNKNOWN" : uAge <= uMax ? "FRESH" : "STALE",
        age_seconds: uAge, max_age_seconds: uMax, basis: "User-supplied price time vs analysis time",
      },
    },
    bars: bars ? bars.slice(-60) : null,
    levels: d.levels
      ? {
        support: d.levels.support.map(p => ({ price: p, label: "User-supplied support" })),
        resistance: d.levels.resistance.map(p => ({ price: p, label: "User-supplied resistance" })),
        liquidity_targets: derived.liquidity_targets,
      }
      : derived,
    signals: bars ? deriveSignals(bars, price, today, {}) : [],
    volatility: { iv_rank: null, iv_rank_basis: null, iv30: null, hv20: hv === null ? null : Math.round(hv * 10000) / 100 },
    expiries,
    contracts,
    rules,
    risk_classification: null,
    user_context: null,
    sources: [{ name: USER_SUPPLIED_SOURCE, snapshot_timestamp: null, note: "Checked for internal consistency; not independently verified" }],
  };
  return AnalysisInput.parse(input);
}
