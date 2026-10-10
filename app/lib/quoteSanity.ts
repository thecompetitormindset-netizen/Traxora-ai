// Previous-close resolution and quote plausibility.
//
// Yahoo's chart `meta` carries two superficially similar fields:
//
//   previousClose      — the prior session's close
//   chartPreviousClose — the close preceding the FIRST BAR of the requested
//                        range, which for `range=1y` is a price from a year ago
//
// Routes across this app resolved previous close as
// `previousClose ?? chartPreviousClose ?? price`. Whenever `previousClose` was
// absent that fell through to a window-start price, so a multi-month move was
// rendered and scored as a single session's move. The observed case was OXY at
// $58.55 against a year-old $44.15 close, displayed as +32.62% in one day.
//
// The error scales with the requested range: ~6 days at `range=6d`, ~30 at
// `range=30d`, a full year at `range=1y`. It is not cosmetic where a momentum
// term reads the percentage, because a fabricated move inflates a ranking.
//
// Everything here is pure so it can be unit tested without network access.

/** A single-session move larger than this is treated as implausible for a large cap. */
export const MAX_PLAUSIBLE_DAILY_PCT = 20;

/**
 * Two previous-close candidates that disagree by more than this are assumed to
 * be on different bases (adjusted vs unadjusted, or across a split), in which
 * case the daily series is trusted over the metadata field.
 */
const CANDIDATE_AGREEMENT_TOLERANCE = 0.25;

export interface QuoteMetaLike {
  previousClose?: number | null;
  /**
   * Accepted in the type so callers can pass `meta` straight through, but
   * deliberately never read: it is the close before the range's first bar.
   */
  chartPreviousClose?: number | null;
}

type CloseSeries = readonly (number | null | undefined)[];

const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Resolve the previous *session* close for a daily bar series.
 *
 * `closes` must be ascending daily closes whose final element is the current
 * (or most recently completed) session; nulls for untraded bars are ignored.
 * The second-to-last usable close is therefore the previous session, and is the
 * authoritative answer.
 *
 * `meta.previousClose` is preferred when it agrees with the series. When the
 * two disagree beyond a split-sized gap the series wins, because a stale or
 * differently-adjusted metadata field is exactly the failure this function
 * exists to contain. `meta.chartPreviousClose` is never consulted.
 */
export function resolvePreviousClose(
  meta: QuoteMetaLike | null | undefined,
  closes: CloseSeries = [],
): number | null {
  const usable = closes.filter(isPositiveNumber);
  const fromSeries = usable.length >= 2 ? usable[usable.length - 2] : null;
  const fromMeta   = isPositiveNumber(meta?.previousClose) ? meta!.previousClose! : null;

  if (fromMeta !== null && fromSeries !== null) {
    const disagreement = Math.abs(fromMeta - fromSeries) / fromSeries;
    return disagreement <= CANDIDATE_AGREEMENT_TOLERANCE ? fromMeta : fromSeries;
  }
  return fromMeta ?? fromSeries;
}

/** Percent change of `price` against `previousClose`, or null if not computable. */
export function computeChangePct(price: number, previousClose: number | null): number | null {
  if (!isPositiveNumber(price) || !isPositiveNumber(previousClose)) return null;
  return ((price - previousClose) / previousClose) * 100;
}

/**
 * Percent change that falls back to 0 rather than null, for the display paths
 * that have no way to render "unknown". Use `computeChangePct` where the
 * distinction between "flat" and "unknown" matters.
 */
export function changePctOrZero(price: number, previousClose: number | null): number {
  return computeChangePct(price, previousClose) ?? 0;
}

export type QuoteSanity =
  | { ok: true;  changePct: number; reason: null }
  | { ok: false; changePct: number | null; reason: string };

export interface QuoteSanityInput {
  symbol: string;
  price: number;
  previousClose: number | null;
  /**
   * Large caps do not move 20% in a session without news that invalidates a
   * technical setup anyway. Small caps legitimately can, so the magnitude gate
   * is skipped for them.
   */
  isLargeCap?: boolean;
}

/**
 * Decide whether a quote is safe to rank and render.
 *
 * A suspect quote should be excluded from ranking and logged rather than shown:
 * a bogus percent change corrupts every ranking whose score reads it, not just
 * the row it appears on.
 */
export function checkQuoteSanity({
  symbol,
  price,
  previousClose,
  isLargeCap = true,
}: QuoteSanityInput): QuoteSanity {
  if (!isPositiveNumber(price)) {
    return { ok: false, changePct: null, reason: `${symbol}: non-positive or missing price` };
  }
  if (!isPositiveNumber(previousClose)) {
    return { ok: false, changePct: null, reason: `${symbol}: no usable previous close` };
  }

  const changePct = computeChangePct(price, previousClose)!;

  if (isLargeCap && Math.abs(changePct) > MAX_PLAUSIBLE_DAILY_PCT) {
    return {
      ok: false,
      changePct,
      reason:
        `${symbol}: implausible ${changePct.toFixed(2)}% single-session move ` +
        `(price ${price.toFixed(2)} vs previous close ${previousClose.toFixed(2)}) — ` +
        `exceeds the ${MAX_PLAUSIBLE_DAILY_PCT}% large-cap gate, likely a stale or ` +
        `mis-based previous close`,
    };
  }

  return { ok: true, changePct, reason: null };
}
