// Grading the market: what the book said, and what then happened.
//
// This is not a betting feature. Nothing here places, prices or recommends a
// wager — it records the line a book was offering before a game and checks it
// against the result afterwards, which is the same accountability the app
// already applies to its own predictions.
//
// ── The thing that has to be got right ───────────────────────────────────────
//
// A single line is never "right" or "wrong". A -150 favourite losing is not a
// bookmaker error, it is the 40% happening. Reporting it as an error, game by
// game, would be exactly the confident-looking nonsense this codebase keeps
// removing. Two things ARE honestly measurable:
//
//   Calibration — across hundreds of games, did the chances the market
//   implied actually come up at that rate?
//
//   Whether our own pick beat the closing line — which is the only benchmark
//   that means anything. A pick that is right 58% of the time where the market
//   implied 57% has found nothing.
//
// So nothing here returns a verdict on one game. Everything returns either a
// mechanical outcome (did the favourite win, did the spread cover) or an
// aggregate with its sample size attached, and refuses to report a rate at all
// below a floor where the number would be noise.

/** Below this many settled games, a hit rate is noise and is not reported. */
export const MIN_GRADED = 25;

/** Below this many games in a calibration band, the band is not reported. */
export const MIN_PER_BAND = 10;

// ── Odds arithmetic ──────────────────────────────────────────────────────────

/**
 * What an American moneyline implies about the chance of winning.
 *
 * -150 means risking 150 to win 100, so the book is pricing roughly a 60%
 * chance. +130 means risking 100 to win 130, roughly 43%.
 *
 * This includes the book's margin, so two sides of the same game come to more
 * than 100%. Use `devig` before comparing it to anything real.
 */
export function impliedProbability(moneyline: number): number | null {
  if (!Number.isFinite(moneyline) || moneyline === 0) return null;
  return moneyline < 0
    ? -moneyline / (-moneyline + 100)
    : 100 / (moneyline + 100);
}

/**
 * The two sides' chances with the book's margin taken out.
 *
 * A book quoting -150/+130 is implying 60% and 43.5%, which sums to 103.5%:
 * the overround is how it makes money. Comparing a raw 60% against how often
 * that side actually won would therefore mark the book down for its own
 * margin, every time, and call it a forecasting error. Scaling both to sum to
 * one is the least that makes the comparison fair.
 */
export function devig(homeMl: number | null, awayMl: number | null): { home: number; away: number; overround: number } | null {
  if (homeMl === null || awayMl === null) return null;
  const h = impliedProbability(homeMl);
  const a = impliedProbability(awayMl);
  if (h === null || a === null) return null;
  const sum = h + a;
  if (sum <= 0) return null;
  return { home: h / sum, away: a / sum, overround: sum - 1 };
}

// ── What the book said, read off its own wording ─────────────────────────────

/**
 * The spread as it applies to the home team.
 *
 * Books write it from the favourite's side — "DEN -4.5" — so which team is
 * named decides the sign. Normalising to one convention here means the grading
 * below cannot get it backwards, which on a spread is the difference between a
 * cover and a loss.
 *
 * Null when the wording cannot be read, rather than a guess at zero: a line of
 * zero is a real and different claim from no line.
 */
