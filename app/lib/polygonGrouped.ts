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

/**
 * Keep the API key out of anything that will be logged or returned.
 *
 * Provider error messages echo the request often enough that this is worth
 * doing unconditionally rather than reasoning about which ones do.
 */
export function redactKey(text: string, key: string): string {
  if (!key) return text;
  return text.split(key).join("[redacted]");
}

export type GroupedOutcome = "ok" | "no_key" | "empty" | "failed" | "forbidden" | "rate_limited" | "budget";

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
 * A 403 is reported as `forbidden` — "this key may not have this date" — and
 * nothing more. It used to be reported as `not_entitled`, meaning "this
 * endpoint is not on this key's plan", which is a much larger claim than one
 * response can support, and it was wrong: a backfill run served 49 consecutive
 * grouped dates and then hit a 403 on the 50th, at which point the caller
 * announced the endpoint was unavailable and stopped with 80 dates still to
 * fetch. The 403 was about the date — the clock had just rolled past midnight
 * UTC, putting the previous session at the front of the queue before the free
 * tier releases it.
 *
 * Whether a 403 means the plan or the date cannot be told apart from the
 * response, because Polygon answers both with NOT_AUTHORIZED. So this function
 * stops at what it observed and the caller, which knows whether this key has
 * ever been served, draws the conclusion.
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
      console.warn(`[polygon] grouped daily forbidden for ${date}`);
      // Polygon explains itself in the body. Pass that through so the caller's
      // log says which refusal this was instead of only "HTTP 403" — but keep
      // it short, and never let the key travel in a detail string.
      let why = "";
      try {
        const text = (await res.text()).slice(0, 400);
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed.message === "string") why = parsed.message.slice(0, 160);
      } catch {
        // A non-JSON or unreadable body is not worth failing over; the status
        // is the part that matters.
      }
      return {
        date, bars: [], received: 0, outcome: "forbidden",
        detail: why ? `HTTP 403 — ${redactKey(why, key)}` : "HTTP 403",
      };
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
