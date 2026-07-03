export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 12;

import { auth }          from "@/auth";
import { toYahooSymbol } from "@/app/lib/yahooSymbol";

// ── Technical indicator math ──────────────────────────────────────────────────

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgGain   = gains  / period;
  const avgLoss   = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

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

function macd(closes: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  if (closes.length < 35) return { macd: null, signal: null, histogram: null };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]).slice(25);
  if (macdLine.length < 9) return { macd: null, signal: null, histogram: null };
  const signalLine = ema(macdLine, 9);
  const last = macdLine[macdLine.length - 1];
  const sig  = signalLine[signalLine.length - 1];
  return {
    macd:      parseFloat(last.toFixed(4)),
    signal:    parseFloat(sig.toFixed(4)),
    histogram: parseFloat((last - sig).toFixed(4)),
  };
}

function bollingerBands(closes: number[], period = 20, stdMult = 2): {
  upper: number | null; middle: number | null; lower: number | null; pct: number | null;
} {
  if (closes.length < period) return { upper: null, middle: null, lower: null, pct: null };
  const slice = closes.slice(-period);
  const mean  = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std   = Math.sqrt(variance);
  const upper = mean + stdMult * std;
  const lower = mean - stdMult * std;
  const last  = closes[closes.length - 1];
  const pct   = std > 0 ? parseFloat(((last - lower) / (upper - lower) * 100).toFixed(1)) : null;
  return {
    upper:  parseFloat(upper.toFixed(2)),
    middle: parseFloat(mean.toFixed(2)),
    lower:  parseFloat(lower.toFixed(2)),
    pct,
  };
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return parseFloat((slice.reduce((s, v) => s + v, 0) / period).toFixed(2));
}

// ── Export type ───────────────────────────────────────────────────────────────

export type Technicals = {
  symbol:    string;
  rsi14:     number | null;
  rsiSignal: "overbought" | "neutral" | "oversold" | null;
  macd:      number | null;
  signal:    number | null;
  histogram: number | null;
  macdCross: "bullish" | "bearish" | "neutral" | null;
  bbUpper:   number | null;
  bbMiddle:  number | null;
  bbLower:   number | null;
  bbPct:     number | null;   // 0–100: 0 = lower band, 100 = upper band
  bbSignal:  "overbought" | "neutral" | "oversold" | null;
  sma50:     number | null;
  sma200:    number | null;
  smaCross:  "golden" | "death" | "none" | null;
  price:     number | null;
  aboveSma50:  boolean | null;
  aboveSma200: boolean | null;
};

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const sym = (new URL(req.url).searchParams.get("symbol") ?? "").trim();
  if (!sym) return Response.json({ error: "Missing symbol" }, { status: 400 });

  const yahoo = toYahooSymbol(sym);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1y`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) return Response.json({ error: "No data" }, { status: 404 });

    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => v !== null && typeof v === "number");
    const price = closes[closes.length - 1] ?? null;

    if (closes.length < 20) return Response.json({ error: "Insufficient data" }, { status: 422 });

    const rsiVal  = rsi(closes);
    const macdRes = macd(closes);
    const bb      = bollingerBands(closes);
    const s50     = sma(closes, 50);
    const s200    = sma(closes, 200);

    const rsiSignal: Technicals["rsiSignal"] =
      rsiVal === null ? null : rsiVal >= 70 ? "overbought" : rsiVal <= 30 ? "oversold" : "neutral";

    const macdCross: Technicals["macdCross"] =
      macdRes.macd === null || macdRes.signal === null ? null
      : macdRes.histogram! > 0 ? "bullish"
      : macdRes.histogram! < 0 ? "bearish"
      : "neutral";

    const bbSignal: Technicals["bbSignal"] =
      bb.pct === null ? null : bb.pct >= 90 ? "overbought" : bb.pct <= 10 ? "oversold" : "neutral";

    const smaCross: Technicals["smaCross"] =
      s50 === null || s200 === null ? null
      : s50 > s200 ? "golden" : s50 < s200 ? "death" : "none";

    const data: Technicals = {
      symbol:      sym,
      rsi14:       rsiVal,
      rsiSignal,
      macd:        macdRes.macd,
      signal:      macdRes.signal,
      histogram:   macdRes.histogram,
      macdCross,
      bbUpper:     bb.upper,
      bbMiddle:    bb.middle,
      bbLower:     bb.lower,
      bbPct:       bb.pct,
      bbSignal,
      sma50:       s50,
      sma200:      s200,
      smaCross,
      price,
      aboveSma50:  price !== null && s50 !== null ? price > s50 : null,
      aboveSma200: price !== null && s200 !== null ? price > s200 : null,
    };

    return Response.json(data);
  } catch {
    return Response.json(null);
  }
}
