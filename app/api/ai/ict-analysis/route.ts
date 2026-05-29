import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime     = "nodejs";
export const maxDuration = 55;

import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ──────────────────────────────────────────────────────────────────────

type Bar = { o: number; h: number; l: number; c: number; v: number; t: number };

export type ICTSetup = {
  direction:    "LONG" | "SHORT";
  entryFrom:    string;
  entryTo:      string;
  entryTrigger: string;
  stopLoss:     string;
  stopReason:   string;
  target1: string; target1Reason: string;
  target2: string; target2Reason: string;
  target3: string | null; target3Reason: string | null;
  rrRatio:      string;
  invalidation: string;
  bestEntryTime:string;
};

export type DeepICTAnalysis = {
  overallBias:   "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence:    "High" | "Medium" | "Low";
  biasReasoning: string;

  marketStructure: {
    monthly:         string;
    weekly:          string;
    daily:           string;
    h4:              string;
    recentBOS:       string;
    recentChoCH:     string;
    drawOnLiquidity: string;
  };

  liquidity: {
    bsl:          string[];
    ssl:          string[];
    dominantSide: "BSL" | "SSL" | "Equal";
    likelyTarget: string;
  };

  orderBlocks: {
    bullish: { zone: string; timeframe: string; mitigated: boolean } | null;
    bearish: { zone: string; timeframe: string; mitigated: boolean } | null;
    priceAtOB: boolean;
    note:      string;
  };

  fvgs: {
    above:          { zone: string; timeframe: string }[];
    below:          { zone: string; timeframe: string }[];
    currentlyInFVG: boolean;
    note:           string;
  };

  premiumDiscount: {
    weeklyEq:    string;
    dailyEq:     string;
    currentZone: "Premium" | "Discount" | "Equilibrium";
    note:        string;
  };

  ote: {
    longZone:  { from: string; to: string } | null;
    shortZone: { from: string; to: string } | null;
    inOTE:     boolean;
  };

  keyLevels: {
    pwh: string; pwl: string;
    pdh: string; pdl: string;
    weeklyOpen:  string;
    monthlyOpen: string;
    atr14:       string;
    rsi14:       string;
    swingHigh:   string;
    swingLow:    string;
    eq50:        string;
  };

  killZones: {
    nextKillZone: string;
    setupNote:    string;
  };

  scenarioA: ICTSetup;
  scenarioB: ICTSetup | null;
  watchList: string[];

  risk: {
    earningsWithin5Days: boolean;
    earningsDate:        string | null;
    majorEventThisWeek:  boolean;
    majorEvent:          string | null;
    ivElevated:          boolean;
    lowLiquidity:        boolean;
  };

  noTrade:     boolean;
  noTradeNote: string | null;
};

// ── Data fetchers (all timeout-guarded) ───────────────────────────────────────

async function fetchFinnhubQuote(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const d = await r.json() as { c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
    return (d.c && d.c > 0) ? d : null;
  } catch { return null; }
}

async function fetchFinnhubProfile(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const d = await r.json() as { name?: string; marketCapitalization?: number; finnhubIndustry?: string; country?: string; currency?: string };
    return d.name ? d : null;
  } catch { return null; }
}

