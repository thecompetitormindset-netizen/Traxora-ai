// Daily bars from Polygon, which is the only free source that reliably answers.
//
// Measured from the deployment: 84 daily bars in 62ms, with the last close
// matching Finnhub's live quote exactly. Over the same period Yahoo — the only
// previous source for this data — answered 2 requests in 15, and took 3.3 to
// 6.5 seconds to fail each time. That timing is why Yahoo cannot stay in the
// hot path even as a fallback without a tight budget: failing slowly is worse
// for a page than failing fast.
//
// Two constraints shape everything here.
//
// The free tier allows roughly five calls a minute. A 25-symbol scan therefore
// cannot fetch per request — it would take five minutes. So bars are cached,
// and the cache is keyed by trading date rather than by a duration: a daily bar
// for a completed session never changes, so it is valid until the next session
// produces one. A time-based TTL would re-fetch unchanged data and spend the
// minute budget for nothing.
//
// The free tier is also end-of-day. The newest bar is the previous session's,
// so intraday an EMA or a 5-day trend computed from these alone lags by a day.
// `withLiveBar` appends the live price as a provisional final bar to close that
// gap — kept separate from the fetch so the stored history stays exactly what
// the provider said, and the provisional part is always identifiable.

import { etTradingDate, nyseSessionStatus } from "./marketTime";

export type DailyBar = {
  /** Session date, `YYYY-MM-DD` in ET. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /**
   * True when this bar is today's live price standing in for a session that
   * has not closed yet. Such a bar has no real volume and must not be counted
   * in a volume average.
   */
  provisional?: boolean;
};

const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Polygon's aggregate row. `t` is epoch milliseconds for the session start,
 * `v` is volume — fractional when adjusted for splits, hence the rounding.
 */
type AggRow = { t?: number; o?: number; h?: number; l?: number; c?: number; v?: number };

/**
 * Turn an aggregates response into bars, dropping any row that is not a
 * complete OHLC. A partial row cannot be used for a high/low range or an EMA,
 * and silently passing one through would put a zero into a technical.
 */
export function parsePolygonBars(body: unknown): DailyBar[] {
  if (body == null || typeof body !== "object") return [];
  const rows = (body as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];

  const bars: DailyBar[] = [];
  for (const r of rows as AggRow[]) {
    if (!positive(r?.o) || !positive(r?.h) || !positive(r?.l) || !positive(r?.c)) continue;
    if (typeof r.t !== "number" || !Number.isFinite(r.t)) continue;
    bars.push({
      date: etTradingDate(new Date(r.t)),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      // Volume is adjusted and can arrive fractional. Round rather than carry
      // a fraction of a share into a volume ratio.
      volume: typeof r.v === "number" && Number.isFinite(r.v) && r.v >= 0 ? Math.round(r.v) : 0,
    });
  }
  // Ascending by date, which every technical here assumes.
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}

// ── Rate limiting ───────────────────────────────────────────────────────────

/**
 * The free tier's budget is per minute rather than per burst, so a concurrency
 * cap would not describe it. This counts starts in a rolling window and
 * refuses rather than queueing: a caller that cannot be served now should fall
 * back or use what it has, not hold a request open waiting for a minute to
 * pass.
 */
const CALLS_PER_MINUTE = 5;
const WINDOW_MS = 60_000;
const starts: number[] = [];

function takeSlot(): boolean {
  const now = Date.now();
  while (starts.length > 0 && now - starts[0] >= WINDOW_MS) starts.shift();
  if (starts.length >= CALLS_PER_MINUTE) return false;
  starts.push(now);
  return true;
}

/** Visible for tests and for the health route. */
export function polygonBudgetRemaining(): number {
  const now = Date.now();
  while (starts.length > 0 && now - starts[0] >= WINDOW_MS) starts.shift();
  return Math.max(0, CALLS_PER_MINUTE - starts.length);
}

export function __resetPolygonBudget(): void {
  starts.length = 0;
}

// ── Cache ───────────────────────────────────────────────────────────────────

/**
 * Keyed by symbol, stamped with the trading date it was fetched for. A
 * completed session's bar never changes, so an entry stays valid until the
 * trading date moves on — no duration to tune, and no re-fetch of data that
 * cannot have changed.
 *
 * This is per-instance and therefore dies with the serverless instance. It
 * removes repeat calls within one instance's life, which is enough to keep a
 * scan inside the minute budget once warm, but it is not durable storage. The
 * durable version is the same bars in Supabase, written by a scheduled job,
 * and this shape is what that job would persist.
 */
type Entry = { asOf: string; bars: DailyBar[] };
const cache = new Map<string, Entry>();
const MAX_SYMBOLS = 200;

export function __clearPolygonCache(): void {
  cache.clear();
}

