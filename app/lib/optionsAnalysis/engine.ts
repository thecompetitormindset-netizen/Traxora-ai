// Deterministic v4.1 analyst — the default path, zero model calls. Applies the
// v4.1 gates and selection policy to a validated input payload and returns a
// v4.1 output object. TRADE here still means candidate only: the validator
// and pricing step decide whether anything is displayed as actionable.
//
// Conservative where the policy allows judgment: spreads are not held through
// a named earnings event (the policy permits it with independent support; this
// engine has no way to weigh that, so it declines).

import {
  CHECKLIST_ORDER, DISCLAIMER_EN, SCHEMA_VERSION,
  type AnalysisInput, type AnalysisOutput, type ChecklistEntry, type InputContract,
  type InputExpiry, type InputRules, type NoTradeCodeName, type OutputLegT, type StrategyName,
} from "./schema";
import {
  CREDIT_SPREADS, DEBIT_SPREADS, LONG_PREMIUM_SINGLE, STRATEGY_DIRECTION, checkLegShape, legProblems, legSyncProblem,
} from "./strategies";

type Dir = "BULLISH" | "BEARISH" | "NEUTRAL";
type Item = (typeof CHECKLIST_ORDER)[number];
type ItemResult = { result: "PASS" | "FAIL"; reason: string };

