// Single source of truth for ICT Smart Money scoring.
// All routes (analyze, scan, morning-email) import from here so they
// always produce the same signal for the same market data.

export interface IctBaseInput {
  price: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  avgVolume: number | null;
  high52w: number | null;
  low52w: number | null;
  changePercent: number;
}

// Optional extra signals — only scan has these
export interface IctExtras {
  trend5dPct?: number | null; // 5-day price change %
  newsCount?: number; // number of recent news items
}

export interface IctScore {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  score: number;
  priceZone: "Premium" | "Discount" | "Equilibrium";
  pctPos: number;
  marketStructure: "Bullish" | "Bearish" | "Ranging";
  dailyBias: "Bullish" | "Bearish" | "Neutral";
  volRatio: number | null;
  highVol: boolean;
  lowVol: boolean;
  yearPct: number | null;
  dayH: number;
  dayL: number;
  daySpan: number;
  dayMid: number;
  orderBlock: string | null;
  fairValueGap: string | null;
  liquidity: string;
  ote: string | null;
}

export function ictScore(
  input: IctBaseInput,
  extras: IctExtras = {},
): IctScore {
  const {
    price,
    previousClose,
    open,
    high,
    low,
    volume,
    avgVolume,
    high52w,
    low52w,
    changePercent,
  } = input;
  const { trend5dPct, newsCount = 0 } = extras;

  // ── Day range ────────────────────────────────────────────────────────────
  const dayH = high ?? price;
  const dayL = low ?? price;
  const dayMid = (dayH + dayL) / 2;
  const daySpan = dayH - dayL;
  const pctPos = daySpan > 0 ? ((price - dayL) / daySpan) * 100 : 50;

  // ── Zones ────────────────────────────────────────────────────────────────
  const priceZone: "Premium" | "Discount" | "Equilibrium" =
    pctPos > 56 ? "Premium" : pctPos < 44 ? "Discount" : "Equilibrium";

  const marketStructure: "Bullish" | "Bearish" | "Ranging" =
    changePercent > 0.6
      ? "Bullish"
      : changePercent < -0.6
        ? "Bearish"
        : "Ranging";

  const dailyBias: "Bullish" | "Bearish" | "Neutral" =
    changePercent > 0.2
      ? "Bullish"
      : changePercent < -0.2
        ? "Bearish"
        : "Neutral";

  // ── Volume ───────────────────────────────────────────────────────────────
  const volRatio =
    volume != null && avgVolume && avgVolume > 0 ? volume / avgVolume : null;
  const highVol = volRatio != null && volRatio >= 1.4;
  const lowVol = volRatio != null && volRatio < 0.75;

  // ── 52-week range ─────────────────────────────────────────────────────────
  const yearPct =
    high52w && low52w && high52w > low52w
      ? ((price - low52w) / (high52w - low52w)) * 100
      : null;

  // ── Scoring ───────────────────────────────────────────────────────────────
  let score = 0;

  // Zone + momentum combo (most important factor)
  // Rule: price in discount AND moving up = bullish confluence (+3)
  //       price in premium AND moving down = bearish confluence (-3)
  if (priceZone === "Discount" && changePercent > 0) score += 3;
  else if (priceZone === "Premium" && changePercent < 0) score -= 3;
  else if (priceZone === "Discount") score += 1;
  else if (priceZone === "Premium") score -= 1;

  // Day momentum
  if (changePercent > 1.5) score += 3;
  else if (changePercent > 0.5) score += 2;
  else if (changePercent > 0.2) score += 1;
  else if (changePercent < -1.5) score -= 3;
  else if (changePercent < -0.5) score -= 2;
  else if (changePercent < -0.2) score -= 1;

  // Volume confirmation
  if (volRatio != null && volRatio >= 2.5)
    score = score > 0 ? score + 2 : score - 2;
  else if (highVol) score = score > 0 ? score + 1 : score - 1;
  if (lowVol) score = Math.sign(score) * Math.max(0, Math.abs(score) - 1);

  // 52-week position
  if (yearPct != null && yearPct < 12) score += 1;
  if (yearPct != null && yearPct > 88) score -= 1;

  // Optional extras (only when caller provides them)
  if (trend5dPct != null && trend5dPct > 3) score += 1;
  if (trend5dPct != null && trend5dPct < -3) score -= 1;
  if (newsCount >= 2) score = score > 0 ? score + 1 : score - 1;

  // ── Signal from score ─────────────────────────────────────────────────────
  // Thresholds are uniform across all callers.
  // Extra signals in scan (trend, news) can push score past 6 — that's expected.
  let signal: "BUY" | "HOLD" | "SELL";
  let confidence: "High" | "Medium" | "Low";

  if (score >= 6) {
    signal = "BUY";
    confidence = "High";
  } else if (score >= 3) {
    signal = "BUY";
    confidence = "Medium";
  } else if (score >= 1) {
    signal = "BUY";
    confidence = "Low";
  } else if (score <= -6) {
    signal = "SELL";
    confidence = "High";
  } else if (score <= -3) {
    signal = "SELL";
    confidence = "Medium";
  } else if (score <= -1) {
    signal = "SELL";
    confidence = "Low";
  } else {
    signal = "HOLD";
    confidence = "Low";
  }

  // ── ICT levels ───────────────────────────────────────────────────────────
  const obBase = open ?? previousClose;
  const orderBlock =
    changePercent > 0.5
      ? `Bullish OB near $${(obBase * 0.998).toFixed(2)} — last bearish candle before expansion`
      : changePercent < -0.5
        ? `Bearish OB near $${(obBase * 1.002).toFixed(2)} — last bullish candle before drop`
        : null;

  const fvgSize = daySpan * 0.25;
  const fairValueGap =
    changePercent > 0.8 && fvgSize > 0.5
      ? `Bullish FVG: $${(price - fvgSize * 1.6).toFixed(2)}–$${(price - fvgSize * 0.8).toFixed(2)}`
      : changePercent < -0.8 && fvgSize > 0.5
        ? `Bearish FVG: $${(price + fvgSize * 0.8).toFixed(2)}–$${(price + fvgSize * 1.6).toFixed(2)}`
        : null;

  const refH = Math.max(dayH, previousClose);
  const refL = Math.min(dayL, previousClose);
  const liquidity =
    dailyBias === "Bullish"
      ? `Buy-side liquidity above $${refH.toFixed(2)} — equal highs / prior day high`
      : dailyBias === "Bearish"
        ? `Sell-side liquidity below $${refL.toFixed(2)} — equal lows / prior day low`
        : `Liquidity at $${refH.toFixed(2)} (BSL) and $${refL.toFixed(2)} (SSL)`;

  const oteHigh = dayL + daySpan * 0.79;
  const oteLow = dayL + daySpan * 0.62;
  const ote =
    daySpan > 1
      ? `OTE zone: $${oteLow.toFixed(2)}–$${oteHigh.toFixed(2)} (62–79% retracement of day range)`
      : null;

  return {
    signal,
    confidence,
    score,
    priceZone,
    pctPos,
    marketStructure,
    dailyBias,
    volRatio,
    highVol,
    lowVol,
    yearPct,
    dayH,
    dayL,
    daySpan,
    dayMid,
    orderBlock,
    fairValueGap,
    liquidity,
    ote,
  };
}
