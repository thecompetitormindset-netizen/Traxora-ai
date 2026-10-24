export const runtime = "nodejs";
export const maxDuration = 30;

import { viewer } from "@/app/lib/viewer";
import { computeChangePct, resolvePreviousClose } from "@/app/lib/quoteSanity";
import { finnhubQuote } from "@/app/lib/finnhubFetch";
import { yahooJson, type YahooChartResponse } from "@/app/lib/yahooFetch";
import { buildRow, type ScanBase, type ScanEnrichment, type StockData } from "@/app/lib/scanScoring";

// The site's heaviest market caller, and the one with the most to get wrong.
//
// Two problems were live here. The smaller one: fetchExtendedQuote and
// fetchNews used a bare fetch, so the 45-symbol fan-out never went through the
// rate limiter added for exactly this — ten unthrottled requests at a time, to
// an endpoint that answers 429 at two.
//
// The larger one is about what the output claimed. Every ranking input came
// from Yahoo, each failure returned null, and nulls were simply filtered out.
// With Yahoo answering about one request in nine from this deployment, the
// route would rank the handful that survived and present them as the top
// opportunities, with nothing to say the other forty were never seen. A
// ranking drawn from an 11% sample, rendered as though it were the whole
// market. That is the same shape of defect as a fabricated percent change: not
// a crash, just a confident number that is wrong.
//
// So the two jobs are now separated by how reliable their source is:
//
//   The row     — symbol, price, percent change — comes from Finnhub, which
//                 answers. Every symbol gets one, so the list is never empty.
//   The ranking — volume surge and position in the 52-week range — comes from
//                 Yahoo, which mostly does not. A symbol without it is scored
//                 on momentum alone and marked `enriched: false`.
//
// The response carries how many rows are fully scored, and `degraded` when
// that is not all of them, so the UI can say the order is based on partial
// evidence instead of implying otherwise.

const STATIC_UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","AMD","NFLX","ORCL",
  "JPM","BAC","GS","V","MA","WMT","COST","TGT","UNH","JNJ",
  "PFE","ABBV","XOM","CVX","OXY","QCOM","INTC","MU","AVGO","CRM",
  "ADBE","NOW","SNOW","SHOP","PYPL","SQ","UBER","LYFT","RIVN","PLTR",
  "SPY","QQQ","IWM","DIS","BABA",
];

export type ScanResult = {
  scanned: number;
  /** How many of `scanned` have volume and 52-week data behind their score. */
  enriched: number;
  /** True when at least one row is ranked on momentum alone. */
  degraded: boolean;
  trending: string[];
  top: StockData[];
};

async function fetchTrending(): Promise<string[]> {
  try {
    const data = await yahooJson<{ finance?: { result?: Array<{ quotes?: { symbol: string }[] }> } }>(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=20",
      { timeoutMs: 5000, budgetMs: 8_000, label: "trending" },
    );
    return (data?.finance?.result?.[0]?.quotes ?? []).map((q: { symbol: string }) => q.symbol);
  } catch {
    return [];
  }
}

/** Price and change from Finnhub — the part that has to work. */
async function fetchBase(symbol: string): Promise<ScanBase | null> {
  const q = await finnhubQuote(symbol, { budgetMs: 8_000 });
  if (!q) return null;
  return {
    price: q.price,
    previousClose: q.previousClose,
    changePercent: computeChangePct(q.price, q.previousClose) ?? 0,
    open: q.open,
    high: q.high,
    low: q.low,
  };
}

