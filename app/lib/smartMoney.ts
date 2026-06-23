// Single source of truth for Smart Money scoring.
// All routes (analyze, scan, morning-email) import from here so they
// always produce the same signal for the same market data.
//
// SCORING PHILOSOPHY: Momentum-first, multi-timeframe confirmation.
// The old contrarian approach (discount zone = BUY) was producing sub-50%
// accuracy because price in the bottom of its day range often means it's
// falling, not reversing. The new approach: follow confirmed momentum,
// require trend + day agreement, veto conflicting signals to HOLD.

export interface SmBaseInput {
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

// Optional extra signals — only scan and analyze-with-bars have these
export interface SmExtras {
  trend5dPct?: number | null;   // 5-day price change % — PRIMARY signal input
  newsCount?: number;
  emaAlignment?: "bullish" | "bearish" | "neutral" | null; // price/EMA20/EMA50 stack
  orderBlockLabel?: string | null;  // pre-computed real OB (pass from routes with bar data)
  fvgLabel?: string | null;         // pre-computed real FVG (pass from routes with bar data)
}

export interface SmScore {
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
  bslPrice: number;
  sslPrice: number;
  ote: string | null;
  immediateRebalance: string | null;
}

// ── Real Order Block detection ────────────────────────────────────────────────
// Scans up to the last 25 candles for the most recent unmitigated OB in each
// direction.  An OB is the last opposing candle before a displacement move
// (next 1-2 bars close beyond the OB candle's extreme).

export type OHLCBar = { open: number; high: number; low: number; close: number };

export function detectOrderBlocks(bars: OHLCBar[]): { bullish: string | null; bearish: string | null } {
  const result: { bullish: string | null; bearish: string | null } = { bullish: null, bearish: null };
  if (bars.length < 4) return result;

  const recent = bars.slice(-25);

  // Bullish OB: last bearish candle where the next 1-2 candles close above its high
  for (let i = recent.length - 2; i >= 1 && !result.bullish; i--) {
    const bar = recent[i];
    if (bar.close >= bar.open) continue;                         // must be a down-close candle
    const next = recent.slice(i + 1, Math.min(i + 3, recent.length));
    if (next.some(n => n.close > bar.high)) {
      result.bullish = `Bullish OB: $${bar.low.toFixed(2)}–$${bar.open.toFixed(2)} — last bearish candle before upside displacement`;
    }
  }

  // Bearish OB: last bullish candle where the next 1-2 candles close below its low
  for (let i = recent.length - 2; i >= 1 && !result.bearish; i--) {
    const bar = recent[i];
    if (bar.close <= bar.open) continue;                         // must be an up-close candle
    const next = recent.slice(i + 1, Math.min(i + 3, recent.length));
    if (next.some(n => n.close < bar.low)) {
      result.bearish = `Bearish OB: $${bar.open.toFixed(2)}–$${bar.high.toFixed(2)} — last bullish candle before downside displacement`;
    }
  }

  return result;
}

// ── Real Fair Value Gap detection ─────────────────────────────────────────────
// Scans the last 20 candles for the most recent unmitigated 3-candle imbalance.
// A bullish FVG exists when candle[i].high < candle[i+2].low.
// A bearish FVG exists when candle[i].low  > candle[i+2].high.
// "Unmitigated" means current price has NOT yet traded into the gap.

export type HLBar = { high: number; low: number };

export function detectFVG(bars: HLBar[], currentPrice: number): string | null {
  if (bars.length < 3) return null;

  for (let i = bars.length - 3; i >= Math.max(0, bars.length - 20); i--) {
    const b0 = bars[i], b2 = bars[i + 2];
    const age = bars.length - 2 - i;

    // Bullish FVG: gap between b0.high and b2.low
    if (b2.low > b0.high) {
      const lo = b0.high, hi = b2.low;
      if (!(currentPrice >= lo && currentPrice <= hi)) {
        const rel = currentPrice > hi ? "below price" : "above price";
        return `Bullish FVG: $${lo.toFixed(2)}–$${hi.toFixed(2)} (${age}d, ${rel}) — unmitigated imbalance, price likely to fill`;
      }
    }

    // Bearish FVG: gap between b2.high and b0.low
    if (b2.high < b0.low) {
      const lo = b2.high, hi = b0.low;
      if (!(currentPrice >= lo && currentPrice <= hi)) {
        const rel = currentPrice > hi ? "below price" : "above price";
        return `Bearish FVG: $${lo.toFixed(2)}–$${hi.toFixed(2)} (${age}d, ${rel}) — unmitigated imbalance, price likely to fill`;
      }
    }
  }

  return null;
}

// ── Main scoring function ─────────────────────────────────────────────────────

export function smartMoneyScore(
  input: SmBaseInput,
  extras: SmExtras = {},
): SmScore {
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
  const { trend5dPct, newsCount = 0, emaAlignment = null, orderBlockLabel, fvgLabel } = extras;

  // ── Day range ────────────────────────────────────────────────────────────
  const dayH    = high ?? price;
  const dayL    = low  ?? price;
  const dayMid  = (dayH + dayL) / 2;
  const daySpan = dayH - dayL;
  const pctPos  = daySpan > 0 ? ((price - dayL) / daySpan) * 100 : 50;

  // ── Descriptive zones (labels only — NOT used as score inputs) ──────────
  const priceZone: "Premium" | "Discount" | "Equilibrium" =
    pctPos > 56 ? "Premium" : pctPos < 44 ? "Discount" : "Equilibrium";

  const marketStructure: "Bullish" | "Bearish" | "Ranging" =
    changePercent > 0.6 ? "Bullish" : changePercent < -0.6 ? "Bearish" : "Ranging";

  const dailyBias: "Bullish" | "Bearish" | "Neutral" =
    changePercent > 0.2 ? "Bullish" : changePercent < -0.2 ? "Bearish" : "Neutral";

  // ── Volume ───────────────────────────────────────────────────────────────
  const volRatio = volume != null && avgVolume && avgVolume > 0 ? volume / avgVolume : null;
  const highVol  = volRatio != null && volRatio >= 1.4;
  const lowVol   = volRatio != null && volRatio < 0.6;

  // ── 52-week range ─────────────────────────────────────────────────────────
  const yearPct =
    high52w && low52w && high52w > low52w
      ? ((price - low52w) / (high52w - low52w)) * 100
      : null;

  // ── SCORING — Momentum-first approach ────────────────────────────────────
  //
  // Max achievable score breakdown:
  //   5-day trend:   ±4 pts  (primary signal)
  //   Today's move:  ±2 pts  (must confirm trend)
  //   Volume:        ±2 pts  (quality boost)
  //   52w position:  ±1 pt   (momentum quality)
  //   News:          ±1 pt   (scan bonus)
  //   EMA:           ±1 pt   (structural confirmation)
  //   Total max:     ±11 pts
  //
  // Thresholds:  ≥7 = High, ≥5 = Medium, ≥3 = Low, else HOLD

  let score = 0;

  // ── Primary: Multi-day trend (most predictive of 24-48h direction) ───────
  if (trend5dPct != null) {
    if      (trend5dPct >  8) score += 4;
    else if (trend5dPct >  3) score += 3;
    else if (trend5dPct >  1) score += 2;
    else if (trend5dPct >  0.3) score += 1;
    else if (trend5dPct < -8) score -= 4;
    else if (trend5dPct < -3) score -= 3;
    else if (trend5dPct < -1) score -= 2;
    else if (trend5dPct < -0.3) score -= 1;
  }

  // ── Confirmation: Today's action must agree with the trend ───────────────
  if      (changePercent >  2.0) score += 2;
  else if (changePercent >  0.8) score += 1;
  else if (changePercent < -2.0) score -= 2;
  else if (changePercent < -0.8) score -= 1;

  // ── Conflict veto: trend and today disagree → clamp to HOLD territory ────
  if (trend5dPct != null) {
    const trendDir = trend5dPct > 0.5 ? 1 : trend5dPct < -0.5 ? -1 : 0;
    const dayDir   = changePercent > 0.5 ? 1 : changePercent < -0.5 ? -1 : 0;
    if (trendDir !== 0 && dayDir !== 0 && trendDir !== dayDir) {
      score = Math.sign(score) * Math.min(Math.abs(score), 2);
    }
  }

  // ── Volume: amplifies or weakens the signal ───────────────────────────────
  if (volRatio != null) {
    if      (volRatio >= 2.5) score = score > 0 ? score + 2 : score - 2;
    else if (volRatio >= 1.4) score = score > 0 ? score + 1 : score - 1;
    else if (volRatio <  0.6) score = Math.round(score * 0.5);
  }

  // ── 52-week momentum quality ──────────────────────────────────────────────
  if (yearPct != null) {
    if (yearPct > 85 && score > 0) score += 1;
    if (yearPct < 15 && score < 0) score -= 1;
  }

  // ── EMA stack alignment ───────────────────────────────────────────────────
  if (emaAlignment === "bullish" && score > 0) score += 1;
  if (emaAlignment === "bearish" && score < 0) score -= 1;
  if (emaAlignment === "bearish" && score > 0) score = Math.min(score, 4);
  if (emaAlignment === "bullish" && score < 0) score = Math.max(score, -4);

  // ── News bonus (scan only) ────────────────────────────────────────────────
  if (newsCount >= 3) score = score > 0 ? score + 1 : score - 1;

  // ── Signal + confidence from score ───────────────────────────────────────
  let signal: "BUY" | "HOLD" | "SELL";
  let confidence: "High" | "Medium" | "Low";

  if      (score >= 7) { signal = "BUY";  confidence = "High";   }
  else if (score >= 5) { signal = "BUY";  confidence = "Medium";  }
  else if (score >= 3) { signal = "BUY";  confidence = "Low";     }
  else if (score <= -7){ signal = "SELL"; confidence = "High";   }
  else if (score <= -5){ signal = "SELL"; confidence = "Medium";  }
  else if (score <= -3){ signal = "SELL"; confidence = "Low";     }
  else                 { signal = "HOLD"; confidence = "Low";     }

  // ── Order Block — use real pre-computed value from caller; no heuristic ──
  const orderBlock: string | null = orderBlockLabel ?? null;

  // ── Fair Value Gap — use real pre-computed value from caller; no heuristic
  const fairValueGap: string | null = fvgLabel ?? null;

  // ── Liquidity levels ──────────────────────────────────────────────────────
  const refH = Math.max(dayH, previousClose);
  const refL = Math.min(dayL, previousClose);
  const liquidity =
    dailyBias === "Bullish"
      ? `Buy-side liquidity above $${refH.toFixed(2)} — equal highs / prior day high`
      : dailyBias === "Bearish"
      ? `Sell-side liquidity below $${refL.toFixed(2)} — equal lows / prior day low`
      : `Liquidity at $${refH.toFixed(2)} (BSL) and $${refL.toFixed(2)} (SSL)`;

  // ── OTE zones — Fibonacci retracement ────────────────────────────────────
  // Long OTE: 70.5–79% retracement FROM the day HIGH back toward the LOW.
  // This places the zone in the lower ~21–29% of the day range — discount.
  // Short OTE: 70.5–79% retracement FROM the day LOW back toward the HIGH.
  // This places the zone in the upper ~71–79% of the day range — premium.
  let ote: string | null = null;
  if (daySpan > 1) {
    if (signal === "BUY") {
      const lo = dayH - daySpan * 0.79;
      const hi = dayH - daySpan * 0.705;
      ote = `Long OTE: $${lo.toFixed(2)}–$${hi.toFixed(2)} (70.5–79% retracement from high — optimal discount entry zone)`;
    } else if (signal === "SELL") {
      const lo = dayL + daySpan * 0.705;
      const hi = dayL + daySpan * 0.79;
      ote = `Short OTE: $${lo.toFixed(2)}–$${hi.toFixed(2)} (70.5–79% retracement from low — optimal premium entry zone)`;
    }
  }

  // ── Immediate Rebalance ───────────────────────────────────────────────────
  let immediateRebalance: string | null = null;
  if (open != null) {
    const irLow  = Math.min(open, previousClose);
    const irHigh = Math.max(open, previousClose);
    const irSize = irHigh - irLow;
    if (irSize > price * 0.0008 && irSize < price * 0.025 && irSize > 0.01) {
      const isBullishGap = open > previousClose;
      immediateRebalance = isBullishGap
        ? `Bullish IR: $${irLow.toFixed(2)} – $${irHigh.toFixed(2)} — session gap. Strong long entry on first retest from above.`
        : `Bearish IR: $${irLow.toFixed(2)} – $${irHigh.toFixed(2)} — session gap. Strong short entry on first retest from below.`;
    }
  }

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
    bslPrice: refH,
    sslPrice: refL,
    ote,
    immediateRebalance,
  };
}

