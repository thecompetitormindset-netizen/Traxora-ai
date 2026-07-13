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

// Yahoo's v7/finance/quote endpoint now requires an auth cookie/crumb (401
// Unauthorized without one). The v8/finance/chart endpoint, used elsewhere in
// this app (technicals, crypto-movers), still works unauthenticated per symbol.
async function fetchQuote({ symbol, label }: { symbol: string; label: string }): Promise<IndexRow> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return { symbol, label, price: null, change: null };
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => typeof v === "number");
    if (closes.length === 0) return { symbol, label, price: null, change: null };

    const meta  = result?.meta ?? {};
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    // Yesterday's close from the actual daily series — meta.chartPreviousClose is
    // the close before this whole range window, not necessarily yesterday's.
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    const change    = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;

    return { symbol, label, price, change: change !== null ? parseFloat(change.toFixed(2)) : null };
  } catch {
    return { symbol, label, price: null, change: null };
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const rows = await Promise.all(INDICES.map(fetchQuote));
  return Response.json(rows);
}
