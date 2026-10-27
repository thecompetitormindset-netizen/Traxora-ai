// Choosing the day's few picks, and grading them later.
//
// The brief: a small number of names per day — three, or fewer when fewer
// deserve it — chosen for certainty rather than noise, including names the
// crowd has not arrived at yet. Fixed for the whole day, identical for every
// viewer, and graded against what actually happened.
//
// Everything here is pure so the ranking can be tested without network access
// or a database. The job that stores it and the route that serves it are thin
// shells around these functions.
//
// A caution that belongs in the code rather than only in a commit message: the
// "overlooked" weighting below is a HYPOTHESIS, not a demonstrated edge. It
// says a setup the crowd has not yet joined is worth more than one it has.
// That is plausible and it is why the tracking exists — after enough graded
// picks the realised hit rate will say whether it was true. Nothing here
// should be read as a claim that it is.

import type { BacktestStats } from "@/app/api/market/options-scan/route";

/**
 * Sessions forward before a pick is graded.
 *
 * Matched to the engine's BACKTEST_FORWARD rather than set independently. The
 * backtest's claimed hit rate and the realised hit rate are shown side by
 * side, and comparing them is only meaningful over the same horizon — two
 * different windows would make the comparison quietly wrong.
 */
export const PICK_HORIZON_SESSIONS = 14;

/** How many picks a day may carry at most. */
export const MAX_PICKS_PER_DAY = 3;

/**
 * Minimum number of historical signals behind a hit rate before it may be
 * trusted. A 100% hit rate from three occurrences is noise wearing a
 * percentage; this is the guard that keeps it out of the ranking.
 */
export const MIN_BACKTEST_SAMPLE = 20;

/**
 * Which names a run looks at today.
 *
 * Polygon's free tier releases about five calls a minute and a scheduled run
 * has under a minute, so only a handful of symbols fit — a real ceiling, not a
 * chosen number. The universe is therefore walked in a rotating window keyed
 * to the date.
 *
 * That turns the constraint to advantage. The brief asked specifically not to
 * overlook names nobody watches, and a fixed slice would guarantee most of the
 * universe was never once examined. Rotating means every name gets its turn.
 *
 * Deterministic for a given date, so a re-run reconsiders the same names and
 * cannot quietly produce a different answer than the morning's run.
 */
export function sliceForDate(universe: readonly string[], runDate: string, size: number): string[] {
  if (universe.length === 0 || size <= 0) return [];
  const days = Math.floor(Date.parse(`${runDate}T00:00:00Z`) / 86_400_000);
  if (!Number.isFinite(days)) return [];
  const start = (((days * size) % universe.length) + universe.length) % universe.length;
  return Array.from({ length: Math.min(size, universe.length) }, (_, i) => universe[(start + i) % universe.length]);
}

export type Candidate = {
  symbol: string;
  direction: "BUY" | "SELL";
  price: number;
  /** Walk-forward stats for this direction on this symbol's own history. */
  backtest: BacktestStats;
  /** Today's volume against its 20-day average, or null when unknown. */
  volumeRatio: number | null;
  /** True when the symbol appears in a public trending list. */
  trending: boolean;
  /** The engine's own confidence in the signal. */
  confidence: "High" | "Medium" | "Low";
};

export type ScoredCandidate = Candidate & {
  conviction: number;
  /** Plain-language components, so a pick can always explain itself. */
  why: string[];
  /** Why it was not eligible, when it was not. */
  rejected: string | null;
};

const CONFIDENCE_POINTS: Record<Candidate["confidence"], number> = {
  High: 12,
  Medium: 6,
  Low: 0,
};

/**
 * The edge over simply holding.
 *
 * A hit rate alone says nothing: if a stock rose in 60% of all 14-day windows,
 * a 60% hit rate is the market, not a signal. What matters is the gap between
 * what the signal returned and what the same period returned regardless.
 */
export function edgeOver(stats: BacktestStats): number | null {
  if (stats.avgReturn === null || stats.baselineAvgReturn === null) return null;
  return stats.avgReturn - stats.baselineAvgReturn;
}

/**
 * How much the crowd has already arrived.
 *
 * A volume surge means the move is being participated in — the opposite of
 * overlooked. Appearing in a public trending list means the same thing more
 * bluntly. Both subtract, so that among two equally sound setups the quieter
 * one wins.
 *
 * Unknown volume subtracts nothing. Absence of evidence is not evidence of
 * obscurity, and penalising a missing field would quietly favour symbols whose
 * data failed to arrive.
 */
export function crowdingPenalty(volumeRatio: number | null, trending: boolean): number {
  let penalty = trending ? 10 : 0;
  if (volumeRatio !== null) {
    // Up to 2x average is unremarkable. Past that the crowd is present, and
    // the penalty grows with how present, capped so one wild print cannot
    // dominate the ranking.
    if (volumeRatio > 2) penalty += Math.min((volumeRatio - 2) * 6, 18);
  }
  return penalty;
}

