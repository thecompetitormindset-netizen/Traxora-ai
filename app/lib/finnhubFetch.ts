// Finnhub, for the quotes Yahoo will no longer reliably serve.
//
// Measured from the deployment itself (GET /api/health/data-sources, a cold
// instance, three Yahoo calls total): one succeeded, two were rate limited
// after exhausting the retry ladder. `since_boot` matched `this_request`, so
// that was not a budget worn down by traffic — Yahoo refuses Vercel's address
// roughly two times in three on arrival, because serverless egress addresses
// are shared and throttled by IP. The limiter in yahooFetch is working as
// designed; it has simply run out of room to help.
//
// In the same response Finnhub returned the identical price for AAPL
// (347.725) in 53ms on the first attempt, with a key that is already
// configured. So the fix is a source swap, not more backoff.
//
// Two differences from yahooFetch worth knowing:
//
//   * A 429 here is NOT retried. Yahoo throttles bursts, so backing off and
//     trying again works. Finnhub's free tier is a calls-per-minute budget, so
//     a 429 means the minute is spent and retrying only spends the next one.
//     The caller falls back to Yahoo for that symbol instead.
//
//   * An unknown or uncovered symbol answers 200 with every field zeroed
//     rather than an error status. That is a miss, not a quote, and is counted
//     separately — a zeroed body reaching a chart as a real price would be a
//     worse bug than the missing data this replaces.

const CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_BUDGET_MS = 8_000;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)));

let active = 0;

/** Wait for a slot, or give up if the deadline passes first. */
async function acquire(deadline: number): Promise<boolean> {
  for (;;) {
    const now = Date.now();
    if (now >= deadline) return false;
    if (active < CONCURRENCY) {
      active++;
      return true;
    }
    await sleep(Math.min(25, deadline - now));
  }
}

export type FinnhubStats = {
  ok: number;
  /** 200, but the body was zeroed — symbol not covered. */
  miss: number;
  /** 429: the per-minute budget is spent. */
  rateLimited: number;
  /** Network error, timeout, or a non-429 error status. */
  failed: number;
  /** Never sent — no key, or the budget was gone before a slot came free. */
  skipped: number;
};

const totals: FinnhubStats = { ok: 0, miss: 0, rateLimited: 0, failed: 0, skipped: 0 };

export function newFinnhubStats(): FinnhubStats {
  return { ok: 0, miss: 0, rateLimited: 0, failed: 0, skipped: 0 };
}

/** Counters since this instance started. */
export function finnhubTotals(): FinnhubStats {
  return { ...totals };
}

type Outcome = keyof FinnhubStats;

function record(outcome: Outcome, into?: FinnhubStats) {
  totals[outcome]++;
  if (into) into[outcome]++;
}

export function hasFinnhubKey(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

/**
 * Finnhub serves US equities and ETFs through /quote. Crypto and continuous
 * futures live on different endpoints with different symbologies, so pairs like
 * `BTC-USD` would come back as a zeroed body — a miss that costs a call and a
 * round trip to learn nothing. Skip them and let Yahoo, which handles them
 * natively, take those directly.
 */
export function isFinnhubEligible(symbol: string): boolean {
  if (!symbol) return false;
  if (/-(USD|USDT|EUR|GBP)$/i.test(symbol)) return false;  // crypto pairs
  if (/[=^]/.test(symbol)) return false;                   // futures (=F), indices (^GSPC)
  return true;
}

export type FinnhubQuote = {
  price: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
};

/** The /quote body. Every numeric field is zero for a symbol Finnhub lacks. */
type QuoteBody = {
  c?: number;   // current
  pc?: number;  // previous close
  o?: number;
  h?: number;
  l?: number;
};

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Turn a /quote body into a quote, or null if it is the zeroed "no such
 * symbol" response. Both price and previous close must be present: a price
 * without a previous close cannot produce a percent change, which is the whole
 * reason these routes make the call.
 */
export function parseFinnhubQuote(body: unknown): FinnhubQuote | null {
  if (typeof body !== "object" || body === null) return null;
  const q = body as QuoteBody;
  if (!positive(q.c) || !positive(q.pc)) return null;
  return {
    price: q.c,
    previousClose: q.pc,
    open: positive(q.o) ? q.o : null,
    high: positive(q.h) ? q.h : null,
    low: positive(q.l) ? q.l : null,
  };
}

export type FinnhubOptions = {
  timeoutMs?: number;
  budgetMs?: number;
  stats?: FinnhubStats;
  /** Appears in the throttle log line. Never pass anything secret. */
  label?: string;
};

/** Retained for the original callers; the options are the same. */
export type FinnhubQuoteOptions = FinnhubOptions;

export type FinnhubResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "rateLimited" }
  | { kind: "failed" }
  | { kind: "skipped" };

/**
 * One Finnhub GET through the concurrency gate.
 *
 * `pathAndQuery` is everything after `/api/v1/` without the token, which this
 * appends — so a token never has to be assembled, logged or passed around at a
 * call site.
 *
 * This records `rateLimited`, `failed` and `skipped` itself but deliberately
 * does NOT record `ok`: Finnhub answers 200 with an empty or zeroed payload for
 * things it does not carry, so only the caller can say whether a 200 was a real
 * answer or a miss. Callers must record one of those two.
 */
export async function finnhubJson<T>(
  pathAndQuery: string,
  opts: FinnhubOptions = {},
): Promise<FinnhubResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, budgetMs = DEFAULT_BUDGET_MS, stats, label } = opts;

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    record("skipped", stats);
    return { kind: "skipped" };
  }

  const deadline = Date.now() + budgetMs;
  if (!(await acquire(deadline))) {
    record("skipped", stats);
    return { kind: "skipped" };
  }

  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      record("skipped", stats);
      return { kind: "skipped" };
    }

    const joiner = pathAndQuery.includes("?") ? "&" : "?";
    const url = `https://finnhub.io/api/v1/${pathAndQuery}${joiner}token=${encodeURIComponent(key)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
      });
    } catch {
      record("failed", stats);
      return { kind: "failed" };
    }

    if (res.status === 429) {
      // The minute's budget is spent; a retry would only spend the next one.
      // Never log the URL — it carries the token.
      console.warn(`[finnhub] rate limited${label ? ` — ${label}` : ""}`);
      record("rateLimited", stats);
      return { kind: "rateLimited" };
    }
    if (!res.ok) {
      // 403 here means the endpoint is not on this key's plan. That is a
      // permanent "no" rather than a transient one, but it is still just no
      // answer as far as the caller is concerned.
      record("failed", stats);
      return { kind: "failed" };
    }

    try {
      return { kind: "ok", data: await res.json() as T };
    } catch {
      record("failed", stats);
      return { kind: "failed" };
    }
  } finally {
    active--;
  }
}

/**
 * One quote, or null for every failure mode: no key, ineligible symbol,
 * throttled, unreachable, or a symbol Finnhub does not carry. Callers treat
 * null as "ask Yahoo instead", so the distinctions live in the counters rather
 * than in the return type.
 */
export async function finnhubQuote(
  symbol: string,
  opts: FinnhubOptions = {},
): Promise<FinnhubQuote | null> {
  if (!isFinnhubEligible(symbol)) {
    record("skipped", opts.stats);
    return null;
  }

  const res = await finnhubJson<QuoteBody>(
    `quote?symbol=${encodeURIComponent(symbol)}`,
    { ...opts, label: opts.label ?? symbol },
  );
  if (res.kind !== "ok") return null;

  const quote = parseFinnhubQuote(res.data);
  record(quote ? "ok" : "miss", opts.stats);
  return quote;
}
