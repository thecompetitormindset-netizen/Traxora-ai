import { smartMoneyScore, computeCanonicalTrade } from "@/app/lib/smartMoney";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";

interface StockInput {
  symbol:        string;
  name:          string;
  price:         number;
  previousClose: number;
  open:          number | null;
  high:          number | null;
  low:           number | null;
  changePercent: number;
  volume:        number;
  avgVolume:     number;
  high52w:       number | null;
  low52w:        number | null;
  volumeRatio:   number;
  yearRangePct:  number | null;
  history5d:     number[];
  news:          { title: string; publisher: string; age: string }[];
}

function fmtPrice(p: number): string {
  const decimals = p < 1 ? 4 : p < 10 ? 3 : 2;
  return p.toFixed(decimals);
}

function trend5d(h: number[]): { label: string; pct: number } {
  if (h.length < 2) return { label: "No trend data", pct: 0 };
  const pct = ((h[h.length - 1] - h[0]) / h[0]) * 100;
  return {
    pct,
    label: pct >  2 ? `5-day uptrend +${pct.toFixed(1)}%` :
           pct < -2 ? `5-day downtrend ${pct.toFixed(1)}%` :
                      `5-day sideways ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
  };
}

function scoreStock(s: StockInput) {
  const trend = trend5d(s.history5d);

  const sm = smartMoneyScore(
    {
      price:         s.price,
      previousClose: s.previousClose,
      open:          s.open,
      high:          s.high,
      low:           s.low,
      volume:        s.volume,
      avgVolume:     s.avgVolume,
      high52w:       s.high52w,
      low52w:        s.low52w,
      changePercent: s.changePercent,
    },
    { trend5dPct: trend.pct, newsCount: s.news.length },
  );

  const { signal, confidence, score, priceZone, marketStructure,
          yearPct, dayH, dayL, dayMid } = sm;

  // Canonical trade levels — shared with analyze() so card and breakdown match
  const canonTrade = computeCanonicalTrade(sm, s.price);

  // Fall back to the pre-computed ratio when smartMoneyScore returns null (avgVolume === 0 from data source)
  const volRatio = sm.volRatio ?? s.volumeRatio;
  const highVol  = volRatio >= 1.4;
  const lowVol   = volRatio < 0.75;

  const yearZone =
    yearPct == null ? "N/A" :
    yearPct <= 10   ? `Yearly Discount (${yearPct.toFixed(0)}% — near 52w low)` :
    yearPct <= 30   ? `Yearly Discount (${yearPct.toFixed(0)}%)` :
    yearPct >= 90   ? `Yearly Premium (${yearPct.toFixed(0)}% — near 52w high)` :
    yearPct >= 70   ? `Yearly Premium (${yearPct.toFixed(0)}%)` :
                      `Mid-Range (${yearPct.toFixed(0)}%)`;

  const volVerdict =
    volRatio >= 2.5 ? `${volRatio.toFixed(1)}x volume — strong institutional move` :
    highVol         ? `${volRatio.toFixed(1)}x volume — above average activity` :
    lowVol          ? `${volRatio.toFixed(1)}x volume — low conviction` :
                      `${volRatio.toFixed(1)}x volume — normal`;

  const setupNote =
    signal === "BUY"
      ? `${priceZone} zone${yearPct != null && yearPct < 30 ? " + yearly discount" : ""} with ${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}% momentum. ${volVerdict}. ${trend.label}.`
    : signal === "SELL"
      ? `${priceZone} zone${yearPct != null && yearPct > 70 ? " + yearly premium" : ""} with ${s.changePercent.toFixed(2)}% decline. ${volVerdict}. ${trend.label}.`
    : `Price in ${priceZone} zone — no clear directional edge. ${trend.label}.`;

  const keyLevel =
    signal === "BUY"  ? `$${fmtPrice(dayL)} — stop below day low` :
    signal === "SELL" ? `$${fmtPrice(dayH)} — resistance / stop above day high` :
                        `$${fmtPrice(dayMid)} — equilibrium`;

  const target = canonTrade
    ? `${canonTrade.targetFmt} — ${canonTrade.rrNum}:1 R:R target`
    : "—";

  const power3Phase =
    s.changePercent > 1 && highVol ? "Distribution" :
    s.changePercent > 0            ? "Expansion"    :
    s.changePercent < -1 && highVol? "Manipulation" :
                                     "Accumulation";

  const newsImpact =
    s.news.length === 0 ? "Neutral" :
    signal === "BUY"    ? "Positive" :
    signal === "SELL"   ? "Negative" : "Neutral";

  const catalyst =
    s.news.length > 0
      ? s.news[0].title.slice(0, 80)
      : `${s.changePercent >= 0 ? "Technical" : "Bearish"} price action — no major catalyst`;

  // Trade levels — use the canonical shared computation (same as analyze())
  // so scan card and full breakdown always show identical levels for any ticker.
  const entryZone:  string | null = canonTrade?.entryZone  ?? null;
  const stopLoss:   string | null = canonTrade?.stopFmt    ?? null;
  const takeProfit: string | null = canonTrade?.targetFmt  ?? null;
  const entryReason: string | null = canonTrade
    ? (signal === "BUY"
        ? `Discount zone — lower 30% of day range (${priceZone})`
        : `Premium zone — upper 30% of day range (${priceZone})`)
    : null;
  const stopReason: string | null = canonTrade
    ? (signal === "BUY"
        ? "Structural stop below session low"
        : "Structural stop above session high")
    : null;
  const tpReason: string | null = canonTrade
    ? (canonTrade.liqRR >= 1
        ? (signal === "BUY"
            ? "Targeting BSL / buy-side liquidity above prior session high"
            : "Targeting SSL / sell-side liquidity below prior session low")
        : (signal === "BUY"
            ? `${canonTrade.rrNum}:1 R:R — targeting liquidity above`
            : `${canonTrade.rrNum}:1 R:R — targeting liquidity below`))
    : null;

  return {
    symbol: s.symbol, signal, confidence, setupNote, catalyst,
    marketStructure, priceZone, yearZone, volumeVerdict: volVerdict,
    keyLevel, target, power3Phase, newsImpact, _score: score, news: s.news,
    entryZone, stopLoss, takeProfit, entryReason, stopReason, tpReason,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!checkRateLimit(`scan:${session.user.email}`, 10, 60_000)) {
    return Response.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }
  try {
    const { stocks }: { stocks: StockInput[] } = await req.json();

    const results = stocks.map(scoreStock).sort((a, b) => Math.abs(b._score) - Math.abs(a._score));
    const top5    = results.slice(0, 5);

    const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / (stocks.length || 1);
    const buyCount  = results.filter(r => r.signal === "BUY").length;
    const sellCount = results.filter(r => r.signal === "SELL").length;

    const marketContext =
      avgChange > 0.5 && buyCount > sellCount
        ? `Broad bullish momentum — ${buyCount}/${results.length} stocks showing BUY setups with avg +${avgChange.toFixed(2)}% change.`
      : avgChange < -0.5 && sellCount > buyCount
        ? `Bearish pressure — ${sellCount}/${results.length} stocks showing SELL setups with avg ${avgChange.toFixed(2)}% change.`
      : `Mixed market — ${buyCount} BUY vs ${sellCount} SELL setups; avg change ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%.`;

    return Response.json({ marketContext, ranked: top5 });
  } catch (err) {
    return Response.json(
      { error: `Scan failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