export function homeSpread(
  details: string | null,
  homeAbbr: string | null,
  awayAbbr: string | null,
): number | null {
  if (!details) return null;
  const text = details.trim();
  // "EVEN" and "PK" are a pick-em: no side is favoured.
  if (/^(even|pk|pick)$/i.test(text)) return 0;

  const m = text.match(/([A-Za-z]{2,5})?\s*([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const named = (m[1] ?? "").toUpperCase();
  const value = Number(m[2]);
  if (!Number.isFinite(value)) return null;

  const home = (homeAbbr ?? "").toUpperCase();
  const away = (awayAbbr ?? "").toUpperCase();

  if (named && home && named === home) return value;
  if (named && away && away === named) return -value;
  // No team named, or one we do not recognise. A spread whose side is unknown
  // cannot be graded, and guessing which team it belongs to would produce a
  // confident wrong answer half the time.
  return named ? null : value;
}

// ── Mechanical outcomes ──────────────────────────────────────────────────────

export type Settled = "home" | "away" | "push";

/** Who the moneyline favoured. Null for a genuine pick-em or a missing line. */
export function favouredSide(homeMl: number | null, awayMl: number | null): "home" | "away" | null {
  if (homeMl === null || awayMl === null) return null;
  if (homeMl === awayMl) return null;
  return homeMl < awayMl ? "home" : "away";
}

/** Which side the result landed on. */
export function winner(homeScore: number, awayScore: number): Settled {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "push";
}

/**
 * Did the home team cover the spread.
 *
 * A push is its own outcome. Folding pushes into either column would quietly
 * move a hit rate, and on a sport with whole-number spreads there are a lot of
 * them.
 */
export function gradeSpread(homeLine: number | null, homeScore: number, awayScore: number): Settled | null {
  if (homeLine === null) return null;
  const adjusted = homeScore - awayScore + homeLine;
  if (adjusted > 0) return "home";
  if (adjusted < 0) return "away";
  return "push";
}

export type TotalResult = "over" | "under" | "push";

export function gradeTotal(total: number | null, homeScore: number, awayScore: number): TotalResult | null {
  if (total === null) return null;
  const combined = homeScore + awayScore;
  if (combined > total) return "over";
  if (combined < total) return "under";
  return "push";
}

// ── Aggregates, which is where a claim may honestly be made ──────────────────

export type GradedGame = {
  /** De-vigged chance the market gave the side that was favoured. */
  marketProbability: number | null;
  /** Which side the market favoured. */
  marketPick: "home" | "away" | null;
  /** Our own pick, for the comparison that matters. */
  ourPick: "home" | "away" | null;
  /** Our stated confidence, 0-1. */
  ourProbability: number | null;
  /** What happened. A push leaves both unjudged. */
  result: Settled;
};

export type Rate = {
  /** Null below the floor, so a rate is never printed from a handful of games. */
  hitRate: number | null;
  correct: number;
  /** Games that could be judged — pushes and missing lines excluded. */
  graded: number;
  /** Why no rate is shown, when none is. */
  note: string | null;
};

function rate(correct: number, graded: number, what: string): Rate {
  if (graded < MIN_GRADED) {
    return {
      hitRate: null, correct, graded,
      note: `${graded} settled ${graded === 1 ? "game" : "games"} with ${what} — ${MIN_GRADED} needed before a rate means anything`,
    };
  }
  return { hitRate: correct / graded, correct, graded, note: null };
}

/** How often the market's favourite actually won. */
export function marketRecord(games: GradedGame[]): Rate {
  let correct = 0, graded = 0;
  for (const g of games) {
    if (!g.marketPick || g.result === "push") continue;
    graded++;
    if (g.marketPick === g.result) correct++;
  }
  return rate(correct, graded, "a closing line");
}

/** How often our own pick was right, over the same games. */
export function ourRecord(games: GradedGame[]): Rate {
  let correct = 0, graded = 0;
  for (const g of games) {
    if (!g.ourPick || g.result === "push") continue;
    graded++;
    if (g.ourPick === g.result) correct++;
  }
  return rate(correct, graded, "a pick");
}

export type HeadToHead = {
  /** Games where we and the market disagreed and the game settled. */
  disagreements: number;
  /** Of those, how often we were the one who was right. */
  weWere: number;
  /** Null until there are enough disagreements to mean anything. */
  ourShare: number | null;
  note: string | null;
};

/**
 * The only comparison that tests an edge.
 *
 * Agreeing with the market proves nothing: if both pick the same side, being
 * right says the favourite won. What matters is the games where we took the
 * other side, and how often that was the better call.
 */
export function versusMarket(games: GradedGame[]): HeadToHead {
  let disagreements = 0, weWere = 0;
  for (const g of games) {
    if (!g.ourPick || !g.marketPick || g.result === "push") continue;
    if (g.ourPick === g.marketPick) continue;
    disagreements++;
    if (g.ourPick === g.result) weWere++;
  }
  if (disagreements < MIN_GRADED) {
    return {
      disagreements, weWere, ourShare: null,
      note: `${disagreements} ${disagreements === 1 ? "game" : "games"} where we disagreed with the closing line — ${MIN_GRADED} needed before this says anything`,
    };
  }
  return { disagreements, weWere, ourShare: weWere / disagreements, note: null };
}

export type Band = {
  /** "60-70%" */
  label: string;
  low: number;
  high: number;
  games: number;
  /** How often that side actually won. Null below the per-band floor. */
  actual: number | null;
  /** The average chance the market implied inside this band. */
  implied: number | null;
};

const BANDS: Array<[number, number]> = [
  [0.50, 0.55], [0.55, 0.60], [0.60, 0.65], [0.65, 0.70],
  [0.70, 0.80], [0.80, 0.90], [0.90, 1.01],
];

/**
 * Calibration: did the chances the market implied actually come up at that rate?
 *
 * This is the honest version of "was the book right". A band where the market
 * implied 65% and the favourite won 64% of the time is a market doing its job,
 * not a market making errors — and a band well off its implied rate is the only
 * thing that would be evidence of anything.
 */
export function calibration(games: GradedGame[]): Band[] {
  return BANDS.map(([low, high]) => {
    let count = 0, won = 0, impliedSum = 0;
    for (const g of games) {
      if (!g.marketPick || g.marketProbability === null || g.result === "push") continue;
      if (g.marketProbability < low || g.marketProbability >= high) continue;
      count++;
      impliedSum += g.marketProbability;
      if (g.marketPick === g.result) won++;
    }
    return {
      label: `${Math.round(low * 100)}–${Math.round(high * 100) > 100 ? 100 : Math.round(high * 100)}%`,
      low, high,
      games: count,
      actual: count >= MIN_PER_BAND ? won / count : null,
      implied: count > 0 ? impliedSum / count : null,
    };
  });
}
