export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { auth } from "@/auth";
import { getYahooCookie, YAHOO_UA } from "@/app/lib/yahooAuth";

export type AnalystRatings = {
  symbol:      string;
  consensus:   "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | null;
  meanRating:  number | null;   // 1–5 (1 = Strong Buy)
  numAnalysts: number | null;
  targetMean:  number | null;
  targetHigh:  number | null;
  targetLow:   number | null;
  breakdown: {
    strongBuy:  number;
    buy:        number;
    hold:       number;
    sell:       number;
    strongSell: number;
  } | null;
};

function toConsensus(key: string): AnalystRatings["consensus"] {
  const map: Record<string, AnalystRatings["consensus"]> = {
    strong_buy:   "Strong Buy",
    buy:          "Buy",
    hold:         "Hold",
    sell:         "Sell",
    strong_sell:  "Strong Sell",
    underperform: "Sell",
    outperform:   "Buy",
  };
  return map[key] ?? null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url    = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "")
    .trim().toUpperCase().replace(/\.(US|COMM)$/, "");
  if (!symbol) return Response.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const yAuth = await getYahooCookie();
    if (!yAuth) return Response.json({ error: "Yahoo auth failed" }, { status: 502 });

    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
      `?modules=recommendationTrend%2CfinancialData&crumb=${encodeURIComponent(yAuth.crumb)}`,
      {
        cache:   "no-store",
        headers: { "User-Agent": YAHOO_UA, Cookie: yAuth.cookie },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return Response.json({ error: `Yahoo data unavailable (${res.status})` }, { status: 502 });

    const json   = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return Response.json({ error: "No analyst data found" }, { status: 404 });

    const fin   = result.financialData       as Record<string, { raw?: number }> ?? {};
    const trend = result.recommendationTrend?.trend?.[0] as Record<string, number> ?? {};

    const data: AnalystRatings = {
      symbol,
      consensus:   toConsensus((fin.recommendationKey as unknown as string) ?? ""),
      meanRating:  (fin.recommendationMean?.raw)          ?? null,
      numAnalysts: (fin.numberOfAnalystOpinions?.raw)     ?? null,
      targetMean:  (fin.targetMeanPrice?.raw)             ?? null,
      targetHigh:  (fin.targetHighPrice?.raw)             ?? null,
      targetLow:   (fin.targetLowPrice?.raw)              ?? null,
      breakdown:   trend.strongBuy !== undefined ? {
        strongBuy:  trend.strongBuy  ?? 0,
        buy:        trend.buy        ?? 0,
        hold:       trend.hold       ?? 0,
        sell:       trend.sell       ?? 0,
        strongSell: trend.strongSell ?? 0,
      } : null,
    };

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 500 });
  }
}
