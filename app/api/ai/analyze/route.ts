import { viewer } from "@/app/lib/viewer";
import Anthropic from "@anthropic-ai/sdk";
import { smartMoneyScore, detectOrderBlocks, detectFVG, computeCanonicalTrade } from "@/app/lib/smartMoney";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { getVolumeProfile } from "@/app/lib/volumeProfile";
import type { VolumeProfile } from "@/app/lib/volumeProfile";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmtPrice(p: number): string {
  const decimals = p < 1 ? 4 : p < 10 ? 3 : 2;
  return p.toFixed(decimals);
}

import { toYahooSymbol } from "@/app/lib/yahooSymbol";

// Sector ETF map — used to check if sector confirms or contradicts the signal
const SECTOR_ETF: Record<string, string> = {
  // Tech
  AAPL:"XLK",MSFT:"XLK",NVDA:"XLK",AMD:"XLK",INTC:"XLK",QCOM:"XLK",AVGO:"XLK",
  META:"XLC",GOOGL:"XLC",NFLX:"XLC",
  AMZN:"XLY",TSLA:"XLY",
  // Finance
  JPM:"XLF",BAC:"XLF",GS:"XLF",MS:"XLF",C:"XLF",WFC:"XLF",V:"XLF",MA:"XLF",
  // Healthcare
  JNJ:"XLV",UNH:"XLV",PFE:"XLV",MRK:"XLV",ABBV:"XLV",LLY:"XLV",
  // Energy
  XOM:"XLE",CVX:"XLE",OXY:"XLE",
  // Consumer
  WMT:"XLP",COST:"XLP",
  // Industrial
  CAT:"XLI",UPS:"XLI",
};

// Fetch sector ETF 5d trend as a confirming signal
async function fetchSectorAlignment(ticker: string): Promise<string | null> {
  const clean  = ticker.replace(/\.(US|COMM|F)$/i, "");
  const sector = SECTOR_ETF[clean];
  if (!sector) return null;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sector}?interval=1d&range=10d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const closes: number[] = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    if (closes.length < 2) return null;
    const base5d = closes.at(-6 < -closes.length ? 0 : -6)!;
    const chg5d = ((closes.at(-1)! - base5d) / base5d) * 100;
    const trend = chg5d > 1 ? "BULLISH" : chg5d < -1 ? "BEARISH" : "NEUTRAL";
    return `Sector ETF ${sector}: ${trend} (${chg5d >= 0 ? "+" : ""}${chg5d.toFixed(2)}% 5d) — ${
      trend === "BULLISH" ? "sector confirms upside bias" :
      trend === "BEARISH" ? "sector headwind — reduces conviction on BUY signals" :
      "sector neutral — no confirmation"
    }`;
  } catch { return null; }
}

// Compute VWAP from intraday bars
function computeVWAP(bars: { close: number; high: number; low: number; volume: number }[]): number | null {
  if (!bars.length) return null;
  let sumPV = 0, sumV = 0;
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3;
    sumPV += typical * b.volume;
    sumV  += b.volume;
  }
  return sumV > 0 ? sumPV / sumV : null;
}

// Fetch intraday bars for VWAP
async function fetchIntradayForVWAP(ticker: string): Promise<{ close: number; high: number; low: number; volume: number }[]> {
  try {
    const clean = toYahooSymbol(ticker);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?interval=5m&range=1d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const d = await res.json();
    const q = d?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
    const ts: number[] = d?.chart?.result?.[0]?.timestamp ?? [];
    return ts.map((_, i) => ({
      close:  q.close?.[i]  ?? 0,
      high:   q.high?.[i]   ?? 0,
      low:    q.low?.[i]    ?? 0,
      volume: q.volume?.[i] ?? 0,
    })).filter(b => b.close > 0 && b.volume > 0);
  } catch { return []; }
}

