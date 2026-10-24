// One price-and-change lookup, Finnhub first and Yahoo second.
//
// `indices` and `heatmap` each carried their own copy of the same Yahoo chart
// parsing, and both needed only two numbers out of it: the last price and the
// move against the previous session. Finnhub's /quote returns exactly those two
// fields directly, so these routes can take the reliable source and keep Yahoo
// for what it is still needed for — crypto, and anything Finnhub's free tier
// does not carry.
//
// The ordering is what makes this safe to ship. Every uncertainty about
// Finnhub's coverage resolves to a null, and a null falls through to the Yahoo
// path these routes already used. The worst case is today's behaviour; it is
// not possible for this to be worse than what it replaces.
//
// `scan` deliberately stays on Yahoo: it needs twenty-day volume averages, the
// 52-week range and a five-day series, none of which /quote carries. Its
// protection is the five-minute cache instead.

import { computeChangePct, resolvePreviousClose } from "./quoteSanity";
import { finnhubQuote, type FinnhubStats } from "./finnhubFetch";
import { yahooFetch, type YahooChartResponse, type YahooStats } from "./yahooFetch";

export type QuoteSource = "finnhub" | "yahoo";

export type MarketQuote = {
  symbol: string;
  price: number | null;
  /** Percent move against the previous session close, rounded to 2dp. */
  change: number | null;
  /** Which provider answered, or null when neither did. */
  source: QuoteSource | null;
};

const round2 = (n: number) => parseFloat(n.toFixed(2));

const empty = (symbol: string): MarketQuote => ({ symbol, price: null, change: null, source: null });

export type MarketQuoteOptions = {
  /** Ceiling for the Finnhub attempt. */
  finnhubBudgetMs?: number;
  /** Ceiling for the Yahoo fallback. */
  yahooBudgetMs?: number;
  finnhubStats?: FinnhubStats;
  yahooStats?: YahooStats;
};

/**
 * Yahoo's v8 chart endpoint, which still works unauthenticated per symbol —
 * unlike v7/finance/quote, which now demands a cookie and crumb.
 *
 * Previous close goes through `resolvePreviousClose` rather than being read
 * straight off the series. It prefers `meta.previousClose` when that agrees
 * with the daily closes and falls back to the series when they diverge, and it
 * never touches `chartPreviousClose` — the field that rendered a year-long OXY
 * move as a single session's +32.62%.
 */
async function fromYahoo(symbol: string, budgetMs: number, stats?: YahooStats): Promise<MarketQuote> {
  const res = await yahooFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { timeoutMs: 8_000, budgetMs, label: symbol, stats },
  );
  if (!res) return empty(symbol);

  let json: YahooChartResponse;
  try { json = await res.json() as YahooChartResponse; }
  catch { return empty(symbol); }

  const result = json?.chart?.result?.[0];
  if (!result) return empty(symbol);

  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const usable = closes.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

  const meta = result.meta;
  const price =
    typeof meta?.regularMarketPrice === "number" && meta.regularMarketPrice > 0
      ? meta.regularMarketPrice
      : usable.at(-1) ?? null;
  if (price === null) return empty(symbol);

  const prevClose = resolvePreviousClose(meta, usable);
  const change = computeChangePct(price, prevClose);

  return { symbol, price, change: change === null ? null : round2(change), source: "yahoo" };
}

/**
 * Price and percent change for one symbol.
 *
 * Never throws and never rejects: a symbol no provider could answer comes back
 * with nulls, which is what both callers already render as a blank cell.
 */
export async function marketQuote(symbol: string, opts: MarketQuoteOptions = {}): Promise<MarketQuote> {
  const {
    finnhubBudgetMs = 6_000,
    yahooBudgetMs = 8_000,
    finnhubStats,
    yahooStats,
  } = opts;

  try {
    const fh = await finnhubQuote(symbol, { budgetMs: finnhubBudgetMs, stats: finnhubStats });
    if (fh) {
      const change = computeChangePct(fh.price, fh.previousClose);
      return { symbol, price: fh.price, change: change === null ? null : round2(change), source: "finnhub" };
    }
  } catch {
    // Fall through to Yahoo — a thrown Finnhub call is still just "no answer".
  }

  try {
    return await fromYahoo(symbol, yahooBudgetMs, yahooStats);
  } catch {
    return empty(symbol);
  }
}

/** Resolve a list of symbols together, preserving input order. */
export async function marketQuotes(symbols: string[], opts: MarketQuoteOptions = {}): Promise<MarketQuote[]> {
  return Promise.all(symbols.map(s => marketQuote(s, opts)));
}
