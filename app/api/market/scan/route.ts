export const runtime = "nodejs";
export const maxDuration = 30;

import { auth } from "@/auth";
import { getUserPlan } from "@/app/lib/subscription";

const STATIC_UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","AMD","NFLX","ORCL",
  "JPM","BAC","GS","V","MA","WMT","COST","TGT","UNH","JNJ",
  "PFE","ABBV","XOM","CVX","OXY","QCOM","INTC","MU","AVGO","CRM",
  "ADBE","NOW","SNOW","SHOP","PYPL","SQ","UBER","LYFT","RIVN","PLTR",
  "SPY","QQQ","IWM","DIS","BABA",
];

interface StockData {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  changePercent: number;
  volume: number;
  avgVolume: number;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  history5d: number[];
  news: { title: string; publisher: string; age: string }[];
  volumeRatio: number;
  yearRangePct: number | null;
  score: number;
}

async function batchRun<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 10,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = await Promise.all(items.slice(i, i + batchSize).map(fn));
    out.push(...chunk);
  }
  return out;
}

async function fetchTrending(): Promise<string[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=20",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    const data = await res.json();
    return (data?.finance?.result?.[0]?.quotes ?? []).map((q: { symbol: string }) => q.symbol);
  } catch {
    return [];
  }
}

async function fetchExtendedQuote(symbol: string): Promise<StockData | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=10d`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    const q      = result?.indicators?.quote?.[0];
    if (!meta || meta.regularMarketPrice == null) return null;

    const price   = meta.regularMarketPrice as number;
    const prevCls = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const changePct = prevCls ? ((price - prevCls) / prevCls) * 100 : 0;

    const closes:  number[] = (q?.close  ?? []).filter(Boolean);
    const volumes: number[] = (q?.volume ?? []).filter(Boolean);
    const opens:   number[] = (q?.open   ?? []).filter(Boolean);
    const highs:   number[] = (q?.high   ?? []).filter(Boolean);
    const lows:    number[] = (q?.low    ?? []).filter(Boolean);

    const todayVol = (meta.regularMarketVolume ?? volumes.at(-1) ?? 0) as number;
    // averageDailyVolume fields are not returned by the chart endpoint — compute from history
    const avgVol = volumes.length >= 5
      ? Math.round(volumes.slice(-20).reduce((s: number, v: number) => s + v, 0) / Math.min(volumes.length, 20))
      : (meta.averageDailyVolume10Day ?? meta.averageDailyVolume3Month ?? todayVol) as number;
    const h52 = (meta.fiftyTwoWeekHigh ?? null) as number | null;
    const l52 = (meta.fiftyTwoWeekLow  ?? null) as number | null;

    const yearRangePct =
      h52 && l52 && h52 > l52 ? ((price - l52) / (h52 - l52)) * 100 : null;

    return {
      symbol,
      name: (meta.shortName ?? meta.longName ?? symbol) as string,
      price,
      previousClose: prevCls,
      open:  opens.at(-1) ?? null,
      high:  highs.at(-1) ?? null,
      low:   lows.at(-1)  ?? null,
      changePercent: changePct,
      volume:    todayVol,
      avgVolume: avgVol,
      high52w: h52,
      low52w:  l52,
      marketCap: (meta.marketCap ?? null) as number | null,
      history5d: closes.slice(-5),
      news: [],
      volumeRatio:  avgVol > 0 ? todayVol / avgVol : 1,
      yearRangePct,
      score: 0,
    };
  } catch {
    return null;
  }
}

async function fetchNews(symbol: string) {
  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}` +
      `&newsCount=4&quotesCount=0&enableFuzzyQuery=false`;
    const res  = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return ((data?.news ?? []) as Array<{ title?: string; publisher?: string; providerPublishTime?: number }>)
      .slice(0, 4)
      .map((n) => ({
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const plan = await getUserPlan(session.user.email);
  if (plan !== "pro") return Response.json({ error: "Pro required" }, { status: 403 });

  try {
    // 1. Trending tickers
    const trending = await fetchTrending();

    // 2. Merge + deduplicate
    const universe = [
      ...new Set([...trending.slice(0, 20), ...STATIC_UNIVERSE]),
    ].slice(0, 55);

    // 3. Fetch extended quotes in batches of 10
    const rawQuotes = await batchRun(universe, fetchExtendedQuote, 10);
    const valid = rawQuotes.filter(Boolean) as StockData[];

    // 4. Score every stock
    valid.forEach((s) => {
      const volSurge = Math.min(s.volumeRatio, 10); // cap at 10x for scoring
      const momentum = Math.abs(s.changePercent);
      // near 52-week extremes are high-probability smart money zones
      const extremeBonus =
        s.yearRangePct != null
          ? s.yearRangePct <= 15 || s.yearRangePct >= 85
            ? 4
            : 0
          : 0;
      s.score = volSurge * 3 + momentum * 2 + extremeBonus;
    });

    const sorted = valid.sort((a, b) => b.score - a.score);

    // 5. Fetch news only for top 15 (avoid hammering Yahoo)
    const top15 = sorted.slice(0, 15);
    const newsResults = await batchRun(top15, (s) => fetchNews(s.symbol), 5);
    top15.forEach((s, i) => { s.news = newsResults[i] ?? []; });

    // apply news boost and re-sort top 15
    top15.forEach((s) => {
      s.score += Math.min(s.news.length * 1.5, 4.5);
    });
    top15.sort((a, b) => b.score - a.score);

    return Response.json({
      scanned: valid.length,
      trending: trending.slice(0, 5),
      top: top15.slice(0, 12),
    });
  } catch {
    return Response.json({ error: "Scan failed" }, { status: 500 });
  }
}
