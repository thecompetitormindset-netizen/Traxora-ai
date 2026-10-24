import { viewer } from "@/app/lib/viewer";
import { fullQuote } from "@/app/lib/marketQuote";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;


const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMD","TSLA","META","AMZN","GOOGL","INTC","NFLX",
  "JPM","BAC","GS","V","MA","PYPL",
  "XOM","CVX","OXY",
  "LLY","PFE","JNJ","ABBV","MRK",
  "DIS","T","NFLX",
  "WMT","COST","TGT",
  "CAT","BA","HON",
  "SPY","QQQ","IWM",
];

export type MoverRow = {
  symbol: string;
  price:  number | null;
  change: number | null;
  volume: number | null;
};

export type MoversData = {
  gainers:   MoverRow[];
  losers:    MoverRow[];
  updatedAt: string;
};

// Yahoo's batch quote endpoint (v7) now rejects anonymous requests, so read
// each symbol's chart meta (v8, served to a plain user agent) instead.
let cache: { at: number; data: MoversData } | null = null;
const TTL = 5 * 60_000;

/** Runs `fn` over items a few at a time, so providers don't rate-limit a burst. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

// This route already preferred Finnhub, but reached it with a bare fetch —
// outside the concurrency gate and invisible to the counters, so its load and
// its throttling went unrecorded. fullQuote gives the same preference through
// the shared client, and keeps Yahoo's volume figure when Yahoo answers.
async function row(symbol: string): Promise<MoverRow | null> {
  const q = await fullQuote(symbol, { range: "5d", yahooBudgetMs: 11_000 });
  if (!q) return null;
  return { symbol: q.symbol, price: q.price, change: q.changePercent, volume: q.volume };
}

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (cache && Date.now() - cache.at < TTL) return Response.json(cache.data);

  const rows = (await inBatches([...new Set(UNIVERSE)], 6, row)).filter((r): r is MoverRow => !!r);
  rows.sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  const data: MoversData = { gainers: rows.slice(0, 6), losers: rows.slice(-6).reverse(), updatedAt: new Date().toISOString() };
  if (rows.length) cache = { at: Date.now(), data };
  return Response.json(data);
}
