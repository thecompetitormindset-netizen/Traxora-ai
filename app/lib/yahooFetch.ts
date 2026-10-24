// One throttled door for every Yahoo request the app makes.
//
// Yahoo's finance endpoints are not an API with a quota — they rate-limit by IP
// and answer 429 with no warning. Measured from a normal connection, a single
// request succeeds while four fired at once all come back 429. The app was
// doing far worse than four: eleven routes fan out with an unbounded
// Promise.all, up to 126 requests at a time. Nothing retried, and every call
// site treated a failure as "no data", so the symptom was quietly missing
// prices rather than a visible error.
//
// Three things happen here. Requests queue so only a few are ever in flight.
// A 429 is retried with backoff instead of being discarded. And the outcome of
// every call is counted, so a route can say it was throttled rather than
// pretending the market had nothing to report.
//
// Serverless note: this state is per-instance, which is exactly the scope that
// matters — the damaging burst is one route fanning out within one invocation.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Four at once was enough to trip Yahoo's limiter, so stay below it. This
 * matches the concurrency optionsAnalysis/scan.ts already settled on.
 */
const CONCURRENCY = 2;

/** Minimum gap between request starts, so a burst is spread rather than stacked. */
const MIN_SPACING_MS = 120;

/** Backoff before each retry of a 429, unless the response asks for longer. */
const BACKOFF_MS = [400, 900, 1800];

/** Default ceiling on queue wait plus transfer for a single call. */
const DEFAULT_BUDGET_MS = 9_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)));

let active = 0;
let lastStart = 0;

/** Wait for a slot, or give up if the deadline passes first. */
async function acquire(deadline: number): Promise<boolean> {
  for (;;) {
    const now = Date.now();
    if (now >= deadline) return false;
    if (active < CONCURRENCY && now - lastStart >= MIN_SPACING_MS) {
      active++;
      lastStart = now;
      return true;
    }
    await sleep(Math.min(25, deadline - now));
  }
}

export type YahooOutcome = "ok" | "rate_limited" | "failed" | "skipped";

export type YahooStats = {
  ok: number;
  /** Gave up after retrying a 429. */
  rateLimited: number;
  /** Network error, timeout, or a non-429 error status. */
  failed: number;
  /** Never sent — the budget was gone before a slot came free. */
  skipped: number;
};

const totals: YahooStats = { ok: 0, rateLimited: 0, failed: 0, skipped: 0 };

function record(outcome: YahooOutcome, into?: YahooStats) {
  const bump = (s: YahooStats) => {
    if (outcome === "ok") s.ok++;
    else if (outcome === "rate_limited") s.rateLimited++;
    else if (outcome === "failed") s.failed++;
    else s.skipped++;
  };
  bump(totals);
  if (into) bump(into);
}

/** Counters since this instance started. */
export function yahooTotals(): YahooStats {
  return { ...totals };
}

/** Fresh counters for one route's work, so it can report what happened. */
export function newYahooStats(): YahooStats {
  return { ok: 0, rateLimited: 0, failed: 0, skipped: 0 };
}

/** True when enough calls were throttled that the result is not the whole picture. */
export function wasThrottled(s: YahooStats): boolean {
  return s.rateLimited + s.skipped > 0;
}

export type YahooFetchOptions = {
  /** Per-attempt network timeout. */
  timeoutMs?: number;
  /** Ceiling on queue wait plus every attempt. Keep it under the route's maxDuration. */
  budgetMs?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Collects the outcome alongside the process-wide totals. */
  stats?: YahooStats;
  /** Label for the throttle log line. */
  label?: string;
};

/**
 * Fetch a Yahoo URL through the queue. Returns null rather than throwing: every
 * existing call site already treats a missing result as "no data", so this slots
 * in without changing their error handling — the difference is that a 429 is now
 * retried first, and counted either way.
 */
export async function yahooFetch(url: string, opts: YahooFetchOptions = {}): Promise<Response | null> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    budgetMs = DEFAULT_BUDGET_MS,
    headers = {},
    stats,
    label,
  } = opts;

  const deadline = Date.now() + budgetMs;

  if (!(await acquire(deadline))) {
    record("skipped", stats);
    return null;
  }

  try {
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        record("skipped", stats);
        return null;
      }

      let res: Response;
      try {
        res = await fetch(url, {
          cache: "no-store",
          headers: { "User-Agent": UA, ...headers },
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        });
      } catch {
        record("failed", stats);
        return null;
      }

      if (res.status !== 429) {
        record(res.ok ? "ok" : "failed", stats);
        return res.ok ? res : null;
      }

      // Rate limited. Back off and try again while the budget allows.
      const backoff = BACKOFF_MS[attempt];
      if (backoff === undefined) {
        console.warn(`[yahoo] rate limited, giving up after ${attempt} retries${label ? ` — ${label}` : ""}`);
        record("rate_limited", stats);
        return null;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff;
      if (Date.now() + waitMs >= deadline) {
        console.warn(`[yahoo] rate limited, no budget left to retry${label ? ` — ${label}` : ""}`);
        record("rate_limited", stats);
        return null;
      }
      await sleep(waitMs);
    }
  } finally {
    active--;
  }
}

/**
 * The shape of a v8 chart response, loose enough for every caller. Numeric meta
 * fields and the name fields are separated so arithmetic on a price still
 * typechecks.
 */
export type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        exchangeName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketOpen?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
        averageDailyVolume10Day?: number;
        averageDailyVolume3Month?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
};

/** yahooFetch plus JSON parsing. Null covers both a failed call and an unparseable body. */
export async function yahooJson<T = unknown>(url: string, opts: YahooFetchOptions = {}): Promise<T | null> {
  const res = await yahooFetch(url, opts);
  if (!res) return null;
  try { return await res.json() as T; }
  catch { record("failed", opts.stats); return null; }
}
