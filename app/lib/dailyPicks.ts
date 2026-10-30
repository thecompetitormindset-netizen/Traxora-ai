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
 * The edge over simply holding, in the direction the pick actually asserts.
 *
 * A hit rate alone says nothing: if a stock rose in 60% of all 14-day windows,
 * a 60% hit rate is the market, not a signal. What matters is the gap between
 * what the signal returned and what the same period returned regardless.
 *
 * The direction is not optional here, and getting it wrong is not academic.
 * This was first written as `avgReturn - baseline` for both directions, which
 * is right for a call and backwards for a put. It promoted a real NFLX SELL
 * candidate to rank 1 on these numbers:
 *
 *   73.5% of 102 signals "went the right way"
 *   averaged -1.5% against -1.7% for holding
 *
 * The price did fall after the signal — but by LESS than it fell anyway, so
 * the signal was worse than doing nothing. The subtraction returned +0.2 and
 * waved it through. A put wants the price lower than baseline, so for SELL the
 * terms are the other way round.
 *
 * This is the whole reason the edge check exists: a high hit rate on a stock
 * that drifts downward is the drift, not a signal.
 */
export function edgeOver(stats: BacktestStats, direction: Candidate["direction"]): number | null {
  if (stats.avgReturn === null || stats.baselineAvgReturn === null) return null;
  return direction === "BUY"
    ? stats.avgReturn - stats.baselineAvgReturn
    : stats.baselineAvgReturn - stats.avgReturn;
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

  const edge = edgeOver(c.backtest, c.direction);
  if (edge === null) {
    return { ...c, conviction: 0, why, rejected: "no baseline to compare the backtest against" };
  }
  if (edge <= 0) {
    const verb = c.direction === "BUY" ? "rose" : "fell";
    return {
      ...c,
      conviction: 0,
      why,
      rejected:
        `price ${verb} ${Math.abs(c.backtest.avgReturn ?? 0).toFixed(1)}% after the signal against ` +
        `${Math.abs(c.backtest.baselineAvgReturn ?? 0).toFixed(1)}% anyway — no edge over doing nothing`,
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
  // Stated as a gain over doing nothing, in the direction asserted, so the
  // line cannot read as favourable when it is not — the failure that put a
  // worse-than-baseline short at rank 1.
  why.push(
    `${edge.toFixed(1)} points better than holding ` +
    `(${c.backtest.avgReturn!.toFixed(1)}% after the signal vs ${c.backtest.baselineAvgReturn!.toFixed(1)}% anyway)`,
  );
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
  /** The move in the UNDERLYING, signed. Negative means the price fell. */
  returnPct: number;
  /** True when the direction was right: up for a call, down for a put. */
  correct: boolean;
  /** Which way the pick called it. Needed to read returnPct's sign. */
  direction: "BUY" | "SELL";
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
    direction,
  };
}

/**
 * How far a pick moved IN THE DIRECTION IT CALLED.
 *
 * returnPct is the move in the underlying, so a short that worked is negative.
 * Averaging those raw numbers across both directions produces something that
 * is not a return at all: a day of correct bearish calls would average to a
 * loss, and the record would report the system losing money precisely when it
 * was right.
 *
 * This is the same mistake that once put a worse-than-baseline short at rank 1
 * — a comparison made without reference to the direction being asserted. The
 * sign has to be read against the call, never on its own.
 */
export function moveInFavour(o: PickOutcome): number {
  return o.direction === "BUY" ? o.returnPct : -o.returnPct;
}

/**
 * Realised record across graded picks.
 *
 * `avgReturn` is the average move in the direction called, so it is positive
 * when the picks worked whichever way they pointed. `hitRate` and `avgReturn`
 * are null — not zero — when nothing has been graded: a fresh install has no
 * record, and "0% right" is a claim about performance rather than a statement
 * that there is nothing to report yet.
 */
export function trackRecord(outcomes: PickOutcome[]): {
  count: number; hitRate: number | null; avgReturn: number | null;
} {
  if (outcomes.length === 0) return { count: 0, hitRate: null, avgReturn: null };
  const hits = outcomes.filter(o => o.correct).length;
  const avg = outcomes.reduce((s, o) => s + moveInFavour(o), 0) / outcomes.length;
  return {
    count: outcomes.length,
    hitRate: Math.round((hits / outcomes.length) * 1000) / 10,
    avgReturn: Math.round(avg * 100) / 100,
  };
}
