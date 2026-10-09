import { viewer } from "@/app/lib/viewer";
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

type ChartMeta = { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketVolume?: number };

/** Finnhub quote when a key is configured (production): c = price, dp = % change. */
async function finnhubRow(symbol: string, key: string): Promise<MoverRow | null> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const q = await r.json() as { c?: number; dp?: number | null };
    return q.c && q.c > 0 && typeof q.dp === "number" ? { symbol, price: q.c, change: q.dp, volume: null } : null;
  } catch { return null; }
}

/** Runs `fn` over items a few at a time, so providers don't rate-limit a burst. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

async function row(symbol: string): Promise<MoverRow | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (key) { const f = await finnhubRow(symbol, key); if (f) return f; }
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
      cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { chart?: { result?: Array<{ meta?: ChartMeta; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> } };
    const res = j.chart?.result?.[0];
    const m = res?.meta;
    const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => typeof c === "number");
    const price = m?.regularMarketPrice ?? closes.at(-1) ?? null;
    const prev = closes.length >= 2 ? closes.at(-2)! : m?.previousClose ?? null;
    if (!price || !prev) return null;
    return { symbol, price, change: ((price - prev) / prev) * 100, volume: m?.regularMarketVolume ?? null };
  } catch { return null; }
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
