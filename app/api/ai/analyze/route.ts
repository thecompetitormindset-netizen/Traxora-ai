import { ictScore } from "@/app/lib/ict";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit(`analyze:${session.user.email}`, 20, 60_000)) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  try {
    const body = await req.json() as {
      symbol:           string;
      price:            number;
      previousClose:    number;
      open?:            number | null;
      high?:            number | null;
      low?:             number | null;
      volume?:          number | null;
      avgVolume?:       number | null;
      high52w?:         number | null;
      low52w?:          number | null;
      dayChangePercent: number;
    };

    const { symbol, price, previousClose, open, high, low,
            volume, avgVolume, high52w, low52w, dayChangePercent } = body;

    const ict = ictScore({
      price, previousClose,
      open:      open  ?? null,
      high:      high  ?? null,
      low:       low   ?? null,
      volume:    volume    ?? null,
      avgVolume: avgVolume ?? null,
      high52w:   high52w  ?? null,
      low52w:    low52w   ?? null,
      changePercent: dayChangePercent,
    });

    const { signal, confidence, priceZone, pctPos, marketStructure, dailyBias,
            volRatio, highVol, lowVol, yearPct,
            orderBlock, fairValueGap, liquidity, ote,
            dayH, dayL, daySpan } = ict;

    // ICT trade levels: BUY enters discount (5–30% above day low), SELL enters premium (5–30% below day high)
    let trade: { entryZone: string; stopLoss: string; takeProfit: string; entryReason: string; stopReason: string; tpReason: string; rrRatio: string } | null = null;
    if (signal !== "HOLD" && dayH && dayL) {
      const span      = (daySpan && daySpan > 0.01) ? daySpan : price * 0.01;
      const entryLow  = signal === "BUY" ? dayL + span * 0.05 : dayH - span * 0.30;
      const entryHigh = signal === "BUY" ? dayL + span * 0.30 : dayH - span * 0.05;
      const entryMid  = (entryLow + entryHigh) / 2;
      const stopVal   = signal === "BUY" ? entryLow  * 0.95 : entryHigh * 1.05;
      const riskDist  = Math.abs(entryMid - stopVal);
      const tpVal     = signal === "BUY" ? entryMid + riskDist * 2 : entryMid - riskDist * 2;
      trade = {
        entryZone:   `$${entryLow.toFixed(2)} – $${entryHigh.toFixed(2)}`,
        stopLoss:    `$${stopVal.toFixed(2)}`,
        takeProfit:  `$${tpVal.toFixed(2)}`,
        entryReason: signal === "BUY"
          ? `ICT discount — lower 30% of day range${orderBlock ? " near Order Block" : ""}`
          : `ICT premium — upper 30% of day range${orderBlock ? " near Order Block" : ""}`,
        stopReason:  signal === "BUY"
          ? `5% below entry zone — structural stop below ${orderBlock ? "OB low" : "day low"}`
          : `5% above entry zone — structural stop above ${orderBlock ? "OB high" : "day high"}`,
        tpReason:    signal === "BUY"
          ? "2:1 R:R — targeting buy-side liquidity (BSL) above"
          : "2:1 R:R — targeting sell-side liquidity (SSL) below",
        rrRatio:     "2:1",
      };
    }

    const risk: "Low" | "Medium" | "High" =
      confidence === "High" ? "Low" : confidence === "Medium" ? "Medium" : "High";

    const volStr  = volRatio != null
      ? ` Volume ${volRatio.toFixed(1)}x avg${highVol ? " — confirms move" : lowVol ? " — low conviction" : ""}.` : "";
    const yearStr = yearPct != null ? ` At ${yearPct.toFixed(0)}% of 52-week range.` : "";

    const clean = symbol.replace(/\.(US|COMM|F)$/i, "");
    const summary =
      `${clean} is trading at $${price.toFixed(2)}, ` +
      `${dayChangePercent >= 0 ? "up" : "down"} ${Math.abs(dayChangePercent).toFixed(2)}% in a ` +
      `${priceZone.toLowerCase()} zone (${pctPos.toFixed(0)}% of today's range).${volStr}${yearStr} ` +
      `${dailyBias} bias with ${marketStructure.toLowerCase()} structure — ` +
      (signal === "HOLD"
        ? "no clear directional edge yet."
        : `favoring ${signal === "BUY" ? "long entries near discount" : "caution / exits near premium"}.`);

    const setup = signal !== "HOLD"
      ? `${signal === "BUY" ? "Bullish" : "Bearish"} setup: price in ${priceZone} zone with ${dailyBias.toLowerCase()} bias (${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}%)${highVol ? `, ${volRatio?.toFixed(1)}x volume surge` : ""}.`
      : null;

    const keyPoints = [
      `Price zone: ${priceZone} — ${pctPos.toFixed(0)}% of today's high-low range`,
      `Day momentum: ${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}% — ${dailyBias} bias`,
      volRatio != null
        ? `Volume: ${volRatio.toFixed(1)}x average — ${highVol ? "smart money participation" : lowVol ? "thin — wait for volume" : "normal"}`
        : `Prev close $${previousClose.toFixed(2)} — gap ${dayChangePercent >= 0 ? "up" : "down"} at open`,
    ];

    return Response.json({
      signal, confidence, summary, keyPoints, risk,
      ict: { marketStructure, dailyBias, priceZone, orderBlock, fairValueGap, liquidity, ote, setup },
      trade,
    });
  } catch (err) {
    return Response.json(
      { error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
