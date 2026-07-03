import { toYahooSymbol } from "@/app/lib/yahooSymbol";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const apiKey = process.env.EODHD_API_KEY;

  // 1) Try EODHD (native symbol format — handles both .US and .COMM)
  if (apiKey) {
    try {
      const url =
        `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}` +
        `?api_token=${apiKey}&fmt=json&order=a`;

      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const cleaned = Array.isArray(data)
          ? data
              .map((item: any) => ({
                date: item.date,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume,
              }))
              .filter(
                (item: any) =>
                  item.date &&
                  item.open != null &&
                  item.high != null &&
                  item.low != null &&
                  item.close != null,
              )
          : [];

        if (cleaned.length > 0) return Response.json(cleaned);
      }
    } catch {
      // fall through
    }
  }

  // 2) Fallback: Yahoo Finance OHLCV — use =F suffix for futures
  try {
    const yahooSymbol = toYahooSymbol(symbol);
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
      `?interval=1d&range=1y`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const q = result?.indicators?.quote?.[0];

    if (timestamps && q) {
      const bars = timestamps
        .map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          open: q.open?.[i] ?? null,
          high: q.high?.[i] ?? null,
          low: q.low?.[i] ?? null,
          close: q.close?.[i] ?? null,
          volume: q.volume?.[i] ?? 0,
        }))
        .filter((b) => b.open != null && b.close != null);

      if (bars.length > 0) return Response.json(bars);
    }
  } catch {
    // fall through
  }

  return Response.json([]);
}
