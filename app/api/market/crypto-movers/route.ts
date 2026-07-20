export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 25;

import { auth } from "@/auth";
import { smartMoneyScore } from "@/app/lib/smartMoney";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BacktestStats = {
  buyCount:     number;
  buyHitRate:   number | null;   // % of historical BUY signals followed by a positive 3-day return
  buyAvgReturn: number | null;
  sellCount:    number;
  sellHitRate:  number | null;   // % of historical SELL signals followed by a negative 3-day return
  sellAvgReturn: number | null;
  // Unconditional average 3-day return across the whole backtested window,
  // regardless of signal. In a broad decline, EVERY signal type (including a
  // do-nothing baseline) shows a negative average return — a SELL signal is
  // only actually adding value if it beats this, not just if its hit rate
  // clears 50%. Compare buy/sellAvgReturn against this before reading either
  // as skill rather than "the whole market moved that way anyway."
  baselineAvgReturn: number | null;
};

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
  // instead of stock data. No LLM involved; this is deterministic math,
  // computed off the last FULLY CLOSED daily bar (never today's in-progress
  // one, which would bias volume/change/trend toward "quiet" earlier in the
  // UTC day since crypto trades continuously with no session close).
  signal:      "BUY" | "HOLD" | "SELL" | null;   // BUY ~ expect up, SELL ~ expect down
  confidence:  "High" | "Medium" | "Low" | null;
  score:       number | null;   // -11..+11, raw weighted score behind the signal
  trend5dPct:  number | null;
  dailyBias:   "Bullish" | "Bearish" | "Neutral" | null;
  overbought:  boolean;          // RSI > 75 at signal time — tempers a BUY's confidence
  oversold:    boolean;          // RSI < 25 at signal time — tempers a SELL's confidence
  // Walk-forward backtest of this exact scoring logic against this coin's own
  // trailing ~1y of price history — no lookahead: each historical signal only
  // ever sees data available up to that day, then checked against what the
  // price actually did over the next 3 days.
  backtest:    BacktestStats | null;
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

const BIG_MOVE_THRESHOLD  = 5;    // %
const SQUEEZE_PERCENTILE  = 20;   // bottom 20% of own trailing BB-width history
const YEAR_MIN_DAYS       = 300;  // require close to a real year before trusting "52-week" high/low
const BACKTEST_WARMUP     = 55;   // needs ema50 (50) + trend5d (5) headroom
const BACKTEST_FORWARD    = 3;    // days ahead the backtest checks outcome over

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

function emaAlignmentAt(closes: number[], upto: number, price: number): "bullish" | "bearish" | "neutral" | null {
  if (upto < 50) return null;
  const window = closes.slice(0, upto + 1);
  const ema20 = ema(window, 20).at(-1)!;
  const ema50 = ema(window, 50).at(-1)!;
  if (price > ema20 && ema20 > ema50) return "bullish";
  if (price < ema20 && ema20 < ema50) return "bearish";
  return "neutral";
}

// ── Point-in-time signal — used for BOTH the live read and every backtest step,
// so the backtest measures exactly the logic actually shown to users, not a
// simplified stand-in. Only ever looks at data up to and including `i` — no
// lookahead into the future.
// ──────────────────────────────────────────────────────────────────────────────

type PointSignal = {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  score: number;
  dailyBias: "Bullish" | "Bearish" | "Neutral";
  overbought: boolean;
  oversold: boolean;
};

function computeSignalAt(
  i: number,
  closes: number[], highs: number[], lows: number[], vols: number[],
): PointSignal | null {
  if (i < 21 || i >= closes.length) return null; // need 20d volume history + yesterday
  const price        = closes[i];
  const previousClose = closes[i - 1];
  if (!(previousClose > 0)) return null;
  const changePercent = ((price - previousClose) / previousClose) * 100;

  const trend5dPct = i >= 5 && closes[i - 5] > 0 ? ((price - closes[i - 5]) / closes[i - 5]) * 100 : null;
  const volSlice   = vols.slice(Math.max(0, i - 20), i);
  const avgVolume  = volSlice.length >= 15 ? volSlice.reduce((s, v) => s + v, 0) / volSlice.length : null;
  const volume     = vols[i] ?? null;

  // Trailing window only — a "52-week" figure at a historical point must not
  // see prices that hadn't happened yet.
  const windowStart = Math.max(0, i - 365);
  const highWindow  = highs.slice(windowStart, i + 1);
  const lowWindow   = lows.slice(windowStart, i + 1);
  const high52w     = highWindow.length >= YEAR_MIN_DAYS ? Math.max(...highWindow) : null;
  const low52w      = lowWindow.length  >= YEAR_MIN_DAYS ? Math.min(...lowWindow)  : null;

  const sm = smartMoneyScore(
    {
      price, previousClose,
      open: null, high: highs[i] ?? null, low: lows[i] ?? null,
      volume, avgVolume,
      high52w, low52w, changePercent,
    },
    { trend5dPct, emaAlignment: emaAlignmentAt(closes, i, price) },
  );

  // RSI-extreme tempering — chasing an already-overbought BUY or an already-
  // oversold SELL is a well-known way momentum signals overextend and reverse.
  // Only ever downgrades confidence, never upgrades — same convention the
  // shared engine itself uses for conflicting signals.
  const rsiAt = rsi(closes.slice(0, i + 1));
  const overbought = rsiAt !== null && rsiAt > 75;
  const oversold   = rsiAt !== null && rsiAt < 25;
  let confidence = sm.confidence;
  if (overbought && sm.signal === "BUY"  && confidence === "High") confidence = "Medium";
  if (oversold   && sm.signal === "SELL" && confidence === "High") confidence = "Medium";

  return { signal: sm.signal, confidence, score: sm.score, dailyBias: sm.dailyBias, overbought, oversold };
}

