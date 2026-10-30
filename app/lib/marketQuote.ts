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
import { finnhubQuote, type FinnhubQuote, type FinnhubStats } from "./finnhubFetch";
import { coinGeckoMarkets, isCoinGeckoSymbol } from "./coingecko";
import { yahooFetch, yahooJson, type YahooChartResponse, type YahooStats } from "./yahooFetch";

export type QuoteSource = "finnhub" | "yahoo" | "coingecko";

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
  // Crypto first, in one request for all of it.
  //
  // These pairs are not on Finnhub's free tier under the symbols this app
  // uses, so every coin fell through to Yahoo — the source that rate-limits
  // this deployment about two requests in three — and the board filled with
  // dashes. CoinGecko answers the whole set in a single keyless call.
  //
  // Only crypto takes this path. Stocks are quoted exactly as before.
  const coinSymbols = symbols.filter(isCoinGeckoSymbol);
  const coins = new Map<string, MarketQuote>();

  if (coinSymbols.length > 0) {
    const r = await coinGeckoMarkets(coinSymbols);
    if (r.ok) {
      for (const [symbol, q] of r.quotes) {
        if (q.price === null) continue;   // an unpriced coin is not an answer
        coins.set(symbol, {
          symbol,
          price: q.price,
          change: q.changePct === null ? null : round2(q.changePct),
          source: "coingecko",
        });
      }
    }
    // A CoinGecko failure is not fatal: anything it could not answer falls
    // through to the existing providers below, exactly as it used to.
  }

  return Promise.all(
    symbols.map(s => {
      const hit = coins.get(s.toUpperCase()) ?? coins.get(s);
      return hit ? Promise.resolve(hit) : marketQuote(s, opts);
    }),
  );
}

// ---------------------------------------------------------------------------
// The wider quote, for callers that need more than price and change
// ---------------------------------------------------------------------------

/**
 * Everything the analysis paths read, with every field that might be absent
 * typed as absent.
 *
 * That typing is the point. smartMoneyScore already treats a null volume as
 * "unknown" and declines to produce a volume signal from it:
 *
 *   const volRatio = volume != null && avgVolume && avgVolume > 0 ? … : null;
 *
 * but its callers were substituting values before it ever got the chance —
 * `avgVolume ?? volume` yields a ratio of exactly 1.0, and
 * `fiftyTwoWeekHigh ?? price` collapses the 52-week range onto the current
 * price. Both read downstream as real, unremarkable readings. Passing the
 * nulls through lets the scorer do what it was written to do.
 */
export type FullQuote = {
  symbol: string;
  name: string | null;
  price: number;
  previousClose: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  avgVolume: number | null;
  high52w: number | null;
  low52w: number | null;
  /** Daily closes over the requested range, ascending. Empty without Yahoo. */
  closes: number[];
  /** True when the volume history arrived, so volume-based signals are real. */
  enriched: boolean;
  source: QuoteSource | "mixed";
};

type ChartResult = NonNullable<NonNullable<YahooChartResponse["chart"]>["result"]>[number];

const positives = (a: (number | null | undefined)[] | undefined): number[] =>
  (a ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

const orNull = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Merge a Finnhub quote and a Yahoo chart result into one record, or null when
 * neither carried a price. Finnhub's price wins where both arrive: it is the
 * live leg, and Yahoo's copy may be an older print.
 *
 * Pure, so the substitution rules can be tested without network access.
 */
export function mergeFullQuote(
  symbol: string,
  fh: FinnhubQuote | null,
  result: ChartResult | null,
): FullQuote | null {
  const meta = result?.meta ?? null;
  const q = result?.indicators?.quote?.[0];
  const closes = positives(q?.close);

  const yahooPrice = orNull(meta?.regularMarketPrice) ?? closes.at(-1) ?? null;
  const price = fh?.price ?? yahooPrice;
  if (price === null) return null;

  const previousClose = fh?.previousClose ?? resolvePreviousClose(meta, closes) ?? price;
  const volume = orNull(meta?.regularMarketVolume) ?? positives(q?.volume).at(-1) ?? null;

  // Only an average computed from enough history, or one Yahoo supplied
  // directly. Never today's volume standing in for its own average.
  const volumes = positives(q?.volume);
  const avgVolume = volumes.length >= 5
    ? Math.round(volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 20))
    : orNull(meta?.averageDailyVolume10Day) ?? orNull(meta?.averageDailyVolume3Month) ?? null;

  const source: FullQuote["source"] =
    fh && result ? "mixed" : fh ? "finnhub" : "yahoo";

  return {
    symbol,
    name: meta?.shortName ?? meta?.longName ?? null,
    price,
    previousClose,
    changePercent: computeChangePct(price, previousClose) ?? 0,
    open: fh?.open ?? orNull(meta?.regularMarketOpen) ?? positives(q?.open).at(-1) ?? null,
    high: fh?.high ?? orNull(meta?.regularMarketDayHigh) ?? positives(q?.high).at(-1) ?? null,
    low:  fh?.low  ?? orNull(meta?.regularMarketDayLow)  ?? positives(q?.low).at(-1)  ?? null,
    volume,
    avgVolume,
    high52w: orNull(meta?.fiftyTwoWeekHigh),
    low52w:  orNull(meta?.fiftyTwoWeekLow),
    closes,
    enriched: volume !== null && avgVolume !== null && avgVolume > 0,
    source,
  };
}

export type FullQuoteOptions = MarketQuoteOptions & {
  /** Yahoo chart range; pick the shortest the caller's series needs. */
  range?: string;
};

/**
 * Price and change from Finnhub, the rest from Yahoo where it answers.
 *
 * Both are attempted together rather than in sequence: the enrichment is worth
 * having whenever it is available, and the Finnhub leg is what guarantees the
 * caller gets a usable record at all.
 */
export async function fullQuote(symbol: string, opts: FullQuoteOptions = {}): Promise<FullQuote | null> {
  const {
    range = "10d",
    finnhubBudgetMs = 8_000,
    yahooBudgetMs = 12_000,
    finnhubStats,
    yahooStats,
  } = opts;

  const [fh, chart] = await Promise.all([
    finnhubQuote(symbol, { budgetMs: finnhubBudgetMs, stats: finnhubStats }).catch(() => null),
    yahooJson<YahooChartResponse>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`,
      { timeoutMs: 8_000, budgetMs: yahooBudgetMs, label: symbol, stats: yahooStats },
    ).catch(() => null),
  ]);

  return mergeFullQuote(symbol, fh, chart?.chart?.result?.[0] ?? null);
}
