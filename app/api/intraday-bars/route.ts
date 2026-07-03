export const dynamic = "force-dynamic";

import { toYahooSymbol as toYahoo } from "@/app/lib/yahooSymbol";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol   = searchParams.get("symbol") ?? "AAPL.US";
  const interval = searchParams.get("interval") ?? "1h";   // 5m | 15m | 1h | 4h
  const range    = searchParams.get("range")    ?? "30d";

  // 4H is derived from 1H on the client — fetch 1H with extended range
  const fetchInterval = interval === "4h" ? "1h" : interval;
  const fetchRange    = interval === "4h" ? "90d" : range;

  const yahoo = toYahoo(symbol);

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${fetchInterval}&range=${fetchRange}`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(10_000),
      },
    );

    if (!r.ok) return Response.json({ bars: [] });

    const d      = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return Response.json({ bars: [] });

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};

    const bars = timestamps
      .map((ts, i) => ({
        time:   ts,
        open:   q.open?.[i]   ?? null,
        high:   q.high?.[i]   ?? null,
        low:    q.low?.[i]    ?? null,
        close:  q.close?.[i]  ?? null,
        volume: q.volume?.[i] ?? 0,
      }))
      .filter(b => b.open != null && b.high != null && b.low != null && b.close != null && b.close > 0);

    return Response.json({ bars, interval: fetchInterval });
  } catch {
    return Response.json({ bars: [] });
  }
}