// ── Walk-forward backtest ──────────────────────────────────────────────────────

function backtestSignal(closes: number[], highs: number[], lows: number[], vols: number[]): BacktestStats {
  const buyReturns:  number[] = [];
  const sellReturns: number[] = [];
  const allReturns:  number[] = [];   // unconditional — every day, signal or not
  const last = closes.length - 1 - BACKTEST_FORWARD;
  for (let i = BACKTEST_WARMUP; i <= last; i++) {
    const fwd = closes[i] > 0 ? ((closes[i + BACKTEST_FORWARD] - closes[i]) / closes[i]) * 100 : null;
    if (fwd === null) continue;
    allReturns.push(fwd);
    const sig = computeSignalAt(i, closes, highs, lows, vols);
    if (!sig || sig.signal === "HOLD") continue;
    if (sig.signal === "BUY") buyReturns.push(fwd); else sellReturns.push(fwd);
  }
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  return {
    buyCount:      buyReturns.length,
    buyHitRate:    buyReturns.length  > 0 ? Math.round((buyReturns.filter(r => r > 0).length  / buyReturns.length)  * 1000) / 10 : null,
    buyAvgReturn:  avg(buyReturns)  !== null ? Math.round(avg(buyReturns)!  * 100) / 100 : null,
    sellCount:     sellReturns.length,
    sellHitRate:   sellReturns.length > 0 ? Math.round((sellReturns.filter(r => r < 0).length / sellReturns.length) * 1000) / 10 : null,
    sellAvgReturn: avg(sellReturns) !== null ? Math.round(avg(sellReturns)! * 100) / 100 : null,
    baselineAvgReturn: avg(allReturns) !== null ? Math.round(avg(allReturns)! * 100) / 100 : null,
  };
}

// ── Per-coin fetch ─────────────────────────────────────────────────────────────

async function fetchCoin(coin: { symbol: string; ticker: string; name: string }): Promise<CryptoMover | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(coin.symbol)}?interval=1d&range=1y`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) },
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
    const livePrice = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    const prevClose  = closes[closes.length - 2];
    const changePct  = prevClose > 0 ? ((livePrice - prevClose) / prevClose) * 100 : null;
    const bbPct      = widthPercentile(closes);

    // Signal is computed off the last FULLY CLOSED daily bar (length-2), never
    // today's in-progress one — crypto trades 24/7 with no session close, so a
    // partial "today" bar understates volume/change purely by time-of-day,
    // nothing to do with real market activity.
    const historicalCloses = closes.slice(0, -1);
    const historicalHighs  = highs.slice(0, -1);
    const historicalLows   = lows.slice(0, -1);
    const historicalVols   = vols.slice(0, -1);
    const signalIdx = historicalCloses.length - 1;

    const point = signalIdx >= 21 ? computeSignalAt(signalIdx, historicalCloses, historicalHighs, historicalLows, historicalVols) : null;
    const backtest = historicalCloses.length >= BACKTEST_WARMUP + BACKTEST_FORWARD + 10
      ? backtestSignal(historicalCloses, historicalHighs, historicalLows, historicalVols)
      : null;

    const trend5dPct = closes.length >= 6 && closes[closes.length - 6] > 0
      ? ((livePrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
      : null;

    return {
      symbol:      coin.symbol,
      ticker:      coin.ticker,
      name:        coin.name,
      price:       parseFloat(livePrice.toFixed(6)),
      changePct:   changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
      rsi14:       rsi(closes),
      bbWidthPct:  bbPct,
      squeeze:     bbPct !== null && bbPct <= SQUEEZE_PERCENTILE,
      bigMove:     changePct !== null && Math.abs(changePct) >= BIG_MOVE_THRESHOLD,
      sparkline:   closes.slice(-30).map(v => parseFloat(v.toPrecision(6))),
      signal:      point?.signal ?? null,
      confidence:  point?.confidence ?? null,
      score:       point?.score ?? null,
      dailyBias:   point?.dailyBias ?? null,
      overbought:  point?.overbought ?? false,
      oversold:    point?.oversold ?? false,
      trend5dPct:  trend5dPct !== null ? parseFloat(trend5dPct.toFixed(2)) : null,
      backtest,
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
