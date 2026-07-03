export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 10;

import { auth } from "@/auth";

const INDICES = [
  { symbol: "SPY",     label: "S&P 500"  },
  { symbol: "QQQ",     label: "NASDAQ"   },
  { symbol: "DIA",     label: "Dow"      },
  { symbol: "GLD",     label: "Gold"     },
  { symbol: "BTC-USD", label: "Bitcoin"  },
];

export type IndexRow = {
  symbol: string;
  label:  string;
  price:  number | null;
  change: number | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const syms = INDICES.map(i => i.symbol).join(",");
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=regularMarketPrice,regularMarketChangePercent`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);

    const json = await res.json();
    const map: Record<string, { regularMarketPrice?: number; regularMarketChangePercent?: number }> = {};
    for (const q of json?.quoteResponse?.result ?? []) {
      map[q.symbol] = q;
    }

    const rows: IndexRow[] = INDICES.map(({ symbol, label }) => ({
      symbol,
      label,
      price:  map[symbol]?.regularMarketPrice          ?? null,
      change: map[symbol]?.regularMarketChangePercent  ?? null,
    }));

    return Response.json(rows);
  } catch {
    return Response.json([]);
  }
}
