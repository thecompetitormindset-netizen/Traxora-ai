// Application-side review of a v4.1 output, from the deterministic engine or
// an explicitly enabled model. Fail closed: any schema or policy violation
// rejects the whole output — nothing is repaired, and a rejected output is
// never displayed. Only an APPROVED_CANDIDATE may be shown as actionable, and
// with paper_trading_only enforced it is still paper-only.

import {
  AnalysisOutput, CHECKLIST_ORDER, SCHEMA_VERSION,
  type AnalysisInput, type InputContract,
} from "./schema";
import {
  CREDIT_SPREADS, DEBIT_SPREADS, LONG_PREMIUM_SINGLE, STRATEGY_DIRECTION, checkLegShape, legProblems, legSyncProblem,
} from "./strategies";
import { confidenceCeiling, timeRuleFor } from "./engine";
import { PAPER_TRADING_ONLY } from "./rules";
import { priceCandidate, type CandidatePricing } from "./pricing";

export type Review =
  | { status: "APPROVED_CANDIDATE"; output: AnalysisOutput; pricing: CandidatePricing }
  | { status: "NO_TRADE"; output: AnalysisOutput }
  | { status: "REJECTED"; errors: string[] };

const BAND_RANK = { LOW: 0, MODERATE: 1, HIGH: 2 } as const;