const WELLBEING_PATTERNS = [
  /\ball[- ]in\b/i, /\brent money\b/i, /\bmortgage\b/i, /\blife savings\b/i,
  /\bemergency fund\b/i, /\bgrocer(y|ies) money\b/i, /\bcan'?t afford to lose\b/i, /\bwin (it|my money) back\b/i,
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// ── Direction from price structure ──────────────────────────────────────────────

type DirectionRead = { direction: Dir; conflict: boolean; aligned: boolean; rangeEvidenced: boolean; detail: string };

export function readDirection(input: AnalysisInput): DirectionRead {
  const structure = input.signals.filter(s => s.kind === "STRUCTURE" && s.direction !== null);
  const bull = structure.filter(s => s.direction === "BULLISH").length;
  const bear = structure.filter(s => s.direction === "BEARISH").length;
  const neutral = structure.filter(s => s.direction === "NEUTRAL").length;
  if (structure.length === 0) {
    return { direction: "NEUTRAL", conflict: false, aligned: false, rangeEvidenced: false, detail: "No price-structure observations supplied" };
  }
  if (bull > 0 && bear > 0) {
    return { direction: "NEUTRAL", conflict: true, aligned: false, rangeEvidenced: false, detail: "Price-structure observations point in opposite directions" };
  }
  if (bull > 0 || bear > 0) {
    const direction: Dir = bull > 0 ? "BULLISH" : "BEARISH";
    return {
      direction, conflict: false, aligned: neutral === 0, rangeEvidenced: false,
      detail: neutral === 0
        ? `All ${structure.length} price-structure observations read ${direction.toLowerCase()}`
        : `Price structure leans ${direction.toLowerCase()} but ${neutral} of ${structure.length} observations are flat`,
    };
  }
  const rangeEvidenced = neutral >= 2;
  return {
    direction: "NEUTRAL", conflict: false, aligned: rangeEvidenced, rangeEvidenced,
    detail: rangeEvidenced ? "Price-structure observations all read flat (range)" : "Only one flat price-structure observation; range not evidenced",
  };
}

// ── Levels ──────────────────────────────────────────────────────────────────────

function nearestBelow(levels: { price: number }[] | null, price: number): number | null {
  const below = (levels ?? []).map(l => l.price).filter(p => p < price);
  return below.length ? Math.max(...below) : null;
}
function nearestAbove(levels: { price: number }[] | null, price: number): number | null {
  const above = (levels ?? []).map(l => l.price).filter(p => p > price);
  return above.length ? Math.min(...above) : null;
}

type Plan = { target: number | null; lower: number | null; upper: number | null };

function planLevels(input: AnalysisInput, dir: Dir, price: number): Plan {
  const support = nearestBelow(input.levels.support, price);
  const resistance = nearestAbove(input.levels.resistance, price);
  if (dir === "BULLISH") return { target: resistance, lower: support, upper: null };
  if (dir === "BEARISH") return { target: support, lower: null, upper: resistance };
  return { target: null, lower: support, upper: resistance };
}

// ── Leg selection (configured selection policy, not a profitability claim) ─────

type Pick = { strategy: StrategyName; expiry: InputExpiry; legs: { c: InputContract; action: "BUY" | "SELL" }[] };

function byStrike(pool: InputContract[], expiry: string, type: "CALL" | "PUT") {
  return pool.filter(c => c.expiry === expiry && c.type === type).sort((a, b) => a.strike - b.strike);
}

function deltaPick(list: InputContract[], rules: InputRules): InputContract | null {
  const { min, max } = rules.debit_long_leg_abs_delta;
  const eligible = list.filter(c => c.delta !== null && Math.abs(c.delta) >= min && Math.abs(c.delta) <= max);
  if (!eligible.length) return null;
  return eligible.reduce((best, c) => (Math.abs(Math.abs(c.delta!) - 0.5) < Math.abs(Math.abs(best.delta!) - 0.5) ? c : best));
}

function selectLegs(strategy: StrategyName, ex: InputExpiry, pool: InputContract[], plan: Plan, rules: InputRules): Pick | null {
  const calls = byStrike(pool, ex.expiry, "CALL");
  const puts = byStrike(pool, ex.expiry, "PUT");
  const em = ex.expected_move;
  const mk = (...legs: [InputContract | null | undefined, "BUY" | "SELL"][]): Pick | null =>
    legs.every(([c]) => c) ? { strategy, expiry: ex, legs: legs.map(([c, action]) => ({ c: c!, action })) } : null;

  switch (strategy) {
    case "LONG_CALL": return mk([deltaPick(calls, rules), "BUY"]);
    case "LONG_PUT":  return mk([deltaPick(puts, rules), "BUY"]);
    case "BULL_CALL_SPREAD": {
      const long = deltaPick(calls, rules);
      if (!long || plan.target === null) return null;
      const short = calls.find(c => c.strike > long.strike && c.strike >= plan.target!);
      return mk([long, "BUY"], [short, "SELL"]);
    }
    case "BEAR_PUT_SPREAD": {
      const long = deltaPick(puts, rules);
      if (!long || plan.target === null) return null;
      const short = [...puts].reverse().find(c => c.strike < long.strike && c.strike <= plan.target!);
      return mk([long, "BUY"], [short, "SELL"]);
    }
    case "BULL_PUT_SPREAD": {
      if (!em) return null;
      const short = [...puts].reverse().find(c => c.strike < em.lower);
      const long = short && [...puts].reverse().find(c => c.strike < short.strike);
      return mk([long, "BUY"], [short, "SELL"]);
    }
    case "BEAR_CALL_SPREAD": {
      if (!em) return null;
      const short = calls.find(c => c.strike > em.upper);
      const long = short && calls.find(c => c.strike > short.strike);
      return mk([short, "SELL"], [long, "BUY"]);
    }
    case "IRON_CONDOR": {
      if (!em || plan.lower === null || plan.upper === null) return null;
      const sp = [...puts].reverse().find(c => c.strike < Math.min(em.lower, plan.lower!));
      const sc = calls.find(c => c.strike > Math.max(em.upper, plan.upper!));
      if (!sp || !sc) return null;
      for (const lp of [...puts].reverse().filter(c => c.strike < sp.strike)) {
        const width = sp.strike - lp.strike;
        const lc = calls.find(c => Math.abs(c.strike - (sc.strike + width)) < 1e-9);
        if (lc) return mk([lp, "BUY"], [sp, "SELL"], [sc, "SELL"], [lc, "BUY"]);
      }
      return null;
    }
  }
}

const PREFERENCE: Record<Dir, StrategyName[]> = {
  BULLISH: ["BULL_CALL_SPREAD", "BULL_PUT_SPREAD", "LONG_CALL"],
  BEARISH: ["BEAR_PUT_SPREAD", "BEAR_CALL_SPREAD", "LONG_PUT"],
  NEUTRAL: ["IRON_CONDOR"],
};

function needsDelta(strategy: StrategyName, action: "BUY" | "SELL") {
  return action === "BUY" && (DEBIT_SPREADS.has(strategy) || LONG_PREMIUM_SINGLE.has(strategy));
}

// ── Time rule ───────────────────────────────────────────────────────────────────

type TimeRule = NonNullable<AnalysisOutput["proposed_structure"]>["time_rule"];

export function timeRuleFor(ex: InputExpiry, rules: InputRules, asOf: string): TimeRule | null {
  if (rules.review_dte !== null && rules.review_dte < ex.dte && rules.review_dte > 0) {
    return { type: "REVIEW_AT_DTE", dte: rules.review_dte, date: null };
  }
  const today = asOf.slice(0, 10);
  const date = rules.approved_exit_dates.filter(d => d > today && d < ex.expiry).sort()[0];
  return date ? { type: "EXIT_BY_DATE", dte: null, date } : null;
}

// ── Candidate evaluation ────────────────────────────────────────────────────────

// `item` ties a failure to the checklist entry it fails, so the candidate
// checklist reports the same reason the gate did.
type Failure = { gate: NoTradeCodeName; detail: string; item?: Item };

type Evaluated = {
  pick: Pick;
  failures: Failure[];
  checklist: Record<Item, ItemResult>;
  timeRule: TimeRule | null;
};

function evaluate(pick: Pick, input: AnalysisInput, rules: InputRules, plan: Plan, price: number, market: Record<Item, ItemResult>): Evaluated {
  const failures: Failure[] = [];
  const { strategy, expiry: ex } = pick;

  const shape = checkLegShape(strategy, pick.legs.map(l => ({ action: l.action, type: l.c.type, strike: l.c.strike })));
  if (shape) failures.push({ gate: "G6_UNSUPPORTED", detail: shape, item: "STRUCTURE" });

  if (ex.event_coverage.status !== "VERIFIED" || !ex.event_coverage.covered_through || ex.event_coverage.covered_through < ex.expiry) {
    failures.push({ gate: "G1_DATA", detail: `Event calendar coverage not verified through ${ex.expiry}`, item: "EVENT_TIME" });
  }
  const events = ex.event_coverage.events.filter(e => e.date <= ex.expiry);
  if (events.length > 0) {
    const names = events.map(e => `${e.name} (${e.date})`).join(", ");
    failures.push({
      gate: "G4_EVENT",
      item: "EVENT_TIME",
      detail: LONG_PREMIUM_SINGLE.has(strategy)
        ? `${names} falls before expiry; single long options are excluded`
        : `${names} falls before expiry; this engine does not hold spreads through a named event`,
    });
  }

  for (const leg of pick.legs) {
    for (const p of legProblems(leg.c, input, rules, { needsDelta: needsDelta(strategy, leg.action) })) failures.push({ ...p, item: "LEG_DATA" });
  }
  const sync = legSyncProblem(pick.legs.map(l => l.c), rules);
  if (sync) failures.push({ gate: "G2_FRESHNESS", detail: sync, item: "LEG_DATA" });

  if ((CREDIT_SPREADS.has(strategy) || strategy === "IRON_CONDOR") && !ex.expected_move) {
    failures.push({ gate: "G1_DATA", detail: `Expected move for ${ex.expiry} not supplied`, item: "LEG_DATA" });
  }

  if (strategy === "IRON_CONDOR") {
    const sp = pick.legs.find(l => l.action === "SELL" && l.c.type === "PUT")?.c.strike;
    const sc = pick.legs.find(l => l.action === "SELL" && l.c.type === "CALL")?.c.strike;
    if (plan.lower === null || plan.upper === null || sp === undefined || sc === undefined
      || !(sp < plan.lower && plan.lower < price && price < plan.upper && plan.upper < sc)) {
      failures.push({ gate: "G7_EXIT", detail: "Condor invalidation bounds do not sit between the short strikes", item: "INVALIDATION" });
    }
  } else {
    const invalidation = STRATEGY_DIRECTION[strategy] === "BULLISH" ? plan.lower : plan.upper;
    if (invalidation === null) failures.push({ gate: "G7_EXIT", detail: "No supplied invalidation level on the correct side of price", item: "INVALIDATION" });
    if (plan.target === null) failures.push({ gate: "G7_EXIT", detail: "No supplied target level in the direction of the thesis", item: "TARGET" });
  }

  const timeRule = timeRuleFor(ex, rules, input.as_of!);
  if (!timeRule) failures.push({ gate: "G7_EXIT", detail: `No usable configured time rule before ${ex.expiry}`, item: "EVENT_TIME" });

  // Candidate-level checklist: market-level reads, with VOLATILITY refined for
  // this strategy, LEG_DATA/EVENT_TIME assessed, and any tagged failure winning.
  const checklist: Record<Item, ItemResult> = {
    ...market,
    VOLATILITY: volatilityFor(strategy, input),
    LEG_DATA: { result: "PASS", reason: "All selected legs have supplied quotes, IV, open interest, specs and fresh quote timestamps" },
    EVENT_TIME: { result: "PASS", reason: `Verified event calendar through ${ex.expiry} with no named event; time rule available` },
  };
  for (const item of CHECKLIST_ORDER) {
    const f = failures.find(x => x.item === item);
    if (f) checklist[item] = { result: "FAIL", reason: f.detail };
  }
  return { pick, failures, checklist, timeRule };
}

function volatilityFor(strategy: StrategyName | null, input: AnalysisInput): ItemResult {
  const rank = input.volatility.iv_rank;
  if (rank === null) return { result: "FAIL", reason: "IV rank not supplied (insufficient IV history)" };
  if (strategy === null) return { result: "PASS", reason: `IV rank ${fmt(rank)} supplied (relative to own history, not a valuation)` };
  const sellsPremium = CREDIT_SPREADS.has(strategy) || strategy === "IRON_CONDOR";
  const fits = sellsPremium ? rank >= 50 : rank <= 50;
  return fits
    ? { result: "PASS", reason: `IV rank ${fmt(rank)} is ${sellsPremium ? "upper" : "lower"} half of its own history, consistent with ${sellsPremium ? "selling" : "buying"} premium` }
    : { result: "FAIL", reason: `IV rank ${fmt(rank)} is ${sellsPremium ? "lower" : "upper"} half of its own history; does not fit ${sellsPremium ? "selling" : "buying"} premium` };
}

// ── Market-level checklist (no candidate needed) ────────────────────────────────

function marketChecklist(input: AnalysisInput, d: DirectionRead, plan: Plan, notAssessed: string | null): Record<Item, ItemResult> {
  const na = (reason: string): ItemResult => ({ result: "FAIL", reason });
  const positioning = input.signals.filter(s => s.kind === "POSITIONING" && s.direction !== null);
  const posSupports = positioning.filter(s => s.direction === d.direction);
  return {
    STRUCTURE: d.aligned ? { result: "PASS", reason: d.detail } : na(d.detail),
    TARGET: d.direction === "NEUTRAL"
      ? (d.rangeEvidenced && plan.lower !== null && plan.upper !== null
        ? { result: "PASS", reason: `Evidenced range between supplied levels ${fmt(plan.lower)} and ${fmt(plan.upper)}` }
        : na("No evidenced range with supplied bounds"))
      : (plan.target !== null
        ? { result: "PASS", reason: `Supplied ${d.direction === "BULLISH" ? "resistance" : "support"} at ${fmt(plan.target)} in the direction of the thesis` }
        : na(`No supplied ${d.direction === "BULLISH" ? "resistance above" : "support below"} price`)),
    VOLATILITY: volatilityFor(null, input),
    LEG_DATA: na(`Not assessed: ${notAssessed ?? "no candidate structure"}`),
    POSITIONING: positioning.length === 0
      ? na("Positioning data not supplied")
      : posSupports.length > 0
        ? { result: "PASS", reason: `${posSupports.map(s => s.name).join(", ")} supports the direction` }
        : na("Supplied positioning does not support the direction"),
    INVALIDATION: d.direction === "BULLISH"
      ? (plan.lower !== null ? { result: "PASS", reason: `Supplied support ${fmt(plan.lower)} below price` } : na("No supplied support below price"))
      : d.direction === "BEARISH"
        ? (plan.upper !== null ? { result: "PASS", reason: `Supplied resistance ${fmt(plan.upper)} above price` } : na("No supplied resistance above price"))
        : (plan.lower !== null && plan.upper !== null
          ? { result: "PASS", reason: `Supplied bounds ${fmt(plan.lower)} and ${fmt(plan.upper)} bracket price` }
          : na("Supplied bounds on both sides of price are missing")),
    EVENT_TIME: na(`Not assessed: ${notAssessed ?? "no candidate structure"}`),
  };
}

function checklistArray(c: Record<Item, ItemResult>): ChecklistEntry[] {
  return CHECKLIST_ORDER.map(item => ({ item, ...c[item] }));
}

function passes(c: Record<Item, ItemResult>) {
  return CHECKLIST_ORDER.filter(i => c[i].result === "PASS").length;
}

export function confidenceCeiling(passCount: number): "LOW" | "MODERATE" | "HIGH" {
  return passCount >= 6 ? "HIGH" : passCount === 5 ? "MODERATE" : "LOW";
}

// ── Prose (no currency symbols, no computed financial figures) ──────────────────

function userNote(input: AnalysisInput, decision: "TRADE" | "NO_TRADE", why: string, reassess: string): string {
  const beginner = input.user_context?.experience === "BEGINNER";
  const parts: string[] = [];
  if (decision === "TRADE") {
    parts.push("This is a candidate structure only. The app still has to price it, check the risk and confirm the quotes are current before anything is shown as actionable.");
    if (beginner) parts.push("A defined-risk structure limits the loss to what the structure is built to lose, but fees, fills and early assignment on short legs can still change the real result.");
  } else {
    parts.push(`No trade: ${why}`);
    parts.push(`Reassess when ${reassess}`);
  }
  if (input.paper_trading_only === true) parts.push("Paper trading only.");
  if (beginner) parts.push("Practising on paper first is a good way to learn how these structures behave.");
  return parts.join(" ");
}

const REASSESS: Record<NoTradeCodeName, string> = {
  G1_DATA: "the missing data listed under data gaps is supplied.",
  G2_FRESHNESS: "the underlying price and every selected leg have timestamps within their configured age limits.",
  G3_SESSION: "the regular market session is open.",
  G4_EVENT: "the named event has passed or an expiry before it is available.",
  G6_UNSUPPORTED: "a supported defined-risk structure is requested.",
  G7_EXIT: "supplied levels and a configured time rule define a complete exit plan.",
  WELLBEING: "you are using money you can afford to lose; paper trading is a good place to start.",
  CONFLICTING_SIGNALS: "price structure resolves in one direction or into an evidenced range.",
  LOW_CHECKLIST: "at least four checklist items pass on supplied evidence.",
  NO_EDGE: "a candidate clears every gate on supplied evidence.",
};

// ── Main ────────────────────────────────────────────────────────────────────────

export function analyzeDeterministic(input: AnalysisInput): AnalysisOutput {
  const dataGaps: string[] = [];
  const risks: string[] = [];
  const price = input.underlying.price;
  const rules = input.rules;
  const d = readDirection(input);
  const plan = price !== null ? planLevels(input, d.direction, price) : { target: null, lower: null, upper: null };

  if (input.volatility.iv_rank === null) dataGaps.push("IV rank unavailable (insufficient IV history)");
  if (!input.signals.some(s => s.kind === "POSITIONING" && s.direction !== null)) dataGaps.push("Positioning data not supplied");

  const supports = (dir: Dir | null): boolean | null =>
    dir === null ? null : dir === d.direction;
  const signals_breakdown = input.signals.map(s => ({
    signal: s.name,
    reading: s.reading,
    supports_direction: supports(s.direction),
    evidence: (s.direction === null ? "PROVIDED" : "INFERRED") as "PROVIDED" | "INFERRED",
  }));
  for (const s of signals_breakdown) {
    if (s.supports_direction === false) risks.push(`${s.signal} does not support the ${d.direction.toLowerCase()} read: ${s.reading}`);
  }

  const ivVsHv = input.volatility.iv30 !== null && input.volatility.hv20 !== null
    ? (input.volatility.iv30 > input.volatility.hv20 ? "Supplied IV30 is above supplied 20-day historical volatility"
      : input.volatility.iv30 < input.volatility.hv20 ? "Supplied IV30 is below supplied 20-day historical volatility"
      : "Supplied IV30 equals supplied 20-day historical volatility")
    : null;

  const base = {
    schema_version: SCHEMA_VERSION,
    symbol: input.symbol,
    as_of: input.as_of,
    paper_trading_only: input.paper_trading_only,
    canonical_direction: d.direction,
    risk_label: input.risk_classification,
    regime: d.aligned ? (d.direction === "NEUTRAL" ? "Range" : d.direction === "BULLISH" ? "Trend up" : "Trend down") : null,
    key_levels: {
      support: input.levels.support?.map(l => l.price) ?? null,
      resistance: input.levels.resistance?.map(l => l.price) ?? null,
      liquidity_targets: input.levels.liquidity_targets?.map(l => l.price) ?? null,
      invalidation: null,
    },
    signals_breakdown,
    disclaimer: DISCLAIMER_EN,
  } satisfies Partial<AnalysisOutput>;

  const noTrade = (code: NoTradeCodeName, detail: string, checklist: Record<Item, ItemResult>, thesis: string): AnalysisOutput => ({
    ...base,
    trade_decision: "NO_TRADE",
    no_trade_reason: { code, detail },
    confidence_band: confidenceCeiling(passes(checklist)),
    thesis,
    volatility: { iv_rank: input.volatility.iv_rank, iv_vs_hv: ivVsHv, expected_move: null },
    proposed_structure: null,
    checklist: checklistArray(checklist),
    risks,
    data_gaps: dataGaps,
    user_note: userNote(input, "NO_TRADE", detail.endsWith(".") ? detail : `${detail}.`, REASSESS[code]),
  });

  const observation = `Observations only. ${d.detail}.`;

  // WELLBEING precedes everything: no analysis of a trade made with essentials.
  if (input.user_context?.request && WELLBEING_PATTERNS.some(p => p.test(input.user_context!.request!))) {
    return noTrade("WELLBEING", "The request describes risking money needed for essentials or going all in",
      marketChecklist(input, d, plan, "WELLBEING"), "No analysis is offered for a trade sized with money needed for essentials.");
  }

  // Global G1 — essentials.
  const g1: string[] = [];
  if (input.paper_trading_only === null) g1.push("Paper-trading restriction status missing");
  if (!input.symbol) g1.push("Symbol missing");
  if (!input.as_of) g1.push("Analysis timestamp missing");
  if (price === null) g1.push("Underlying price missing");
  if (!rules) g1.push("Configured rules missing");
  if (!input.expiries || !input.contracts) g1.push("Option chain or expiry coverage missing");
  if (g1.length) {
    dataGaps.push(...g1);
    return noTrade("G1_DATA", g1.join("; "), marketChecklist(input, d, plan, "G1_DATA"), observation);
  }

  // Global G2 — underlying freshness, recomputed from the timestamp.
  const u = input.underlying;
  const uAge = u.price_timestamp ? (Date.parse(input.as_of!) - Date.parse(u.price_timestamp)) / 1000 : null;
  const uProblem = uAge === null ? "Underlying price timestamp missing"
    : uAge < -rules!.freshness.clock_tolerance_seconds ? "Underlying price timestamp is in the future"
    : uAge > rules!.freshness.max_underlying_age_seconds ? "Underlying price is older than the configured limit"
    : null;
  if (uProblem) {
    dataGaps.push(uProblem);
    return noTrade("G2_FRESHNESS", uProblem, marketChecklist(input, d, plan, "G2_FRESHNESS"), observation);
  }

  // Global G3 — session.
  if (input.session.status !== "OPEN") {
    return noTrade("G3_SESSION", `Market session ${input.session.status.toLowerCase()} (${input.session.detail})`,
      marketChecklist(input, d, plan, "G3_SESSION"), `${observation} Any structure would be for a future session.`);
  }

  const market = marketChecklist(input, d, plan, null);

  if (d.conflict) {
    return noTrade("CONFLICTING_SIGNALS", d.detail, market, `${d.detail}; no direction is taken.`);
  }
  if (d.direction === "NEUTRAL" && !d.rangeEvidenced) {
    return noTrade("NO_EDGE", d.detail, market, `${d.detail}.`);
  }

  // Candidate stage.
  const eligible = input.expiries!
    .filter(e => e.dte >= rules!.min_swing_dte && e.dte <= rules!.max_swing_dte)
    .sort((a, b) => a.dte - b.dte);
  if (!eligible.length) {
    dataGaps.push("No expiry within the configured swing DTE band");
    return noTrade("G1_DATA", "No expiry within the configured swing DTE band", market, observation);
  }

  const contracts = input.contracts!;
  const usable = contracts.filter(c => legProblems(c, input, rules!, { needsDelta: false }).every(p => p.gate !== "G1_DATA"));
  const evaluated: Evaluated[] = [];
  for (const ex of eligible) {
    for (const strategy of PREFERENCE[d.direction]) {
      const pick = selectLegs(strategy, ex, usable, plan, rules!) ?? selectLegs(strategy, ex, contracts, plan, rules!);
      if (pick) evaluated.push(evaluate(pick, input, rules!, plan, price!, market));
    }
  }

  if (!evaluated.length) {
    dataGaps.push("No supplied contracts satisfy the selection policy for any eligible expiry");
    return noTrade("G1_DATA", "No supplied contracts satisfy the selection policy for any eligible expiry", market, observation);
  }

  for (const ex of eligible) {
    if (ex.event_coverage.status !== "VERIFIED") dataGaps.push(`Event calendar coverage unknown through ${ex.expiry}`);
  }
  if (evaluated.some(e => e.pick.legs.some(l => !l.c.quote_timestamp))) {
    dataGaps.push("Per-contract bid/ask quote timestamps not supplied by the option data source");
  }

  // Low checklist rejects an otherwise-clean candidate.
  for (const e of evaluated) {
    if (e.failures.length === 0 && passes(e.checklist) < 4) {
      e.failures.push({ gate: "LOW_CHECKLIST", detail: `${passes(e.checklist)} of 7 checklist items pass` });
    }
  }

  const winner = evaluated.find(e => e.failures.length === 0);
  if (!winner) {
    const ORDER: NoTradeCodeName[] = ["G1_DATA", "G2_FRESHNESS", "G4_EVENT", "G6_UNSUPPORTED", "G7_EXIT", "LOW_CHECKLIST"];
    const sets = evaluated.map(e => new Set(e.failures.map(f => f.gate)));
    const common = ORDER.find(code => sets.every(s => s.has(code)));
    const first = evaluated[0];
    const detail = common
      ? first.failures.find(f => f.gate === common)!.detail
      : [...new Set(evaluated.map(e => `${e.pick.strategy} ${e.pick.expiry.expiry}: ${e.failures[0].detail}`))].slice(0, 4).join("; ");
    const label = `${evaluated.length} candidate structure${evaluated.length === 1 ? "" : "s"} considered; none cleared every gate`;
    return noTrade(common ?? "NO_EDGE", common ? `${label}. ${detail}` : `${label}: ${detail}`, first.checklist, observation);
  }

  // TRADE candidate.
  const { pick, checklist, timeRule } = winner;
  const ex = pick.expiry;
  for (const e of ex.event_coverage.events) risks.push(`${e.name} on ${e.date}`);
  if (pick.legs.some(l => l.action === "SELL")) {
    const spec = pick.legs[0].c.spec!;
    risks.push(`Short legs can be assigned before expiry (${spec.exercise_style === "AMERICAN" ? "American" : "European"}-style, ${spec.settlement.toLowerCase()} settlement); assignment, fees and fills can change realized results`);
  }
  risks.push("An exit plan cannot guarantee execution at the invalidation level; price can gap through it");

  const legs: OutputLegT[] = pick.legs.map(l => ({
    contract_id: l.c.contract_id, action: l.action, type: l.c.type, strike: l.c.strike, expiry: l.c.expiry, quantity: 1,
  }));
  const isCondor = pick.strategy === "IRON_CONDOR";
  const invalidation = isCondor
    ? { lower_price: plan.lower, upper_price: plan.upper, condition: `Daily close below ${fmt(plan.lower!)} or above ${fmt(plan.upper!)} (supplied range bounds)` }
    : d.direction === "BULLISH"
      ? { lower_price: plan.lower, upper_price: null, condition: `Daily close below supplied support ${fmt(plan.lower!)}` }
      : { lower_price: null, upper_price: plan.upper, condition: `Daily close above supplied resistance ${fmt(plan.upper!)}` };
  const passCount = passes(checklist);
  const strategyWords = pick.strategy.toLowerCase().replace(/_/g, " ");

  return {
    ...base,
    trade_decision: "TRADE",
    no_trade_reason: null,
    confidence_band: confidenceCeiling(passCount),
    key_levels: { ...base.key_levels, invalidation },
    thesis: isCondor
      ? `${d.detail}. Candidate ${strategyWords} for ${ex.expiry} with short strikes outside the supplied expected-move range and range bounds.`
      : `${d.detail}. Candidate ${strategyWords} for ${ex.expiry} toward supplied ${d.direction === "BULLISH" ? "resistance" : "support"} at ${fmt(plan.target!)}.`,
    volatility: { iv_rank: input.volatility.iv_rank, iv_vs_hv: ivVsHv, expected_move: ex.expected_move },
    proposed_structure: {
      strategy: pick.strategy,
      legs,
      profit_plan: isCondor
        ? { target_level: null, note: `Time-based management: review at the configured time rule while price holds inside the supplied range.` }
        : { target_level: plan.target, note: `Consider taking profits as price approaches ${fmt(plan.target!)}; review at the configured time rule.` },
      time_rule: timeRule!,
    },
    checklist: checklistArray(checklist),
    risks,
    data_gaps: dataGaps,
    user_note: userNote(input, "TRADE", "", ""),
  };
}
