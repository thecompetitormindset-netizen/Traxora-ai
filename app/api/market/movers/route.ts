export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { auth } from "@/auth";

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

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const unique = [...new Set(UNIVERSE)];
  const syms   = unique.join(",");

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);

    const json = await res.json();
    const rows: MoverRow[] = (json?.quoteResponse?.result ?? []).map(
      (q: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number; regularMarketVolume?: number }) => ({
        symbol: q.symbol,
        price:  q.regularMarketPrice          ?? null,
        change: q.regularMarketChangePercent  ?? null,
        volume: q.regularMarketVolume         ?? null,
      }),
    ).filter((r: MoverRow) => r.change !== null);

    rows.sort((a, b) => (b.change ?? 0) - (a.change ?? 0));

    const data: MoversData = {
      gainers:   rows.slice(0, 6),
      losers:    rows.slice(-6).reverse(),
      updatedAt: new Date().toISOString(),
    };

    return Response.json(data);
  } catch {
    return Response.json({ gainers: [], losers: [], updatedAt: new Date().toISOString() });
  }
}
