// Every US ticker's bar for one date, in one call.
//
// This is what makes a large universe possible at all. Fetching bars symbol by
// symbol costs one call each, and the free tier releases about five a minute —
// thirty names already takes six minutes, so a universe of thousands is simply
// out of reach that way. The grouped endpoint returns the whole market for a
// date in a single request, which turns "how many symbols" into a question
// about storage rather than about rate limits.
//
// Backfilling a few months of history is therefore a few months' worth of
// CALLS, not symbols: one per trading date, done once, then one a day to stay
// current.
//
// A note on scope. The brief was to stop overlooking names nobody watches, and
// the previous universe was thirty-one household mega-caps — AAPL, NVDA, JPM —
// among which nothing is overlooked. This opens it to the whole market, with
// one necessary qualification: an options pick on an illiquid microcap is not
// actionable. There is no chain worth trading, and the spread eats the
// position. So the filter below is a LIQUIDITY floor rather than a size floor.
// Plenty of names nobody discusses clear it; names without a tradeable option
// do not.

import { etTradingDate } from "./marketTime";
import { acquirePolygonSlot } from "./polygonBars";
import type { DailyBar } from "./polygonBars";

/**
 * Minimums for a symbol to be worth carrying.
 *
 * Price keeps out sub-dollar names, where a one-cent tick is a percentage move
 * and options either do not exist or are unusable. Dollar volume — price times
 * shares, not shares alone — is the honest measure of whether a position can
 * be entered and exited: a million shares of a two-dollar stock is a far
 * thinner market than fifty thousand shares of a three-hundred-dollar one.
 */
export const MIN_PRICE = 5;
export const MIN_DOLLAR_VOLUME = 5_000_000;

/** A grouped result row. `T` is the ticker; the rest matches the aggregates shape. */
type GroupedRow = {
  T?: string; o?: number; h?: number; l?: number; c?: number; v?: number; t?: number;
};

const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Ticker shapes that are not ordinary common stock.
 *
 * Warrants, units and rights carry suffixes and have no useful options market.
 * Excluding them here keeps the stored universe to things a pick could
 * actually be taken on.
 */
function isOrdinaryTicker(t: string): boolean {
  if (!t || t.length > 5) return false;
  // Letters only. Dots and dashes mark share classes, warrants and units.
  return /^[A-Z]+$/.test(t);
}

export type GroupedBar = DailyBar & { symbol: string };

export type GroupedParse = {
  bars: GroupedBar[];
  /** How many rows arrived before filtering, for reporting what was dropped. */
  received: number;
};

/**
 * Turn a grouped response into bars for the symbols worth keeping.
 *
 * Rows missing any part of the OHLC are dropped rather than zero-filled: a
 * partial bar cannot produce a range or an average, and a zero in a technical
 * is worse than a gap.
 */
export function parseGrouped(body: unknown, date: string): GroupedParse {
  if (body == null || typeof body !== "object") return { bars: [], received: 0 };
  const rows = (body as { results?: unknown }).results;
  if (!Array.isArray(rows)) return { bars: [], received: 0 };

  const bars: GroupedBar[] = [];
  for (const r of rows as GroupedRow[]) {
    const symbol = typeof r?.T === "string" ? r.T.trim().toUpperCase() : "";
    if (!isOrdinaryTicker(symbol)) continue;
    if (!positive(r.o) || !positive(r.h) || !positive(r.l) || !positive(r.c)) continue;
    if (r.c < MIN_PRICE) continue;

    const volume = typeof r.v === "number" && Number.isFinite(r.v) && r.v >= 0 ? Math.round(r.v) : 0;
    if (r.c * volume < MIN_DOLLAR_VOLUME) continue;

    bars.push({
      symbol,
      date,
      open: r.o, high: r.h, low: r.l, close: r.c,
      volume,
    });
  }

  return { bars, received: rows.length };
}

/** The ET date a grouped response describes, from its own rows where possible. */
export function dateOfGrouped(body: unknown, fallback: string): string {
  const rows = (body as { results?: GroupedRow[] } | null)?.results;
  const t = Array.isArray(rows) ? rows.find(r => typeof r?.t === "number")?.t : undefined;
  return typeof t === "number" ? etTradingDate(new Date(t)) : fallback;
}

export type GroupedOutcome = "ok" | "no_key" | "empty" | "failed" | "not_entitled" | "rate_limited" | "budget";

export type GroupedResult = {
  date: string;
  bars: GroupedBar[];
  received: number;
  outcome: GroupedOutcome;
  detail?: string;
};

/**
 * Fetch one date's market-wide bars.
 *
 * Whether this endpoint is included in the free tier is the one thing that
 * could not be checked before writing this: the sandbox cannot reach Polygon.
 * A 403 is therefore reported as `not_entitled` rather than a generic failure,
 * so the first run says plainly whether the approach is available instead of
 * leaving it to be guessed from an empty table.
 *
 * An empty result is not an error: markets are closed on weekends and
 * holidays, and Polygon answers those with no rows.
 */
export async function polygonGroupedDaily(
  date: string,
  timeoutMs = 20_000,
  slotDeadline = Date.now() + 30_000,
): Promise<GroupedResult> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return { date, bars: [], received: 0, outcome: "no_key" };

  // Share the per-minute budget with every other Polygon call. Without this,
  // a run fired four grouped requests back to back and was throttled after
  // two — two clients each assuming five calls a minute still have five
  // between them.
  if (!(await acquirePolygonSlot(slotDeadline))) {
    return { date, bars: [], received: 0, outcome: "budget", detail: "no slot within the run's budget" };
  }

  const url =
    `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${encodeURIComponent(date)}` +
    `?adjusted=true&apiKey=${encodeURIComponent(key)}`;

  let body: unknown;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 429) {
      // The budget is spent on the provider's side regardless of what the
      // local counter believes. Say so distinctly: a caller should stop the
      // run rather than march through the remaining dates collecting 429s.
      return { date, bars: [], received: 0, outcome: "rate_limited", detail: "HTTP 429" };
    }
    if (res.status === 403) {
      // Never log the URL — it carries the key.
      console.warn(`[polygon] grouped daily not entitled for ${date}`);
      return { date, bars: [], received: 0, outcome: "not_entitled", detail: "HTTP 403" };
    }
    if (!res.ok) {
      return { date, bars: [], received: 0, outcome: "failed", detail: `HTTP ${res.status}` };
    }
    body = await res.json();
  } catch (e) {
    return {
      date, bars: [], received: 0, outcome: "failed",
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 80),
    };
  }

  const actualDate = dateOfGrouped(body, date);
  const { bars, received } = parseGrouped(body, actualDate);

  return {
    date: actualDate,
    bars,
    received,
    outcome: bars.length > 0 ? "ok" : "empty",
  };
}
