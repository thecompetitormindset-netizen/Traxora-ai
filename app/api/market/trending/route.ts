export const runtime = "nodejs";

import { fullQuote } from "@/app/lib/marketQuote";
import { yahooJson } from "@/app/lib/yahooFetch";

// The trending LIST has no free equivalent outside Yahoo, so that call stays.
// The per-symbol quotes behind it do not: they now come through fullQuote,
// which asks Finnhub first. They were also using a bare fetch, so they never
// passed through the rate limiter — eight unthrottled requests per request.
//
// A symbol Yahoo declines still appears, with its price and change from
// Finnhub and nulls where the day's open, high and low would be.

export async function GET() {
  try {
    const trendData = await yahooJson<{ finance?: { result?: Array<{ quotes?: { symbol: string }[] }> } }>(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=15",
      { timeoutMs: 5000, budgetMs: 8_000, label: "trending" },
    );
    const symbols: string[] = (trendData?.finance?.result?.[0]?.quotes ?? [])
      .map((q: { symbol: string }) => q.symbol)
      .filter((s: string) => !s.includes("=") && !s.includes("^") && !s.includes("-"));

    const quotes = await Promise.all(
      symbols.slice(0, 8).map(async (symbol) => {
        const q = await fullQuote(symbol, { range: "2d", yahooBudgetMs: 9_000 });
        if (!q) return null;
        return {
          symbol:        q.symbol,
          name:          q.name ?? symbol,
          price:         q.price,
          previousClose: q.previousClose,
          changePct:     q.changePercent,
          open:          q.open,
          high:          q.high,
          low:           q.low,
        };
      }),
    );

    return Response.json({ trending: quotes.filter(Boolean) });
  } catch {
    return Response.json({ trending: [] });
  }
}