// Fetch recent daily bars for multi-candle context (Yahoo Finance, fast + free)
async function fetchRecentBars(ticker: string): Promise<{ open: number; close: number; high: number; low: number; volume: number }[]> {
  try {
    const clean = toYahooSymbol(ticker);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?interval=1d&range=60d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const q = data?.chart?.result?.[0]?.indicators?.quote?.[0];
    const ts: number[] = data?.chart?.result?.[0]?.timestamp ?? [];
    if (!q || !ts.length) return [];
    return ts.map((_, i) => ({
      open:   q.open?.[i]   ?? 0,
      close:  q.close?.[i]  ?? 0,
      high:   q.high?.[i]   ?? 0,
      low:    q.low?.[i]    ?? 0,
      volume: q.volume?.[i] ?? 0,
    })).filter(b => b.close > 0);
  } catch { return []; }
}

function calcOBVTrend(bars: { close: number; volume: number }[]): "Rising" | "Falling" | "Flat" {
  if (bars.length < 6) return "Flat";
  let obv = 0;
  const series: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i-1].close)      obv += bars[i].volume;
    else if (bars[i].close < bars[i-1].close) obv -= bars[i].volume;
    series.push(obv);
  }
  const half   = Math.floor(series.length / 2);
  const first  = series.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const second = series.slice(half).reduce((a, b) => a + b, 0) / (series.length - half);
  return second > first * 1.01 ? "Rising" : second < first * 0.99 ? "Falling" : "Flat";
}

function calcClosesEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

