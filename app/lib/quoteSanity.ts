// Quote plausibility + previous-close resolution.
//
// Root cause of the "OXY +32.62%" incident: the scan pulled its previous close
// from Yahoo's `meta.chartPreviousClose`, which is the close preceding the START
// of the requested chart range — not the previous session. The scan requests
// `range=1y`, so that field is a price from roughly a year earlier. Comparing a
// live price against it produced a year-to-date move rendered as a one-day move,
// which then fed the momentum term of the ranking score.
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
   * Present in Yahoo chart responses but deliberately NOT consulted: it is the
   * close before the first bar of the requested range, not yesterday's close.
   */
  chartPreviousClose?: number | null;
}

const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Resolve the previous *session* close for a daily bar series.
 *
 * `closes` must be ascending daily closes whose final element is the current
 * (or most recently completed) session — the same convention the scan already
 * uses for its 5-day trend. The second-to-last close is therefore the previous
 * session, and is the authoritative answer.
 *
 * `meta.previousClose` is used when it agrees with the series. When the two
 * disagree beyond a split-sized gap the series wins, because a stale or
 * differently-adjusted metadata field is exactly the failure that produced the
 * +32.62% render. `meta.chartPreviousClose` is never used.
 */
export function resolvePreviousClose(
  meta: QuoteMetaLike | null | undefined,
  closes: readonly number[],
): number | null {
  const seriesPrev = closes.length >= 2 ? closes[closes.length - 2] : undefined;
  const fromSeries = isPositiveNumber(seriesPrev) ? seriesPrev : null;
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
 * A suspect quote must be excluded from ranking and logged rather than shown —
 * a bogus percent change corrupts every ranking the momentum term touches, not
 * just the card it appears on.
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
