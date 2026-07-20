export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { auth } from "@/auth";
import { smartMoneyScore } from "@/app/lib/smartMoney";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CryptoMover = {
  symbol:      string;
  ticker:      string;
  name:        string;
  price:       number | null;
  changePct:   number | null;   // ~24h, vs prior daily close
  rsi14:       number | null;
  bbWidthPct:  number | null;   // 0-100 percentile rank of current BB width vs its own trailing 90d range
  squeeze:     boolean;         // bbWidthPct in the tightest 20% of its own recent history
  bigMove:     boolean;         // |changePct| >= 5
  sparkline:   number[];        // last 30 daily closes, for mini charts
  // Directional read — same weighted scoring engine that drives the stock
  // "AI Signals" feature (app/lib/smartMoney.ts), fed real crypto OHLCV
  // instead of stock data. No LLM involved; this is deterministic math.
  signal:      "BUY" | "HOLD" | "SELL" | null;   // BUY ~ expect up, SELL ~ expect down
  confidence:  "High" | "Medium" | "Low" | null;
  score:       number | null;   // -11..+11, raw weighted score behind the signal
  trend5dPct:  number | null;
  dailyBias:   "Bullish" | "Bearish" | "Neutral" | null;
};

// ── Universe — same 12 coins shown on the Crypto tab ──────────────────────────

const COINS: { symbol: string; ticker: string; name: string }[] = [
  { symbol: "BTC-USD",     ticker: "BTC",   name: "Bitcoin"    },
  { symbol: "ETH-USD",     ticker: "ETH",   name: "Ethereum"   },
  { symbol: "SOL-USD",     ticker: "SOL",   name: "Solana"     },
  { symbol: "BNB-USD",     ticker: "BNB",   name: "BNB"        },
  { symbol: "XRP-USD",     ticker: "XRP",   name: "XRP"        },
  { symbol: "ADA-USD",     ticker: "ADA",   name: "Cardano"    },
  { symbol: "AVAX-USD",    ticker: "AVAX",  name: "Avalanche"  },
  { symbol: "DOGE-USD",    ticker: "DOGE",  name: "Dogecoin"   },
  { symbol: "LINK-USD",    ticker: "LINK",  name: "Chainlink"  },
  { symbol: "DOT-USD",     ticker: "DOT",   name: "Polkadot"   },
  { symbol: "TRX-USD",     ticker: "TRX",   name: "Tron"       },
  { symbol: "UNI7083-USD", ticker: "UNI",   name: "Uniswap"    },
];

const BIG_MOVE_THRESHOLD = 5;    // %
const SQUEEZE_PERCENTILE = 20;   // bottom 20% of own trailing BB-width history

// ── Indicator math (same formulas as /api/market/technicals) ─────────────────

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

function bbWidth(closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean  = slice.reduce((s, v) => s + v, 0) / period;
  const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  if (mean === 0) return null;
  return (4 * std) / mean; // (upper - lower) / middle, band = mean +/- 2*std
}

// Percentile rank of the most recent BB width against its own trailing history —
// "tight relative to its own normal range," not tight in some universal sense.
function widthPercentile(closes: number[], period = 20, lookback = 90): number | null {
  if (closes.length < period + lookback) return null;
  const widths: number[] = [];
  for (let end = closes.length - lookback; end <= closes.length; end++) {
    const w = bbWidth(closes.slice(0, end), period);
    if (w !== null) widths.push(w);
  }
  if (widths.length < 20) return null;
  const current = widths[widths.length - 1];
  const below   = widths.filter(w => w <= current).length;
  return Math.round((below / widths.length) * 100);
}

// Same EMA formula as /api/market/technicals — one source of truth for the shape.
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev: number | null = null;
  for (const v of values) {
    if (prev === null) { prev = v; result.push(v); continue; }
    const cur: number = v * k + prev * (1 - k);
    result.push(cur);
    prev = cur;
  }
  return result;
}

function emaAlignment(closes: number[], price: number): "bullish" | "bearish" | "neutral" | null {
  if (closes.length < 50) return null;
  const ema20 = ema(closes, 20).at(-1)!;
  const ema50 = ema(closes, 50).at(-1)!;
  if (price > ema20 && ema20 > ema50) return "bullish";
  if (price < ema20 && ema20 < ema50) return "bearish";
  return "neutral";
}

// ── Per-coin fetch ─────────────────────────────────────────────────────────────

async function fetchCoin(coin: { symbol: string; ticker: string; name: string }): Promise<CryptoMover | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(coin.symbol)}?interval=1d&range=1y`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const quote  = result.indicators?.quote?.[0] ?? {};
    const isNum  = (v: unknown): v is number => typeof v === "number";
    const closes: number[] = (quote.close  ?? []).filter(isNum);
    const highs:  number[] = (quote.high   ?? []).filter(isNum);
    const lows:   number[] = (quote.low    ?? []).filter(isNum);
    const vols:   number[] = (quote.volume ?? []).filter(isNum);
    if (closes.length < 30) return null;

    const meta = result.meta ?? {};
    // meta.chartPreviousClose is the close before this whole range window (1y ago
    // here), not yesterday's close — use the actual daily series for a real 24h change.
    const price     = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;
    const bbPct     = widthPercentile(closes);

    // ── Inputs for the shared smartMoneyScore engine ──────────────────────────
    const high52w  = highs.length  > 0 ? Math.max(...highs)  : null;
    const low52w   = lows.length   > 0 ? Math.min(...lows)   : null;
    const avgVol20 = vols.length   >= 21 ? vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20 : null;
    const todayVol = vols.length   > 0 ? vols[vols.length - 1] : null;
    const trend5dPct = closes.length >= 6 && closes[closes.length - 6] > 0
      ? ((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
      : null;

    let signal:     CryptoMover["signal"]     = null;
    let confidence: CryptoMover["confidence"] = null;
    let score:      number | null             = null;
    let dailyBias:  CryptoMover["dailyBias"]  = null;
    if (changePct !== null) {
      const sm = smartMoneyScore(
        {
          price, previousClose: prevClose,
          open: null, high: highs.at(-1) ?? null, low: lows.at(-1) ?? null,
          volume: todayVol, avgVolume: avgVol20,
          high52w, low52w, changePercent: changePct,
        },
        { trend5dPct, emaAlignment: emaAlignment(closes, price) },
      );
      signal = sm.signal; confidence = sm.confidence; score = sm.score; dailyBias = sm.dailyBias;
    }

    return {
      symbol:      coin.symbol,
      ticker:      coin.ticker,
      name:        coin.name,
      price:       parseFloat(price.toFixed(6)),
      changePct:   changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
      rsi14:       rsi(closes),
      bbWidthPct:  bbPct,
      squeeze:     bbPct !== null && bbPct <= SQUEEZE_PERCENTILE,
      bigMove:     changePct !== null && Math.abs(changePct) >= BIG_MOVE_THRESHOLD,
      sparkline:   closes.slice(-30).map(v => parseFloat(v.toPrecision(6))),
      signal, confidence, score,
      trend5dPct:  trend5dPct !== null ? parseFloat(trend5dPct.toFixed(2)) : null,
      dailyBias,
    };
  } catch { return null; }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 min — crypto moves fast, keep this fresher than sports/stocks

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const results = await Promise.all(COINS.map(fetchCoin));
  const coins   = results.filter((c): c is CryptoMover => c !== null);

  const payload = { coins, updatedAt: new Date().toISOString() };
  if (coins.length > 0) cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