async function fetchFinnhubEarnings(symbol: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${key}&limit=10`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const arr = await r.json() as { date?: string }[];
    if (!Array.isArray(arr)) return null;
    const nowMs = Date.now();
    const upcoming = arr
      .filter(e => e.date && new Date(e.date).getTime() > nowMs)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())[0];
    return upcoming?.date ?? null;
  } catch { return null; }
}

async function fetchFinnhubSentiment(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const d = await r.json() as {
      sentiment?: { bullishPercent?: number; bearishPercent?: number };
      buzz?:      { articlesInLastWeek?: number };
      companyNewsScore?: number;
    };
    return d.sentiment ? d : null;
  } catch { return null; }
}

async function fetchFinnhubBars(symbol: string, key: string): Promise<Bar[]> {
  try {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - 120 * 86400;
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    const d = await r.json() as { s?: string; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; t?: number[] };
    if (d.s !== "ok" || !d.c?.length) return [];
    return d.t!.map((ts, i) => ({ o: d.o![i], h: d.h![i], l: d.l![i], c: d.c![i], v: d.v![i] ?? 0, t: ts }))
              .filter(b => b.o && b.h && b.l && b.c);
  } catch { return []; }
}

async function fetchEodhdBars(symbol: string, key: string): Promise<Bar[]> {
  try {
    const from = new Date(Date.now() - 120 * 86400 * 1000).toISOString().split("T")[0];
    const r = await fetch(
      `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${key}&fmt=json&period=d&from=${from}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    const arr = await r.json() as { date?: string; open?: number; high?: number; low?: number; close?: number; volume?: number }[];
    if (!Array.isArray(arr)) return [];
    return arr.map(b => ({ o: b.open!, h: b.high!, l: b.low!, c: b.close!, v: b.volume ?? 0, t: new Date(b.date!).getTime() / 1000 }))
              .filter(b => b.o && b.h && b.l && b.c);
  } catch { return []; }
}

async function fetchYahooBars(ticker: string, interval: string, range: string): Promise<Bar[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return [];
    const ts = result.timestamp as number[] ?? [];
    const q  = result.indicators?.quote?.[0] ?? {};
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
      if (o && h && l && c) bars.push({ o, h, l, c, v: v ?? 0, t: ts[i] });
    }
    return bars;
  } catch { return []; }
}