function sentenceCount(s: string): number {
  // Split on terminal punctuation followed by space/end; decimals like 312.40 don't split.
  return s.trim().split(/[.!?]+(?:\s+|$)/).filter(x => x.trim().length > 0).length;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function reviewAnalysis(input: AnalysisInput, raw: unknown): Review {
  const parsed = AnalysisOutput.safeParse(raw);
  if (!parsed.success) {
    return { status: "REJECTED", errors: parsed.error.issues.map(i => `schema: ${i.path.join(".")}: ${i.message}`) };
  }
  const o = parsed.data;
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  // ── Identity & restriction ────────────────────────────────────────────────
  if (o.schema_version !== SCHEMA_VERSION) err("schema_version mismatch");
  if (o.symbol !== input.symbol) err("symbol does not match input");
  if (o.as_of !== input.as_of) err("as_of does not match input");
  if (input.paper_trading_only !== PAPER_TRADING_ONLY) err("input paper_trading_only is not the server-enforced value");
  if (o.paper_trading_only !== input.paper_trading_only) err("paper_trading_only does not match input");
  if (o.risk_label !== input.risk_classification) err("risk_label does not match the application classification");

  // ── Checklist & confidence ────────────────────────────────────────────────
  if (o.checklist.length !== 7 || o.checklist.some((c, i) => c.item !== CHECKLIST_ORDER[i])) {
    err("checklist must have exactly seven items in the specified order");
  }
  const passCount = o.checklist.filter(c => c.result === "PASS").length;
  if (BAND_RANK[o.confidence_band] > BAND_RANK[confidenceCeiling(passCount)]) {
    err(`confidence_band ${o.confidence_band} exceeds the ceiling for ${passCount} passes`);
  }

  // ── Copied numbers must come from input ───────────────────────────────────
  const prices = (l: { price: number }[] | null) => l?.map(x => x.price) ?? null;
  const sameList = (a: number[] | null, b: number[] | null) =>
    (a === null && b === null) || (a !== null && b !== null && a.every(x => b.includes(x)));
  if (!sameList(o.key_levels.support, prices(input.levels.support))) err("support levels not from input");
  if (!sameList(o.key_levels.resistance, prices(input.levels.resistance))) err("resistance levels not from input");
  if (!sameList(o.key_levels.liquidity_targets, prices(input.levels.liquidity_targets))) err("liquidity targets not from input");
  if (o.volatility.iv_rank !== input.volatility.iv_rank) err("iv_rank not copied from input");
  const inputSignalNames = new Set(input.signals.map(s => s.name));
  for (const s of o.signals_breakdown) {
    if (!inputSignalNames.has(s.signal)) err(`signal ${s.signal} not in input`);
    if (s.supports_direction === false && !o.risks.some(r => r.includes(s.signal))) err(`signal ${s.signal} marked against direction but not named in risks`);
  }

  // ── Prose rules ───────────────────────────────────────────────────────────
  const prose = [o.thesis, o.user_note, ...o.risks, ...o.checklist.map(c => c.reason),
    o.no_trade_reason?.detail ?? "", o.key_levels.invalidation?.condition ?? "",
    o.proposed_structure?.profit_plan.note ?? ""];
  if (prose.some(p => /[$€£¥]/.test(p))) err("currency symbol in prose");
  if (sentenceCount(o.thesis) > 3) err("thesis exceeds three sentences");
  if (wordCount(o.user_note) > 150) err("user_note exceeds 150 words");
  if (!o.disclaimer.trim()) err("disclaimer missing");

  // ── Decision consistency ──────────────────────────────────────────────────
  if (o.trade_decision === "NO_TRADE") {
    if (!o.no_trade_reason) err("NO_TRADE requires no_trade_reason");
    if (o.proposed_structure !== null) err("NO_TRADE must not carry a proposed_structure");
    if (o.key_levels.invalidation !== null) err("NO_TRADE invalidation must be null");
    if (o.volatility.expected_move !== null) err("NO_TRADE expected_move must be null");
    return errors.length ? { status: "REJECTED", errors } : { status: "NO_TRADE", output: o };
  }

  const ps = o.proposed_structure;
  const inv = o.key_levels.invalidation;
  if (o.no_trade_reason !== null) err("TRADE must have null no_trade_reason");
  if (!ps) err("TRADE requires proposed_structure");
  if (!inv) err("TRADE requires invalidation");
  if (passCount < 4) err("fewer than four checklist passes cannot be TRADE");
  if (input.session.status !== "OPEN") err("TRADE while session is not open");
  if (!ps || !inv || !input.rules || !input.contracts || !input.expiries || input.underlying.price === null || !input.as_of) {
    errors.push("TRADE missing required structure or input essentials");
    return { status: "REJECTED", errors };
  }
  const rules = input.rules;
  const price = input.underlying.price;

  if (STRATEGY_DIRECTION[ps.strategy] !== o.canonical_direction) err("strategy does not match canonical_direction");
  const shape = checkLegShape(ps.strategy, ps.legs);
  if (shape) err(shape);

  const byId = new Map(input.contracts.map(c => [c.contract_id, c]));
  const contracts: InputContract[] = [];
  for (const leg of ps.legs) {
    const c = byId.get(leg.contract_id);
    if (!c) { err(`${leg.contract_id} not in supplied chain`); continue; }
    if (c.type !== leg.type || c.strike !== leg.strike || c.expiry !== leg.expiry) err(`${leg.contract_id} fields do not match the supplied contract`);
    const needsDelta = leg.action === "BUY" && (DEBIT_SPREADS.has(ps.strategy) || LONG_PREMIUM_SINGLE.has(ps.strategy));
    for (const p of legProblems(c, input, rules, { needsDelta })) err(`${p.gate}: ${p.detail}`);
    contracts.push(c);
  }
  if (contracts.length !== ps.legs.length) return { status: "REJECTED", errors };

  const expiries = new Set(contracts.map(c => c.expiry));
  const specs = new Set(contracts.map(c => JSON.stringify(c.spec)));
  if (expiries.size !== 1) err("legs do not share one expiry");
  if (specs.size !== 1) err("legs do not share contract terms");
  const sync = legSyncProblem(contracts, rules);
  if (sync) err(sync);

  const ex = input.expiries.find(e => e.expiry === contracts[0].expiry);
  if (!ex) { err("selected expiry missing from expiry coverage"); return { status: "REJECTED", errors }; }
  if (ex.dte < rules.min_swing_dte || ex.dte > rules.max_swing_dte) err("expiry outside configured swing DTE");
  if (ex.event_coverage.status !== "VERIFIED" || !ex.event_coverage.covered_through || ex.event_coverage.covered_through < ex.expiry) {
    err("event coverage not verified through expiry");
  }
  const events = ex.event_coverage.events.filter(e => e.date <= ex.expiry);
  if (events.length && LONG_PREMIUM_SINGLE.has(ps.strategy)) err("G4_EVENT: single long option through a named event");
  for (const e of events) if (!o.risks.some(r => r.includes(e.name))) err(`event ${e.name} not named in risks`);
  if (JSON.stringify(o.volatility.expected_move) !== JSON.stringify(ex.expected_move)) err("expected_move is not the selected expiry's supplied value");

  // ── Selection policy ──────────────────────────────────────────────────────
  const levelSet = new Set([
    ...(input.levels.support ?? []), ...(input.levels.resistance ?? []), ...(input.levels.liquidity_targets ?? []),
  ].map(l => l.price));
  const target = ps.profit_plan.target_level;
  const legOf = (action: "BUY" | "SELL", type: "CALL" | "PUT") => ps.legs.find(l => l.action === action && l.type === type);

  if (DEBIT_SPREADS.has(ps.strategy) || LONG_PREMIUM_SINGLE.has(ps.strategy)) {
    const long = contracts.find(c => c.contract_id === ps.legs.find(l => l.action === "BUY")!.contract_id)!;
    const { min, max } = rules.debit_long_leg_abs_delta;
    if (DEBIT_SPREADS.has(ps.strategy) && (long.delta === null || Math.abs(long.delta) < min || Math.abs(long.delta) > max)) {
      err("debit-spread long leg delta outside configured band");
    }
  }
  if (ps.strategy === "BULL_CALL_SPREAD" && (target === null || legOf("SELL", "CALL")!.strike < target)) err("short call is not at or beyond target");
  if (ps.strategy === "BEAR_PUT_SPREAD" && (target === null || legOf("SELL", "PUT")!.strike > target)) err("short put is not at or beyond target");
  if (CREDIT_SPREADS.has(ps.strategy) || ps.strategy === "IRON_CONDOR") {
    const em = ex.expected_move;
    if (!em) err("credit structure without matching-expiry expected move");
    else {
      const sp = legOf("SELL", "PUT"), sc = legOf("SELL", "CALL");
      if (sp && !(sp.strike < em.lower)) err("short put not beyond expected-move lower bound");
      if (sc && !(sc.strike > em.upper)) err("short call not beyond expected-move upper bound");
    }
  }

  // ── Invalidation & target ─────────────────────────────────────────────────
  const fromInput = (n: number | null) => n === null || levelSet.has(n);
  if (!fromInput(inv.lower_price) || !fromInput(inv.upper_price) || !fromInput(target)) err("invalidation or target level not from supplied levels");
  if (!inv.condition.trim()) err("invalidation condition missing");
  if (o.canonical_direction === "BULLISH") {
    if (inv.lower_price === null || inv.lower_price >= price || inv.upper_price !== null) err("bullish invalidation must be a lower level below price");
    if (target === null || target <= price) err("bullish target must be above price");
  } else if (o.canonical_direction === "BEARISH") {
    if (inv.upper_price === null || inv.upper_price <= price || inv.lower_price !== null) err("bearish invalidation must be an upper level above price");
    if (target === null || target >= price) err("bearish target must be below price");
  } else {
    const sp = legOf("SELL", "PUT")?.strike, sc = legOf("SELL", "CALL")?.strike;
    if (inv.lower_price === null || inv.upper_price === null || sp === undefined || sc === undefined
      || !(sp < inv.lower_price && inv.lower_price < price && price < inv.upper_price && inv.upper_price < sc)) {
      err("condor invalidation must satisfy short put < lower < price < upper < short call");
    }
  }

  // ── Time rule ─────────────────────────────────────────────────────────────
  const tr = ps.time_rule;
  if (tr.type === "REVIEW_AT_DTE") {
    if (tr.date !== null || tr.dte !== rules.review_dte || rules.review_dte === null || !(rules.review_dte < ex.dte) || rules.review_dte <= 0) {
      err("REVIEW_AT_DTE must use the configured reviewDte strictly below current DTE");
    }
  } else if (tr.dte !== null || tr.date === null || !rules.approved_exit_dates.includes(tr.date)
    || !(tr.date > input.as_of.slice(0, 10) && tr.date < ex.expiry)) {
    err("EXIT_BY_DATE must be a configured approved future date before expiry");
  }
  if (!timeRuleFor(ex, rules, input.as_of)) err("no usable configured time rule for this expiry");

  if (errors.length) return { status: "REJECTED", errors };

  const priced = priceCandidate(ps, byId);
  if (!priced.ok) return { status: "REJECTED", errors: [priced.error] };
  return { status: "APPROVED_CANDIDATE", output: o, pricing: priced.pricing };
}
