// Which way a market is tilting, and how hard.
//
// The scorer answers BUY, SELL or HOLD, and HOLD covers everything between
// -3 and +3. That band was calibrated on individual stocks, which swing far
// harder than a broad fund: an index or commodity ETF spends most of its life
// inside it, so every futures market read "no call" every day. The signal was
// not absent, it was being rounded away.
//
// Two changes, kept separate on purpose.
//
// A lean always has a direction. The sign of the score says which way the
// evidence points even when it points weakly, and showing that beats hiding it
// — a reader can act on "mildly up" and cannot act on silence.
//
// And the strength is shown beside it. A lean of 0.4 and a lean of 6 are not
// the same claim, and printing them identically would be the real dishonesty.
// The bar for calling a lean worth attention is lower for a fund than for a
// stock because the instrument moves less, not because the standard slipped.

export type LeanStrength = "very weak" | "mild" | "moderate" | "strong";

export type Lean = {
  /** Which way the evidence points. Null only when the score is exactly flat. */
  direction: "BUY" | "SELL" | null;
  /** Absolute score, which the scorer produces on roughly a 0–10 scale. */
  strength: number;
  label: LeanStrength;
  /** Whether it clears the bar for this instrument — see INSTRUMENT_BAR. */
  clearsBar: boolean;
};

/**
 * How much score counts as a call worth attention, per instrument.
 *
 * A stock keeps the original bar. A broad fund gets a lower one because the
 * same underlying conviction produces a smaller number on something that moves
 * half as much — the threshold tracks the instrument's volatility, which is
 * what it was always meant to do.
 */
export const INSTRUMENT_BAR = {
  stock: 3,
  fund: 1.5,
} as const;

export type Instrument = keyof typeof INSTRUMENT_BAR;

/** Plain words for how strong a lean is, so a weak one reads as weak. */
export function strengthLabel(strength: number): LeanStrength {
  if (strength < 1.5) return "very weak";
  if (strength < 3) return "mild";
  if (strength < 5) return "moderate";
  return "strong";
}

/**
 * Turn a raw score into a direction with its strength attached.
 *
 * A score of exactly zero is the only genuinely directionless case, and it
 * stays directionless rather than being nudged one way to avoid an awkward
 * blank.
 */
export function leanFromScore(score: number, instrument: Instrument = "fund"): Lean {
  const strength = Math.min(10, Math.abs(score));
  return {
    direction: score > 0 ? "BUY" : score < 0 ? "SELL" : null,
    strength: Math.round(strength * 10) / 10,
    label: strengthLabel(strength),
    clearsBar: strength >= INSTRUMENT_BAR[instrument],
  };
}

/** "Leaning up" / "Leaning down", or the flat case. */
export function leanWords(lean: Lean): string {
  if (lean.direction === null) return "No tilt either way";
  return lean.direction === "BUY" ? "Leaning up" : "Leaning down";
}