// ─── Canonical trade levels ────────────────────────────────────────────────────
// The single authoritative entry/stop/target computation shared by every route
// (analyze, options-scan, AI scan).  No route may compute these fields locally;
// all must call this function so every card and every breakdown show identical
// numbers for the same ticker at the same moment.

function fmtCanon(p: number): string {
  const d = p < 1 ? 4 : p < 10 ? 3 : 2;
  return p.toFixed(d);
}

export interface CanonicalTrade {
  // Raw numbers — for invariant checks and further math in callers
  entryLow:  number;
  entryHigh: number;
  entryMid:  number;
  stopRaw:   number;
  targetRaw: number;
  riskDist:  number;
  liqRR:     number;
  // Ratio only (no suffix) — callers append ":1" or ":1 R:R" as needed
  rrNum:     string;
  // Pre-formatted price strings
  entryZone: string;  // "$X.XX – $Y.YY"
  stopFmt:   string;  // "$X.XX"
  targetFmt: string;  // "$X.XX"
}

/**
 * Compute canonical trade levels from a SmScore.
 * Returns null when signal is HOLD or day high/low data is unavailable.
 * Every route that surfaces entry / stop / target MUST call this — never
 * compute those fields independently.
 */
export function computeCanonicalTrade(
  sm: Pick<SmScore, "signal" | "dayH" | "dayL" | "daySpan" | "bslPrice" | "sslPrice">,
  price: number,
): CanonicalTrade | null {
  const { signal, dayH, dayL, daySpan, bslPrice, sslPrice } = sm;
  if (signal === "HOLD" || !(dayH > 0) || !(dayL > 0)) return null;

  const span      = daySpan > 0.01 ? daySpan : price * 0.01;
  const entryLow  = signal === "BUY" ? dayL + span * 0.05 : dayH - span * 0.30;
  const entryHigh = signal === "BUY" ? dayL + span * 0.30 : dayH - span * 0.05;
  const entryMid  = (entryLow + entryHigh) / 2;
  // Structural stop: just beyond the session extreme.
  // Buffer = larger of 3% of day span or 0.1% of price.
  const buf       = Math.max(span * 0.03, price * 0.001);
  const stopRaw   = signal === "BUY" ? dayL - buf : dayH + buf;
  const riskDist  = Math.abs(entryMid - stopRaw);

  // Target the actual BSL/SSL liquidity level — that's where price is drawn.
  // Fall back to 2:1 R:R when the liquidity level is closer than 1:1.
  const liquidityTP = signal === "BUY" ? bslPrice : sslPrice;
  const liqRR       = riskDist > 0 ? Math.abs(liquidityTP - entryMid) / riskDist : 0;
  const targetRaw   = liqRR >= 1
    ? liquidityTP
    : (signal === "BUY" ? entryMid + riskDist * 2 : entryMid - riskDist * 2);
  const rrNum       = riskDist > 0
    ? (Math.abs(targetRaw - entryMid) / riskDist).toFixed(1)
    : "2.0";

  return {
    entryLow, entryHigh, entryMid,
    stopRaw, targetRaw,
    riskDist, liqRR,
    rrNum,
    entryZone: `$${fmtCanon(entryLow)} – $${fmtCanon(entryHigh)}`,
    stopFmt:   `$${fmtCanon(stopRaw)}`,
    targetFmt: `$${fmtCanon(targetRaw)}`,
  };
}
