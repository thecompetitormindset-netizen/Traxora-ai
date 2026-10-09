export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { viewer } from "@/app/lib/viewer";
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

// Fallback when Yahoo refuses (it often rate-limits with 429): Nasdaq's public
// analyst endpoints give buy/hold/sell counts, the consensus and price targets.
async function fromNasdaq(symbol: string): Promise<AnalystRatings | null> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/",
  };
  const get = async <T,>(path: string): Promise<T | null> => {
    try {
      const r = await fetch(`https://api.nasdaq.com/api/analyst/${symbol.toLowerCase()}/${path}`, { cache: "no-store", headers, signal: AbortSignal.timeout(9000) });
      return r.ok ? (await r.json() as { data: T | null }).data : null;
    } catch { return null; }
  };
  const [tp, rt] = await Promise.all([
    get<{ consensusOverview?: { priceTarget?: number; lowPriceTarget?: number; highPriceTarget?: number; buy?: number; hold?: number; sell?: number } }>("targetprice"),
    get<{ meanRatingType?: string }>("ratings"),
  ]);
  const co = tp?.consensusOverview;
  if (!co) return null;
  const buy = co.buy ?? 0, hold = co.hold ?? 0, sell = co.sell ?? 0, n = buy + hold + sell;
  const label = rt?.meanRatingType?.toLowerCase().replace(/\s+/g, "_") ?? "";
  return {
    symbol,
    consensus: toConsensus(label) ?? (n ? (buy >= hold && buy >= sell ? "Buy" : sell > hold ? "Sell" : "Hold") : null),
    meanRating: null,
    numAnalysts: n || null,
    targetMean: co.priceTarget ?? null,
    targetHigh: co.highPriceTarget ?? null,
    targetLow: co.lowPriceTarget ?? null,
    breakdown: n ? { strongBuy: 0, buy, hold, sell, strongSell: 0 } : null,
  };
}

async function nasdaqOr(symbol: string, status: number, error: string) {
  const n = await fromNasdaq(symbol);
  return n ? Response.json(n) : Response.json({ error }, { status });
}

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url    = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "")
    .trim().toUpperCase().replace(/\.(US|COMM)$/, "");
  if (!symbol) return Response.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const yAuth = await getYahooCookie();
    if (!yAuth) return nasdaqOr(symbol, 502, "Analyst data unavailable right now");

    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
      `?modules=recommendationTrend%2CfinancialData&crumb=${encodeURIComponent(yAuth.crumb)}`,
      {
        cache:   "no-store",
        headers: { "User-Agent": YAHOO_UA, Cookie: yAuth.cookie },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return nasdaqOr(symbol, 502, "Analyst data unavailable right now");

    const json   = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return nasdaqOr(symbol, 404, "No analyst data found");

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
  } catch {
    return nasdaqOr(symbol, 502, "Analyst data unavailable right now");
  }
}