/**
 * Score one candidate.
 *
 * Certainty first: a hit rate that clears the sample floor, weighted by how
 * far it beat holding. Then the engine's own confidence. Then the crowding
 * deduction. A candidate without a trustworthy backtest is not scored low —
 * it is rejected, because the whole premise is picking on certainty, and a
 * number nobody can stand behind is not a small amount of certainty but none.
 */
export function scoreCandidate(c: Candidate): ScoredCandidate {
  const why: string[] = [];

  if (c.backtest.count < MIN_BACKTEST_SAMPLE || c.backtest.hitRate === null) {
    return {
      ...c,
      conviction: 0,
      why,
      rejected: `only ${c.backtest.count} historical signals (need ${MIN_BACKTEST_SAMPLE}) — hit rate not yet meaningful`,
    };
  }

  const edge = edgeOver(c.backtest);
  if (edge === null) {
    return { ...c, conviction: 0, why, rejected: "no baseline to compare the backtest against" };
  }
  if (edge <= 0) {
    return {
      ...c,
      conviction: 0,
      why,
      rejected: `signal averaged ${c.backtest.avgReturn?.toFixed(1)}% against ${c.backtest.baselineAvgReturn?.toFixed(1)}% for simply holding — no edge`,
    };
  }

  // Hit rate above a coin flip is the certainty term; below it, the signal is
  // worse than chance and contributes nothing rather than going negative.
  const overChance = Math.max(0, c.backtest.hitRate - 50);
  const certainty = overChance * 1.2;
  const edgePoints = Math.min(edge * 3, 24);
  const confidencePoints = CONFIDENCE_POINTS[c.confidence];
  const penalty = crowdingPenalty(c.volumeRatio, c.trending);

  why.push(`${c.backtest.hitRate}% of ${c.backtest.count} past signals went the right way`);
  why.push(`averaged ${c.backtest.avgReturn!.toFixed(1)}% vs ${c.backtest.baselineAvgReturn!.toFixed(1)}% for holding`);
  if (c.confidence !== "Low") why.push(`${c.confidence.toLowerCase()} signal confidence`);
  if (!c.trending && (c.volumeRatio === null || c.volumeRatio <= 2)) {
    why.push("not trending and no volume spike — the crowd has not arrived");
  }
  if (penalty > 0) {
    why.push(c.trending ? "already trending, which counts against it" : "elevated volume, which counts against it");
  }

  return {
    ...c,
    conviction: Math.round((certainty + edgePoints + confidencePoints - penalty) * 10) / 10,
    why,
    rejected: null,
  };
}

/**
 * The day's picks, best first.
 *
 * Returns fewer than `max` — including none — rather than filling the list.
 * Three names is the ceiling, not a quota: a day with one trustworthy setup
 * should show one, and a day with none should say so. Padding the list with
 * candidates that failed the certainty test would defeat the point of having
 * one.
 */
export function selectPicks(candidates: Candidate[], max = MAX_PICKS_PER_DAY): ScoredCandidate[] {
  return candidates
    .map(scoreCandidate)
    .filter(c => c.rejected === null && c.conviction > 0)
    .sort((a, b) => b.conviction - a.conviction)
    .slice(0, max);
}

// ── Grading ─────────────────────────────────────────────────────────────────

export type PickOutcome = {
  returnPct: number;
  /** True when the direction was right: up for a call, down for a put. */
  correct: boolean;
};

/**
 * What a pick was worth after the horizon.
 *
 * Measured on the UNDERLYING, not on an option's premium. Simulating the
 * option would need historical chain data, implied volatility and theta across
 * the period, none of which is available from a free source — and presenting a
 * modelled premium as a realised result would be a fiction dressed as a
 * record. The direction is what the pick asserted, so the direction is what is
 * graded.
 */
export function gradePick(
  direction: "BUY" | "SELL",
  entryPrice: number,
  exitPrice: number,
): PickOutcome | null {
  if (!(entryPrice > 0) || !(exitPrice > 0)) return null;
  const move = ((exitPrice - entryPrice) / entryPrice) * 100;
  return {
    returnPct: Math.round(move * 100) / 100,
    // A put profits from a fall, so the sign that counts is inverted.
    correct: direction === "BUY" ? move > 0 : move < 0,
  };
}

/** Realised record across graded picks. */
export function trackRecord(outcomes: PickOutcome[]): {
  count: number; hitRate: number | null; avgReturn: number | null;
} {
  if (outcomes.length === 0) return { count: 0, hitRate: null, avgReturn: null };
  const hits = outcomes.filter(o => o.correct).length;
  const avg = outcomes.reduce((s, o) => s + o.returnPct, 0) / outcomes.length;
  return {
    count: outcomes.length,
    hitRate: Math.round((hits / outcomes.length) * 1000) / 10,
    avgReturn: Math.round(avg * 100) / 100,
  };
}
