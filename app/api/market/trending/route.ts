export const runtime = "nodejs";

export async function GET() {
  try {
    const trendRes = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/trending/US?count=15",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    const trendData = await trendRes.json();
    const symbols: string[] = (trendData?.finance?.result?.[0]?.quotes ?? [])
      .map((q: { symbol: string }) => q.symbol)
      .filter((s: string) => !s.includes("=") && !s.includes("^") && !s.includes("-"));

    const quotes = await Promise.all(
      symbols.slice(0, 8).map(async (symbol) => {
        try {
          const url =
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
            `?interval=1d&range=2d`;
          const r = await fetch(url, {
            cache: "no-store",
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(6000),
          });
          const d    = await r.json();
          const meta = d?.chart?.result?.[0]?.meta;
          if (!meta || meta.regularMarketPrice == null) return null;

          const price = meta.regularMarketPrice as number;
          const prev  = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
          const changePct = prev ? ((price - prev) / prev) * 100 : 0;

          return {
            symbol,
            name:       (meta.shortName ?? meta.longName ?? symbol) as string,
            price,
            previousClose: prev,
            changePct,
            open:  (meta.regularMarketOpen     ?? null) as number | null,
            high:  (meta.regularMarketDayHigh  ?? null) as number | null,
            low:   (meta.regularMarketDayLow   ?? null) as number | null,
          };
        } catch {
          return null;
        }
      }),
    );

    return Response.json({ trending: quotes.filter(Boolean) });
  } catch {
    return Response.json({ trending: [] });
  }
}
