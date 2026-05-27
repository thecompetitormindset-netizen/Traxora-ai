import { ictScore } from "@/app/lib/ict";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
            orderBlock, fairValueGap, liquidity, ote } = ict;

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
      `ICT ${dailyBias.toLowerCase()} bias with ${marketStructure.toLowerCase()} structure — ` +
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
    });
  } catch (err) {
    return Response.json(
      { error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