async function fetchYahooNews(ticker: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=6&quotesCount=0`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    const d = await r.json();
    return ((d?.news ?? []) as { title?: string; publisher?: string }[])
      .slice(0, 6).map(n => `${n.title ?? ""} (${n.publisher ?? ""})`);
  } catch { return []; }
}

// Aggregate 1H bars into 4H candles
function derive4H(h1: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < h1.length; i += 4) {
    const chunk = h1.slice(i, i + 4);
    if (chunk.length < 2) break;
    out.push({
      o: chunk[0].o,
      h: Math.max(...chunk.map(b => b.h)),
      l: Math.min(...chunk.map(b => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + b.v, 0),
      t: chunk[0].t,
    });
  }
  return out;
}

// ── Math helpers ───────────────────────────────────────────────────────────────

function calcATR(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 2) return null;
  const slice = bars.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i].c - slice[i - 1].c;
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function swingHiLo(bars: Bar[], n = 30) {
  const sl = bars.slice(-n);
  return { hi: Math.max(...sl.map(b => b.h)), lo: Math.min(...sl.map(b => b.l)) };
}

function fib(hi: number, lo: number, level: number) { return hi - (hi - lo) * level; }
function px(n: number) { return `$${n.toFixed(2)}`; }

function etSession(): string {
  const now   = new Date();
  const etOff = now.getTimezoneOffset() < new Date(now.getFullYear(), 6, 1).getTimezoneOffset() ? -4 : -5;
  const et    = new Date(now.getTime() + (now.getTimezoneOffset() + etOff * 60) * 60_000);
  const h = et.getHours(), min = et.getMinutes();
  const zone =
    (h >= 2  && h < 5)  ? "London Kill Zone (2–5 AM ET)"  :
    (h >= 8  && h < 11) ? "NY Kill Zone (8:30–11 AM ET)"  :
    (h >= 10 && h < 12) ? "London Close (10 AM–12 PM ET)" :
    (h >= 12 && h < 16) ? "NY Afternoon"                  :
    "Overnight / Pre-Market";
  return `${et.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${h}:${String(min).padStart(2, "0")} ET — ${zone}`;
}

function sanitizeSymbol(raw: string): string | null {
  const clean = String(raw).replace(/\.(US|COMM|F)$/i, "").toUpperCase().trim();
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(clean)) return null;
  return clean;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!checkRateLimit(`ict:${session.user.email}`, 5, 60_000)) {
    return Response.json({ error: "Rate limit — max 5 deep analyses per minute" }, { status: 429 });
  }

  const { symbol } = await req.json() as { symbol: string };
  const ticker = sanitizeSymbol(symbol);
  if (!ticker) return Response.json({ error: "Invalid symbol" }, { status: 400 });

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const eodhdKey   = process.env.EODHD_API_KEY;

  // ── Fetch everything in parallel ─────────────────────────────────────────────
  const [
    fhQuote,
    fhProfile,
    fhEarningsDate,
    fhSentiment,
    fhDaily,
    eodhdDaily,
    yahooDaily,
    yahooWeekly,
    yahooHourly,
    news,
  ] = await Promise.all([
    finnhubKey ? fetchFinnhubQuote(ticker, finnhubKey)    : Promise.resolve(null),
    finnhubKey ? fetchFinnhubProfile(ticker, finnhubKey)  : Promise.resolve(null),
    finnhubKey ? fetchFinnhubEarnings(ticker, finnhubKey) : Promise.resolve(null),
    finnhubKey ? fetchFinnhubSentiment(ticker, finnhubKey): Promise.resolve(null),
    finnhubKey ? fetchFinnhubBars(ticker, finnhubKey)     : Promise.resolve([]),
    eodhdKey   ? fetchEodhdBars(ticker, eodhdKey)         : Promise.resolve([]),
    fetchYahooBars(ticker, "1d",  "3mo"),
    fetchYahooBars(ticker, "1wk", "1y"),
    fetchYahooBars(ticker, "1h",  "10d"),
    fetchYahooNews(ticker),
  ]);

  // Best daily bars: Finnhub > EODHD > Yahoo (prefer most bars)
  const daily: Bar[] = (() => {
    const candidates = [fhDaily, eodhdDaily, yahooDaily].filter(a => a.length >= 10);
    return candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  })();

  if (daily.length < 10) {
    return Response.json({ error: `No data for ${ticker}` }, { status: 400 });
  }

  const weekly = yahooWeekly;
  const h4Bars = derive4H(yahooHourly);

  // ── Pre-calculate levels ──────────────────────────────────────────────────────
  const today     = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2] ?? today;

  // Use Finnhub real-time price if available, else last close
  const price = fhQuote?.c ?? today.c;

  const pdh = yesterday.h;
  const pdl = yesterday.l;

  const thisWeekStart = (() => {
    const d   = new Date(today.t * 1000);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (day - 1));
    return mon.getTime() / 1000;
  })();
  const prevWeekBars = daily.filter(b => b.t < thisWeekStart).slice(-5);
  const pwh = prevWeekBars.length ? Math.max(...prevWeekBars.map(b => b.h)) : today.h;
  const pwl = prevWeekBars.length ? Math.min(...prevWeekBars.map(b => b.l)) : today.l;

  const weeklyOpen  = (daily.find(b => b.t >= thisWeekStart) ?? today).o;
  const monthStart  = (() => { const d = new Date(today.t * 1000); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000; })();
  const monthlyOpen = (daily.find(b => b.t >= monthStart) ?? today).o;

  const { hi: swingHigh, lo: swingLow } = swingHiLo(daily, 30);
  const ote705L = fib(swingHigh, swingLow, 0.705);
  const ote79L  = fib(swingHigh, swingLow, 0.79);
  const ote705S = fib(swingLow, swingHigh, 0.705);
  const ote79S  = fib(swingLow, swingHigh, 0.79);

  const dailyEq  = (today.h + today.l) / 2;
  const weeklyEq = (pwh + pwl) / 2;
  const swingEq  = (swingHigh + swingLow) / 2;

  const atr14    = calcATR(daily, 14);
  const rsi14    = calcRSI(daily, 14);
  const vol20avg = daily.slice(-20).reduce((s, b) => s + b.v, 0) / 20;
  const volRatio = vol20avg > 0 ? today.v / vol20avg : null;

  const wkBars10 = weekly.slice(-10);
  const weeklyTrend = wkBars10.length >= 3
    ? (wkBars10.at(-1)!.h > wkBars10.at(-3)!.h && wkBars10.at(-1)!.l > wkBars10.at(-3)!.l
        ? "Bullish HH/HL" : "Bearish LH/LL")
    : "Insufficient data";

  const daily10 = daily.slice(-10);
  const dailyTrend = daily10.length >= 3
    ? (daily10.at(-1)!.h > daily10.at(-3)!.h && daily10.at(-1)!.l > daily10.at(-3)!.l
        ? "Bullish HH/HL" : "Bearish LH/LL")
    : "Insufficient data";

  const h4Trend = h4Bars.length >= 3
    ? (h4Bars.at(-1)!.h > h4Bars.at(-3)!.h && h4Bars.at(-1)!.l > h4Bars.at(-3)!.l
        ? "Bullish HH/HL" : "Bearish LH/LL")
    : "Insufficient H4 data";

  const high52 = Math.max(...daily.map(b => b.h));
  const low52  = Math.min(...daily.map(b => b.l));
  const pct52  = high52 !== low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;

  // Earnings risk
  const earningsWithin5Days = fhEarningsDate
    ? Math.abs(new Date(fhEarningsDate).getTime() - Date.now()) < 5 * 86400 * 1000
    : false;

  // ── Data block for Claude ─────────────────────────────────────────────────────
  const dataProviders = [
    finnhubKey && fhQuote   ? "Finnhub (real-time)" : null,
    eodhdKey && eodhdDaily.length >= 10 ? "EODHD (daily bars)" : null,
    "Yahoo Finance (weekly + 1H → 4H)",
  ].filter(Boolean).join(", ");

  const dataBlock = `
=== DEEP MARKET DATA: ${ticker} ===
Data sources: ${dataProviders}
Session: ${etSession()}

${fhProfile ? `COMPANY: ${fhProfile.name} | Industry: ${fhProfile.finnhubIndustry ?? "N/A"} | Mkt Cap: $${fhProfile.marketCapitalization ? (fhProfile.marketCapitalization / 1000).toFixed(1) + "B" : "N/A"}` : ""}
${fhSentiment?.sentiment ? `NEWS SENTIMENT (last 7 days): Bullish ${((fhSentiment.sentiment.bullishPercent ?? 0) * 100).toFixed(0)}% | Bearish ${((fhSentiment.sentiment.bearishPercent ?? 0) * 100).toFixed(0)}% | Articles: ${fhSentiment.buzz?.articlesInLastWeek ?? "N/A"}` : ""}

CURRENT PRICE: ${px(price)} ${fhQuote ? "(Finnhub real-time)" : "(last close)"}
Today  — O:${px(today.o)} H:${px(today.h)} L:${px(today.l)} C:${px(today.c)}
Prev Day — H:${px(pdh)} L:${px(pdl)} C:${px(yesterday.c)}
Prev Week — H (PWH):${px(pwh)} L (PWL):${px(pwl)}
Weekly Open: ${px(weeklyOpen)}
Monthly Open: ${px(monthlyOpen)}

30-DAY SWING:
  High: ${px(swingHigh)} | Low: ${px(swingLow)} | 50% EQ: ${px(swingEq)}

FIBONACCI (30-day swing):
  OTE Long  (0.705–0.79): ${px(ote705L)} – ${px(ote79L)}
  OTE Short (0.705–0.79): ${px(ote705S)} – ${px(ote79S)}
  0.886 Long:  ${px(fib(swingHigh, swingLow, 0.886))}
  0.886 Short: ${px(fib(swingLow, swingHigh, 0.886))}

EQUILIBRIUM:
  Daily candle 50%:  ${px(dailyEq)}
  Prev week 50%:     ${px(weeklyEq)}

INDICATORS:
  ATR-14: ${atr14 ? px(atr14) : "N/A"}
  RSI-14: ${rsi14 ? rsi14.toFixed(1) : "N/A"} (${rsi14 ? rsi14 > 70 ? "Overbought" : rsi14 < 30 ? "Oversold" : "Neutral" : "N/A"})
  52-week range: ${pct52.toFixed(0)}% — ${pct52 > 70 ? "near highs / Premium" : pct52 < 30 ? "near lows / Discount" : "mid-range"}
  Volume vs 20-day avg: ${volRatio ? `${volRatio.toFixed(2)}x` : "N/A"}

MULTI-TIMEFRAME TREND (structure):
  Weekly (last 10 wk):  ${weeklyTrend}
  Daily  (last 10 bars):${dailyTrend}
  4H     (derived 1H):  ${h4Trend}

LAST 20 DAILY BARS (newest last):
${daily.slice(-20).map(b => {
  const dt  = new Date(b.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dir = b.c > b.o ? "▲" : "▼";
  return `  ${dt}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} ${dir} Vol:${(b.v / 1e6).toFixed(1)}M`;
}).join("\n")}

LAST 8 WEEKLY BARS:
${weekly.slice(-8).map(b => {
  const dt  = new Date(b.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dir = b.c > b.o ? "▲" : "▼";
  return `  Wk ${dt}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} ${dir}`;
}).join("\n")}

LAST 20 4H BARS (derived from 1H):
${h4Bars.length ? h4Bars.slice(-20).map(b => {
  const dt  = new Date(b.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dir = b.c > b.o ? "▲" : "▼";
  return `  ${dt}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} ${dir}`;
}).join("\n") : "  No intraday data available."}

EARNINGS:
  Next date: ${fhEarningsDate ?? "Unknown"} | Within 5 days: ${earningsWithin5Days ? "YES — elevated risk" : "No"}

RECENT NEWS:
${news.length ? news.map(n => `  • ${n}`).join("\n") : "  No recent headlines."}
`.trim();

  // ── Claude prompt ─────────────────────────────────────────────────────────────
  const prompt = `You are an elite institutional market analyst with deep expertise in smart money concepts, price action, order flow, liquidity, and multi-timeframe market structure. Think like an institution — not retail.

The data below is live and pre-calculated. Use it to perform a FULL multi-timeframe institutional market analysis.

${dataBlock}

═══════════════════════════════════════════════════════════
TASK: PRODUCE COMPLETE MARKET ANALYSIS — valid JSON only
═══════════════════════════════════════════════════════════

Top-down: Monthly → Weekly → Daily → 4H → 1H

RULES:
1. NEVER go LONG in Premium. NEVER go SHORT in Discount.
2. Minimum R:R = 3:1. If no 3:1 exists → noTrade: true.
3. HTF/LTF conflict → noTrade: true.
4. Only enter at defined OB, FVG, or OTE — never chase.
5. Set invalidation BEFORE entry.
6. Use 4H bars to refine structure (they are real derived data, not estimates).
7. Factor in news sentiment and earnings risk for the risk block.

OUTPUT — Valid JSON only. No markdown, no text outside JSON:

{
  "overallBias": "BULLISH | BEARISH | NEUTRAL",
  "confidence": "High | Medium | Low",
  "biasReasoning": "2-3 sentences using smart money and market structure concepts",

  "marketStructure": {
    "monthly": "...",
    "weekly": "...",
    "daily": "...",
    "h4": "use the real 4H bars provided — describe structure, last BOS, and draw on liquidity",
    "recentBOS": "price level and direction",
    "recentChoCH": "price level and direction or 'None identified'",
    "drawOnLiquidity": "where price is most likely drawing and why"
  },

  "liquidity": {
    "bsl": ["$X.XX: description"],
    "ssl": ["$X.XX: description"],
    "dominantSide": "BSL | SSL | Equal",
    "likelyTarget": "$X.XX — reason"
  },

  "orderBlocks": {
    "bullish": { "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H|Weekly", "mitigated": false } or null,
    "bearish": { "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H|Weekly", "mitigated": false } or null,
    "priceAtOB": true or false,
    "note": "..."
  },

  "fvgs": {
    "above": [{ "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H" }],
    "below": [{ "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H" }],
    "currentlyInFVG": true or false,
    "note": "..."
  },

  "premiumDiscount": {
    "weeklyEq": "$X.XX",
    "dailyEq":  "$X.XX",
    "currentZone": "Premium | Discount | Equilibrium",
    "note": "..."
  },

  "ote": {
    "longZone":  { "from": "$X.XX", "to": "$X.XX" } or null,
    "shortZone": { "from": "$X.XX", "to": "$X.XX" } or null,
    "inOTE": true or false
  },

  "keyLevels": {
    "pwh": "$X.XX", "pwl": "$X.XX",
    "pdh": "$X.XX", "pdl": "$X.XX",
    "weeklyOpen": "$X.XX", "monthlyOpen": "$X.XX",
    "atr14": "$X.XX", "rsi14": "XX.X",
    "swingHigh": "$X.XX", "swingLow": "$X.XX", "eq50": "$X.XX"
  },

  "killZones": {
    "nextKillZone": "Name and ET time window",
    "setupNote": "which kill zone best fits this setup and why"
  },

  "scenarioA": {
    "direction": "LONG | SHORT",
    "entryFrom": "$X.XX", "entryTo": "$X.XX",
    "entryTrigger": "specific 15M entry confirmation required",
    "stopLoss": "$X.XX", "stopReason": "...",
    "target1": "$X.XX", "target1Reason": "...",
    "target2": "$X.XX", "target2Reason": "...",
    "target3": "$X.XX or null", "target3Reason": "... or null",
    "rrRatio": "X.X:1",
    "invalidation": "$X.XX — reason",
    "bestEntryTime": "Kill Zone window ET"
  },

  "scenarioB": null or same shape as scenarioA,

  "watchList": [
    "Price that CONFIRMS the bias",
    "Price that INVALIDATES the bias",
    "Correlated asset or macro event to monitor"
  ],

  "risk": {
    "earningsWithin5Days": ${earningsWithin5Days},
    "earningsDate": ${fhEarningsDate ? `"${fhEarningsDate}"` : "null"},
    "majorEventThisWeek": false,
    "majorEvent": null or "event name",
    "ivElevated": false,
    "lowLiquidity": false
  },

  "noTrade": false,
  "noTradeNote": null or "reason"
}

FILL keyLevels with the exact pre-calculated numbers above.
All price targets must derive from real data — no guesses.
Return ONLY valid JSON.`;

  function parseAndOverwrite(text: string): DeepICTAnalysis {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const parsed = JSON.parse(match[0]) as DeepICTAnalysis;
    parsed.keyLevels = {
      pwh: px(pwh), pwl: px(pwl), pdh: px(pdh), pdl: px(pdl),
      weeklyOpen: px(weeklyOpen), monthlyOpen: px(monthlyOpen),
      atr14: atr14 ? px(atr14) : "N/A", rsi14: rsi14 ? rsi14.toFixed(1) : "N/A",
      swingHigh: px(swingHigh), swingLow: px(swingLow), eq50: px(swingEq),
    };
    parsed.risk.earningsWithin5Days = earningsWithin5Days;
    parsed.risk.earningsDate        = fhEarningsDate ?? null;
    return parsed;
  }

  async function callOpenAICompat(url: string, key: string, model: string, maxTokens: number): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: `You are an institutional market analyst. Return ONLY valid JSON, no markdown, no text outside JSON.\n\n${SYSTEM_FRAMEWORK}` },
            { role: "user",   content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(50000),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
      const d = await res.json() as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.error(`[ict-analysis] ${url} error:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  let analysisText: string | null = null;

  // ── Try Anthropic ─────────────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const response = await client.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 4096,
        system:     SYSTEM_FRAMEWORK,
        messages:   [{ role: "user", content: prompt }],
      });
      analysisText = response.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("").trim();
    } catch (err) {
      console.error("[ict-analysis] Anthropic error:", err instanceof Error ? err.message : err);
    }
  }

  // ── Fallback: Groq ────────────────────────────────────────────────────────────
  if (!analysisText) {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      analysisText = await callOpenAICompat(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey, "llama-3.3-70b-versatile", 4096,
      );
    }
  }

  // ── Fallback: DeepSeek ────────────────────────────────────────────────────────
  if (!analysisText) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      analysisText = await callOpenAICompat(
        "https://api.deepseek.com/v1/chat/completions",
        deepseekKey, "deepseek-chat", 4096,
      );
    }
  }

  if (!analysisText) {
    return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
  }

  try {
    return Response.json(parseAndOverwrite(analysisText));
  } catch (err) {
    console.error("[ict-analysis] Parse failed. Raw snippet:", analysisText.slice(0, 400));
    return Response.json(
      { error: `Analysis parse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