/**
 * The trading date whose bars we expect to be the newest available.
 *
 * Polygon's free tier is end-of-day, so during a session the newest COMPLETE
 * bar is the previous session's. Stamping the cache with today's date while
 * the market is open would mark an entry fresh that is missing nothing — the
 * point is only that it does not change until a new session closes.
 */
function cacheStamp(now = new Date()): string {
  return etTradingDate(now);
}

// ── Fetch ───────────────────────────────────────────────────────────────────

export type PolygonBarsOptions = {
  /** Calendar days of history to request. 400 covers a year of sessions. */
  days?: number;
  timeoutMs?: number;
  /** Skip the cache; for the scheduled refresh. */
  force?: boolean;
};

export type PolygonOutcome = "ok" | "cached" | "no_key" | "budget" | "failed" | "empty";

export type PolygonResult = {
  bars: DailyBar[];
  outcome: PolygonOutcome;
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Daily bars for one symbol, newest last.
 *
 * Never throws. An empty `bars` with an `outcome` saying why lets the caller
 * decide between falling back to another source and reporting a gap — the
 * distinction between "no key", "budget spent" and "provider said no" matters
 * for which of those is right.
 */
export async function polygonBars(
  symbol: string,
  opts: PolygonBarsOptions = {},
): Promise<PolygonResult> {
  const { days = 400, timeoutMs = 8_000, force = false } = opts;

  const key = process.env.POLYGON_API_KEY;
  if (!key) return { bars: [], outcome: "no_key" };

  const stamp = cacheStamp();
  if (!force) {
    const hit = cache.get(symbol);
    if (hit && hit.asOf === stamp) return { bars: hit.bars, outcome: "cached" };
  }

  if (!takeSlot()) {
    // Budget spent. Serving yesterday's cached bars beats serving none, so an
    // expired entry is still offered rather than discarded.
    const stale = cache.get(symbol);
    if (stale) return { bars: stale.bars, outcome: "cached" };
    return { bars: [], outcome: "budget" };
  }

  const to = iso(Date.now());
  const from = iso(Date.now() - days * 86_400_000);
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=500&apiKey=${encodeURIComponent(key)}`;

  let body: unknown;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      // Never log the URL — it carries the key.
      console.warn(`[polygon] HTTP ${res.status} for ${symbol}`);
      const stale = cache.get(symbol);
      return stale ? { bars: stale.bars, outcome: "cached" } : { bars: [], outcome: "failed" };
    }
    body = await res.json();
  } catch {
    const stale = cache.get(symbol);
    return stale ? { bars: stale.bars, outcome: "cached" } : { bars: [], outcome: "failed" };
  }

  const bars = parsePolygonBars(body);
  if (bars.length === 0) return { bars: [], outcome: "empty" };

  if (cache.size >= MAX_SYMBOLS && !cache.has(symbol)) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(symbol, { asOf: stamp, bars });
  return { bars, outcome: "ok" };
}

// ── Keeping the series current ──────────────────────────────────────────────

/**
 * Append the live price as today's provisional bar, so an EMA or a 5-day trend
 * reflects today rather than yesterday's close.
 *
 * End-of-day bars are a day behind during a session. Without this, every
 * technical in the options path would be computed as though the current
 * session had not happened — which is exactly the kind of quietly-stale input
 * this codebase has been removing all along.
 *
 * The provisional bar carries no volume, because today's volume is not known
 * from either source. It is flagged so a volume average can exclude it rather
 * than treat a zero as a real reading.
 */
export function withLiveBar(bars: DailyBar[], livePrice: number | null, now = new Date()): DailyBar[] {
  if (!positive(livePrice) || bars.length === 0) return bars;

  const today = etTradingDate(now);
  const last = bars[bars.length - 1];

  // Nothing to add outside a session: the last close already is the latest
  // state of the market.
  if (nyseSessionStatus(now).status !== "OPEN") return bars;

  // The session's own bar has already arrived; replacing it with a live price
  // would discard a real high, low and volume.
  if (last.date === today) return bars;

  return [
    ...bars,
    {
      date: today,
      open: livePrice,
      high: livePrice,
      low: livePrice,
      close: livePrice,
      volume: 0,
      provisional: true,
    },
  ];
}

/** The series as plain arrays, which the existing technical helpers expect. */
export function toSeries(bars: DailyBar[]): {
  closes: number[]; highs: number[]; lows: number[]; opens: number[]; volumes: number[];
} {
  return {
    closes: bars.map(b => b.close),
    highs: bars.map(b => b.high),
    lows: bars.map(b => b.low),
    opens: bars.map(b => b.open),
    // A provisional bar has no real volume; a zero here would drag an average
    // down as though the session had traded nothing.
    volumes: bars.filter(b => !b.provisional).map(b => b.volume),
  };
}