async function fetchVIX(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const closes: number[] = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    return closes.at(-1) ?? null;
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await viewer();
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
      quick?:           boolean; // true = dashboard fast-path (skip Claude, use string summary)
    };

    const { symbol, price, previousClose, open, high, low,
            volume, avgVolume, high52w, low52w, dayChangePercent, quick = false } = body;

    // Fetch volume profile, recent bars, sector ETF alignment, and VWAP in parallel
    const [vp, bars, sectorCtx, intradayBars, vix] = await Promise.all([
      getVolumeProfile(symbol),
      fetchRecentBars(symbol),
      fetchSectorAlignment(symbol),
      quick ? Promise.resolve([]) : fetchIntradayForVWAP(symbol),
      fetchVIX(),
    ]);
    const vwap = computeVWAP(intradayBars);

    // Multi-candle context from recent bars
    const baseClose  = bars.at(-6)?.close ?? 0;
    const trend5dPct = bars.length >= 6 && baseClose > 0.01
      ? ((bars.at(-1)!.close - baseClose) / baseClose) * 100
      : null;
    const swing10High = bars.length >= 3 ? Math.max(...bars.slice(-10).map(b => b.high)) : null;
    const swing10Low  = bars.length >= 3 ? Math.min(...bars.slice(-10).map(b => b.low))  : null;
    const avgVol20    = bars.length >= 5 ? bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(bars.length, 20) : null;

    // OBV — confirms volume backing the price move
    const obvTrend = calcOBVTrend(bars);

    // EMA alignment — structural trend confirmation fed into smart money score
    const closesAll = bars.map(b => b.close);
    const ema20val  = calcClosesEMA(closesAll, 20);
    const ema50val  = calcClosesEMA(closesAll, 50);
    const emaAlignment: "bullish" | "bearish" | "neutral" | null =
      ema20val != null && ema50val != null
        ? (price > ema20val && ema20val > ema50val ? "bullish"
          : price < ema20val && ema20val < ema50val ? "bearish"
          : "neutral")
        : null;

    // Detect real OBs and FVG from bar structure before scoring
    const obs = detectOrderBlocks(bars);
    const realFVG = detectFVG(bars, price);

    const sm = smartMoneyScore(
      {
        price, previousClose,
        open:      open  ?? null,
        high:      high  ?? null,
        low:       low   ?? null,
        volume:    volume ?? avgVol20 ?? null,
        avgVolume: avgVolume ?? avgVol20 ?? null,
        high52w:   high52w ?? swing10High ?? null,
        low52w:    low52w  ?? swing10Low  ?? null,
        changePercent: dayChangePercent,
      },
      { trend5dPct: trend5dPct ?? undefined, emaAlignment },
    );

    const { signal, confidence, priceZone, pctPos, marketStructure, dailyBias,
            volRatio, highVol, lowVol, yearPct,
            liquidity, bslPrice, sslPrice, ote,
            immediateRebalance, dayH, dayL, daySpan } = sm;

    // Pick the direction-relevant OB now that we have the signal
    const orderBlock   = signal === "BUY" ? obs.bullish : signal === "SELL" ? obs.bearish : obs.bullish ?? obs.bearish;
    const fairValueGap = realFVG;

    // Trade levels — use the single shared computation so this breakdown and
    // every card always show the same entry/stop/target for the same ticker.
    const canonTrade = computeCanonicalTrade(sm, price);
    let trade: { entryZone: string; stopLoss: string; takeProfit: string; entryReason: string; stopReason: string; tpReason: string; rrRatio: string } | null = null;
    if (canonTrade) {
      trade = {
        entryZone:   canonTrade.entryZone,
        stopLoss:    canonTrade.stopFmt,
        takeProfit:  canonTrade.targetFmt,
        rrRatio:     `${canonTrade.rrNum}:1`,
        entryReason: signal === "BUY"
          ? `Discount zone — enter in lower 30% of day range${orderBlock ? " near Order Block" : ""}${immediateRebalance ? " · IR zone nearby" : ""}`
          : `Premium zone — enter in upper 30% of day range${orderBlock ? " near Order Block" : ""}${immediateRebalance ? " · IR zone nearby" : ""}`,
        stopReason:  signal === "BUY"
          ? `Structural stop below ${orderBlock ? "Order Block low" : "session low"}`
          : `Structural stop above ${orderBlock ? "Order Block high" : "session high"}`,
        tpReason:    canonTrade.liqRR >= 1
          ? (signal === "BUY"
              ? `Targeting BSL at $${fmtPrice(bslPrice)} — buy-side liquidity above prior session high`
              : `Targeting SSL at $${fmtPrice(sslPrice)} — sell-side liquidity below prior session low`)
          : `2:1 R:R target at $${fmtPrice(canonTrade.targetRaw)} — liquidity too close for direct targeting`,
      };
    }

    // ── Consensus filter: downgrade confidence when timeframes conflict ────────
    // A BUY signal requires bullish daily bias AND positive (or neutral) 5d trend.
    // A SELL signal requires bearish daily bias AND negative (or neutral) 5d trend.
    // Conflicting timeframes → cap at Medium. This reduces false signals significantly.
    let adjustedConfidence: "High" | "Medium" | "Low" = confidence;
    if (signal !== "HOLD" && trend5dPct != null) {
      const bullishConflict = signal === "BUY"  && (dailyBias === "Bearish" || trend5dPct < -2);
      const bearishConflict = signal === "SELL" && (dailyBias === "Bullish" || trend5dPct >  2);
      if (bullishConflict || bearishConflict) {
        adjustedConfidence = confidence === "High" ? "Medium" : "Low";
      }
    }
    // Also downgrade when volume is very low (< 0.5x avg) — thin markets produce false signals
    if (signal !== "HOLD" && volRatio != null && volRatio < 0.5 && adjustedConfidence === "High") {
      adjustedConfidence = "Medium";
    }
    // Sector ETF conflict — downgrade if sector is moving opposite to signal direction
    if (signal !== "HOLD" && sectorCtx) {
      const sectorBearish = sectorCtx.includes("BEARISH");
      const sectorBullish = sectorCtx.includes("BULLISH");
      if ((signal === "BUY" && sectorBearish) || (signal === "SELL" && sectorBullish)) {
        if (adjustedConfidence === "High") adjustedConfidence = "Medium";
      }
    }
    // Elevated VIX → false breakouts are more common in fear regimes; reduce High to Medium
    if (signal !== "HOLD" && vix != null && vix > 25 && adjustedConfidence === "High") {
      adjustedConfidence = "Medium";
    }
    // VWAP context — BUY below VWAP is weaker; SELL above VWAP is weaker
    if (signal !== "HOLD" && vwap != null) {
      const priceAboveVWAP = price > vwap;
      if (signal === "BUY" && !priceAboveVWAP && adjustedConfidence === "High") {
        adjustedConfidence = "Medium"; // buying below VWAP = swimming upstream intraday
      }
    }
    const effectiveConfidence = adjustedConfidence;

    const risk: "Low" | "Medium" | "High" =
      effectiveConfidence === "High" ? "Low" : effectiveConfidence === "Medium" ? "Medium" : "High";

    const volStr  = volRatio != null
      ? ` Volume ${volRatio.toFixed(1)}x avg${highVol ? " — confirms move" : lowVol ? " — low conviction" : ""}.` : "";
    const yearStr = yearPct != null ? ` At ${yearPct.toFixed(0)}% of 52-week range.` : "";

    // Volume profile context
    let vpZone = "";
    let vpStr  = "";
    let vpSignalAdjust = "";
    if (vp) {
      if (price > vp.vah) {
        vpZone = "above value area";
        vpStr  = ` Price is ${((price - vp.vah) / vp.vah * 100).toFixed(1)}% above VAH ($${vp.vah.toFixed(2)}) — premium territory. POC at $${vp.poc.toFixed(2)}.`;
        vpSignalAdjust = signal === "BUY" ? " Volume profile warns: buying in premium zone increases risk." : " Volume profile confirms: selling pressure likely near VAH.";
      } else if (price < vp.val) {
        vpZone = "below value area";
        vpStr  = ` Price is ${((vp.val - price) / vp.val * 100).toFixed(1)}% below VAL ($${vp.val.toFixed(2)}) — discount territory. POC at $${vp.poc.toFixed(2)}.`;
        vpSignalAdjust = signal === "SELL" ? " Volume profile warns: selling in discount zone increases risk." : " Volume profile confirms: buyers historically active at this level.";
      } else if (Math.abs(price - vp.poc) / vp.poc < 0.005) {
        vpZone = "at POC";
        vpStr  = ` Price is at POC ($${vp.poc.toFixed(2)}) — highest volume node. Expect resistance/support and potential reversal.`;
        vpSignalAdjust = " High volume node — watch for rejection.";
      } else {
        vpZone = "inside value area";
        vpStr  = ` Price inside value area (VAL $${vp.val.toFixed(2)} – VAH $${vp.vah.toFixed(2)}), POC at $${vp.poc.toFixed(2)}.`;
        vpSignalAdjust = "";
      }
    }

    const clean = symbol.replace(/\.(US|COMM|F)$/i, "");

    // Fast string summary (dashboard quick-path)
    const fallbackSummary =
      `${clean} at $${price.toFixed(2)}, ` +
      `${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}% — ` +
      `${priceZone} zone (${pctPos.toFixed(0)}% of range).${volStr}${yearStr}${vpStr} ` +
      `${dailyBias} bias, ${marketStructure.toLowerCase()} structure.` + vpSignalAdjust;

    const vwapStr = vwap != null
      ? `VWAP: $${vwap.toFixed(2)} — price is ${price > vwap ? "above" : "below"} VWAP (${price > vwap ? "intraday bullish" : "intraday bearish"})`
      : null;

    const vixStr = vix != null
      ? `VIX: ${vix.toFixed(1)} — ${vix < 15 ? "extreme complacency" : vix < 20 ? "low fear" : vix < 25 ? "moderate fear" : vix < 30 ? "elevated fear — stay cautious" : "PANIC / extreme fear — wait for VIX to peak"}`
      : null;

    const emaStr = ema20val != null
      ? `EMA20: $${ema20val.toFixed(2)}${ema50val != null ? ` | EMA50: $${ema50val.toFixed(2)}` : ""} — ${emaAlignment ?? "neutral"} stack`
      : null;

    const obvStr = obvTrend !== "Flat"
      ? `OBV: ${obvTrend} — volume ${obvTrend === "Rising" ? "confirms accumulation" : "signals distribution"}`
      : null;

    const fallbackKeyPoints = [
      `Price zone: ${priceZone} — ${pctPos.toFixed(0)}% of today's range`,
      `Day momentum: ${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}%${trend5dPct != null ? ` · 5-day: ${trend5dPct >= 0 ? "+" : ""}${trend5dPct.toFixed(2)}%` : ""} — ${dailyBias} bias`,
      volRatio != null
        ? `Volume: ${volRatio.toFixed(1)}x average — ${highVol ? "strong participation" : lowVol ? "thin — wait for volume" : "normal"}`
        : `Prev close $${previousClose.toFixed(2)} — ${dayChangePercent >= 0 ? "gap up" : "gap down"} at open`,
      vp ? `Volume Profile: POC $${vp.poc.toFixed(2)} | VAH $${vp.vah.toFixed(2)} | VAL $${vp.val.toFixed(2)} — ${vpZone}` : null,
      vwapStr,
      emaStr,
      obvStr,
      vixStr,
      sectorCtx,
    ].filter(Boolean) as string[];

    let summary   = fallbackSummary;
    let keyPoints = fallbackKeyPoints;

    // Full AI-generated analysis (analysis page — single stock, user-triggered).
    // Signed-in users only: anonymous visitors get the rules-based summary above.
    if (!quick && !session.user.anonymous && process.env.ANTHROPIC_API_KEY) {
      try {
        const prompt = [
          `${clean} — $${price.toFixed(2)} (${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}% today)`,
          `Signal: ${signal} | Confidence: ${effectiveConfidence} | Zone: ${priceZone} (${pctPos.toFixed(0)}% of day range)`,
          trend5dPct != null ? `5-day trend: ${trend5dPct >= 0 ? "+" : ""}${trend5dPct.toFixed(2)}%` : "",
          volRatio != null ? `Volume: ${volRatio.toFixed(1)}x avg${highVol ? " — elevated activity" : lowVol ? " — thin" : ""}` : "",
          vp ? `Volume Profile: POC $${vp.poc.toFixed(2)} | VAH $${vp.vah.toFixed(2)} | VAL $${vp.val.toFixed(2)} (${vpZone})` : "",
          vwapStr ?? "",
          emaStr ?? "",
          obvStr ?? "",
          vixStr ?? "",
          sectorCtx ?? "",
          orderBlock ?? "",
          fairValueGap ?? "",
          immediateRebalance ?? "",
          `Liquidity: ${liquidity}`,
          swing10High && swing10Low ? `10-day swing: $${swing10Low.toFixed(2)} – $${swing10High.toFixed(2)}` : "",
          yearPct != null ? `52-week range: ${yearPct.toFixed(0)}%` : "",
        ].filter(Boolean).join("\n");

        const resp = await Promise.race([
          anthropic.messages.create({
            model:      "claude-haiku-4-5-20251001",
            max_tokens: 320,
            system: "You are a concise market analyst. Given price structure data, write exactly: 2 clear sentences of analysis (no bullet prefix), then exactly 3 bullet points starting with ·. Be specific with price levels. No methodology jargon. Do not mention option expiry dates, strike prices, contract types, or spread strategy names — those come from a separate live data source.",
            messages: [{ role: "user", content: prompt }],
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 12_000)),
        ]);

        const text  = resp.content[0].type === "text" ? resp.content[0].text.trim() : "";
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        const prose = lines.filter(l => !l.startsWith("·") && !l.startsWith("•") && !l.startsWith("-"));
        const bullets = lines.filter(l => l.startsWith("·") || l.startsWith("•") || l.startsWith("-"))
          .map(l => l.replace(/^[·•\-]\s*/, ""));

        if (prose.length >= 1) summary = prose.slice(0, 2).join(" ");
        if (bullets.length >= 3) keyPoints = bullets.slice(0, 4);
      } catch { /* fall back to string summary */ }
    }

    const setup = signal !== "HOLD"
      ? `${signal === "BUY" ? "Bullish" : "Bearish"} setup: ${priceZone} zone${trend5dPct != null ? `, ${trend5dPct >= 0 ? "+" : ""}${trend5dPct.toFixed(1)}% 5d trend` : ""}${highVol ? `, ${volRatio?.toFixed(1)}x volume` : ""}${vpZone ? `, ${vpZone}` : ""}.`
      : null;

    return Response.json({
      signal, confidence: effectiveConfidence, summary, keyPoints, risk,
      signals: { marketStructure, dailyBias, priceZone, orderBlock, fairValueGap, liquidity, bslPrice, sslPrice, ote, immediateRebalance, setup },
      trade,
      volumeProfile: vp ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