const nums = (a: (number | null | undefined)[] | undefined): number[] =>
  (a ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

/** The ranking inputs, from Yahoo — the part that often will not work. */
async function fetchEnrichment(symbol: string): Promise<ScanEnrichment | null> {
  try {
    const json = await yahooJson<YahooChartResponse>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`,
      { timeoutMs: 8_000, budgetMs: 18_000, label: `scan ${symbol}` },
    );
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!result) return null;

    const q = result.indicators?.quote?.[0];
    const closes = nums(q?.close);
    const volumes = nums(q?.volume);

    // averageDailyVolume is not on the chart endpoint, so it comes from the
    // history. Fewer than five bars is not an average worth ranking on.
    const avgVolume = volumes.length >= 5
      ? Math.round(volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 20))
      : meta?.averageDailyVolume10Day ?? meta?.averageDailyVolume3Month ?? null;

    return {
      name: meta?.shortName ?? meta?.longName ?? null,
      price: typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : closes.at(-1) ?? null,
      previousClose: resolvePreviousClose(meta, closes),
      volume: meta?.regularMarketVolume ?? volumes.at(-1) ?? null,
      avgVolume,
      high52w: meta?.fiftyTwoWeekHigh ?? null,
      low52w: meta?.fiftyTwoWeekLow ?? null,
      marketCap: null,
      history5d: closes.slice(-5),
      open: nums(q?.open).at(-1) ?? meta?.regularMarketOpen ?? null,
      high: nums(q?.high).at(-1) ?? meta?.regularMarketDayHigh ?? null,
      low: nums(q?.low).at(-1) ?? meta?.regularMarketDayLow ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchNews(symbol: string) {
  try {
    const data = await yahooJson<{ news?: Array<{ title?: string; publisher?: string; providerPublishTime?: number }> }>(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}` +
      `&newsCount=4&quotesCount=0&enableFuzzyQuery=false`,
      { timeoutMs: 5_000, budgetMs: 9_000, label: `news ${symbol}` },
    );
    return (data?.news ?? []).slice(0, 4).map((n) => ({
      title:     n.title     ?? "",
      publisher: n.publisher ?? "",
      age:       n.providerPublishTime ? formatAge(n.providerPublishTime) : "",
    }));
  } catch {
    return [];
  }
}

function formatAge(unix: number): string {
  const s = Math.floor(Date.now() / 1000 - unix);
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The result is a ranking, not a live quote, so a few minutes of staleness
// costs nothing.
// A degraded pass is held only briefly: it is worth not refetching
// immediately, but not worth pinning a partial ranking for the full window
// when the next attempt might get the volume data.
let cache: { at: number; ttl: number; data: ScanResult } | null = null;
const TTL = 5 * 60_000;
const DEGRADED_TTL = 60_000;

export async function GET() {
  const session = await viewer();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (cache && Date.now() - cache.at < cache.ttl) return Response.json(cache.data);

  try {
    const trending = await fetchTrending();
    const universe = [...new Set([...trending.slice(0, 20), ...STATIC_UNIVERSE])].slice(0, 55);

    // Both halves are requested per symbol. Each client has its own queue, so
    // the two do not contend: Finnhub's gate holds its concurrency, Yahoo's
    // holds its own and sheds whatever the budget cannot cover — which is
    // precisely the partial enrichment this route now reports rather than
    // hides.
    const rows = await Promise.all(universe.map(async (symbol) => {
      const [base, extra] = await Promise.all([
        fetchBase(symbol).catch(() => null),
        fetchEnrichment(symbol).catch(() => null),
      ]);
      return buildRow(symbol, base, extra);
    }));

    const valid = rows.filter((r): r is StockData => r !== null);
    const sorted = valid.sort((a, b) => b.score - a.score);

    // News only for the top 15, and only worth asking for while Yahoo is
    // answering at all — if nothing was enriched it is throttling us flat.
    const top15 = sorted.slice(0, 15);
    if (valid.some(r => r.enriched)) {
      const newsResults = await Promise.all(top15.map(s => fetchNews(s.symbol)));
      top15.forEach((s, i) => {
        s.news = newsResults[i] ?? [];
        s.score += Math.min(s.news.length * 1.5, 4.5);
      });
      top15.sort((a, b) => b.score - a.score);
    }

    const enriched = valid.filter(r => r.enriched).length;
    const data: ScanResult = {
      scanned: valid.length,
      enriched,
      degraded: enriched < valid.length,
      trending: trending.slice(0, 5),
      top: top15.slice(0, 12),
    };

    // Only hold a pass that found something, so a shut-out run does not pin an
    // empty board.
    if (valid.length > 0) {
      cache = { at: Date.now(), ttl: data.degraded ? DEGRADED_TTL : TTL, data };
    }
    return Response.json(data);
  } catch {
    return Response.json({ scanned: 0, enriched: 0, degraded: true, trending: [], top: [] } satisfies ScanResult);
  }
}
