import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime     = "nodejs";
export const maxDuration = 55;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

type Bar = { o: number; h: number; l: number; c: number; v: number; t: number };

export type ICTSetup = {
  direction: "LONG" | "SHORT";
  entryFrom: string;
  entryTo:   string;
  entryTrigger: string;
  stopLoss: string;
  stopReason: string;
  target1: string; target1Reason: string;
  target2: string; target2Reason: string;
  target3: string | null; target3Reason: string | null;
  rrRatio: string;
  invalidation: string;
  bestEntryTime: string;
};

export type DeepICTAnalysis = {
  overallBias:    "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence:     "High" | "Medium" | "Low";
  biasReasoning:  string;

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
    bsl:         string[];
    ssl:         string[];
    dominantSide: "BSL" | "SSL" | "Equal";
    likelyTarget: string;
  };

  orderBlocks: {
    bullish: { zone: string; timeframe: string; mitigated: boolean } | null;
    bearish: { zone: string; timeframe: string; mitigated: boolean } | null;
    priceAtOB: boolean;
    note: string;
  };

  fvgs: {
    above: { zone: string; timeframe: string }[];
    below: { zone: string; timeframe: string }[];
    currentlyInFVG: boolean;
    note: string;
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

  scenarioA:  ICTSetup;
  scenarioB:  ICTSetup | null;
  watchList:  string[];

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

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchBars(ticker: string, interval: string, range: string): Promise<Bar[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    const r   = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
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

async function fetchNews(ticker: string): Promise<string[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=5&quotesCount=0`;
    const r   = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
    const d   = await r.json();
    return ((d?.news ?? []) as { title?: string; publisher?: string }[])
      .slice(0, 5)
      .map(n => `${n.title ?? ""} (${n.publisher ?? ""})`);
  } catch { return []; }
}

function calcATR(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i-1].c),
      Math.abs(bars[i].l - bars[i-1].c),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 2) return null;
  const slice = bars.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i].c - slice[i-1].c;
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function swingHiLo(bars: Bar[], n = 30): { hi: number; lo: number } {
  const sl = bars.slice(-n);
  return {
    hi: Math.max(...sl.map(b => b.h)),
    lo: Math.min(...sl.map(b => b.l)),
  };
}

function fib(hi: number, lo: number, level: number): number {
  return hi - (hi - lo) * level;
}

function px(n: number): string { return `$${n.toFixed(2)}`; }

function etSession(): string {
  const now = new Date();
  const etOff = now.getTimezoneOffset() < new Date(now.getFullYear(), 6, 1).getTimezoneOffset() ? -4 : -5;
  const et  = new Date(now.getTime() + (now.getTimezoneOffset() + etOff * 60) * 60_000);
  const h   = et.getHours();
  const min = et.getMinutes();
  const zone =
    h >= 2  && h < 5  ? "London Kill Zone (2–5 AM ET)"  :
    h >= 8  && h < 11 ? "NY Kill Zone (8:30–11 AM ET)"  :
    h >= 10 && h < 12 ? "London Close (10 AM–12 PM ET)" :
    h >= 12 && h < 16 ? "NY Afternoon"                  :
    "Overnight / Pre-Market";
  return `${et.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} ${h}:${String(min).padStart(2,"0")} ET — ${zone}`;
}

// ── Main handler ───────────────────────────────────────────────────────────────

function sanitizeSymbol(raw: string): string | null {
  const clean = String(raw).replace(/\.(US|COMM|F)$/i, "").toUpperCase().trim();
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(clean)) return null;
  return clean;
}

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
  if (!ticker) {
    return Response.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Fetch data in parallel
  const [daily, weekly, news] = await Promise.all([
    fetchBars(ticker, "1d",  "3mo"),
    fetchBars(ticker, "1wk", "1y"),
    fetchNews(ticker),
  ]);

  if (daily.length < 10) {
    return Response.json({ error: `No data for ${ticker}` }, { status: 400 });
  }

  // ── Pre-calculate levels ──────────────────────────────────────────────────
  const today     = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2] ?? today;
  const price     = today.c;

  // Previous day
  const pdh = yesterday.h;
  const pdl = yesterday.l;

  // Previous week — find last completed ISO week
  const thisWeekStart = (() => {
    const d = new Date(today.t * 1000);
    const day = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1..Sun=7
    const mon = new Date(d); mon.setDate(d.getDate() - (day - 1));
    return mon.getTime() / 1000;
  })();
  const prevWeekBars = daily.filter(b => b.t < thisWeekStart).slice(-5);
  const pwh = prevWeekBars.length ? Math.max(...prevWeekBars.map(b => b.h)) : today.h;
  const pwl = prevWeekBars.length ? Math.min(...prevWeekBars.map(b => b.l)) : today.l;

  // This week open (first bar >= thisWeekStart)
  const weeklyOpen = (daily.find(b => b.t >= thisWeekStart) ?? today).o;

  // Monthly open (first bar of current month)
  const monthStart = (() => { const d = new Date(today.t * 1000); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000; })();
  const monthlyOpen = (daily.find(b => b.t >= monthStart) ?? today).o;

  // Swing high/low (last 30 days)
  const { hi: swingHigh, lo: swingLow } = swingHiLo(daily, 30);

  // OTE levels (Fibonacci from 30-day swing)
  const ote705L  = fib(swingHigh, swingLow, 0.705);
  const ote79L   = fib(swingHigh, swingLow, 0.79);
  const ote705S  = fib(swingLow, swingHigh, 0.705);
  const ote79S   = fib(swingLow, swingHigh, 0.79);

  // Equilibrium (50%)
  const dailyEq   = (today.h + today.l) / 2;
  const weeklyEq  = (pwh + pwl) / 2;
  const swingEq   = (swingHigh + swingLow) / 2;

  // ATR / RSI
  const atr14 = calcATR(daily, 14);
  const rsi14 = calcRSI(daily, 14);

  // Volume vs 20-day avg
  const vol20avg = daily.slice(-20).reduce((s, b) => s + b.v, 0) / 20;
  const volRatio = vol20avg > 0 ? today.v / vol20avg : null;

  // Weekly structure (last 10 weeks)
  const wkBars = weekly.slice(-10);
  const weeklyTrend = wkBars.length >= 3
    ? (wkBars[wkBars.length-1].h > wkBars[wkBars.length-3].h &&
       wkBars[wkBars.length-1].l > wkBars[wkBars.length-3].l ? "Bullish HH/HL" : "Bearish LH/LL")
    : "Insufficient data";

  // Daily structure (last 10 bars)
  const dailyBars10 = daily.slice(-10);
  const dailyTrend = dailyBars10.length >= 3
    ? (dailyBars10[dailyBars10.length-1].h > dailyBars10[dailyBars10.length-3].h &&
       dailyBars10[dailyBars10.length-1].l > dailyBars10[dailyBars10.length-3].l ? "Bullish HH/HL" : "Bearish LH/LL")
    : "Insufficient data";

  // 52-week position
  const high52 = Math.max(...daily.map(b => b.h));
  const low52  = Math.min(...daily.map(b => b.l));
  const pct52  = high52 !== low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;

  // ── Build data block for Claude ───────────────────────────────────────────
  const dataBlock = `
=== LIVE MARKET DATA FOR ${ticker} ===
Session: ${etSession()}

CURRENT PRICE: ${px(price)}
Today Open: ${px(today.o)} | High: ${px(today.h)} | Low: ${px(today.l)} | Close: ${px(today.c)}
Previous Day: High ${px(pdh)} | Low ${px(pdl)} | Close ${px(yesterday.c)}
Previous Week: High (PWH) ${px(pwh)} | Low (PWL) ${px(pwl)}
Current Week Open: ${px(weeklyOpen)}
Monthly Open: ${px(monthlyOpen)}

30-DAY SWING LEVELS:
  Swing High: ${px(swingHigh)}
  Swing Low:  ${px(swingLow)}
  50% Equilibrium: ${px(swingEq)}

FIBONACCI LEVELS FROM SWING:
  OTE Long Zone (0.705–0.79 retrace): ${px(ote705L)} – ${px(ote79L)}
  OTE Short Zone (0.705–0.79 retrace): ${px(ote705S)} – ${px(ote79S)}
  0.886 retrace (long): ${px(fib(swingHigh, swingLow, 0.886))}
  0.886 retrace (short): ${px(fib(swingLow, swingHigh, 0.886))}

EQUILIBRIUM:
  Daily range 50%: ${px(dailyEq)}
  Previous week 50%: ${px(weeklyEq)}

INDICATORS:
  14-day ATR: ${atr14 ? px(atr14) : "N/A"} (expected daily range)
  14-day RSI: ${rsi14 ? rsi14.toFixed(1) : "N/A"} (${rsi14 ? (rsi14 > 70 ? "Overbought" : rsi14 < 30 ? "Oversold" : "Neutral") : "N/A"})
  52-week range position: ${pct52.toFixed(0)}% (${pct52 > 70 ? "near highs — Premium zone" : pct52 < 30 ? "near lows — Discount zone" : "mid-range"})
  Volume vs 20-day avg: ${volRatio ? `${volRatio.toFixed(2)}x` : "N/A"}

DERIVED STRUCTURE:
  Weekly trend (last 10 weeks): ${weeklyTrend}
  Daily trend (last 10 bars):   ${dailyTrend}

LAST 20 DAILY OHLCV (newest last):
${daily.slice(-20).map(b => {
  const d = new Date(b.t * 1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const dir = b.c > b.o ? "▲" : "▼";
  return `  ${d}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} ${dir} Vol:${(b.v/1e6).toFixed(1)}M`;
}).join("\n")}

LAST 8 WEEKLY BARS:
${weekly.slice(-8).map(b => {
  const d = new Date(b.t * 1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const dir = b.c > b.o ? "▲" : "▼";
  return `  Wk ${d}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} ${dir}`;
}).join("\n")}

RECENT NEWS (last 48 hours):
${news.length ? news.map(n => `  • ${n}`).join("\n") : "  No recent news found."}
`;

  // ── Claude prompt ──────────────────────────────────────────────────────────
  const prompt = `You are an elite ICT (Inner Circle Trader) market analyst trained in the complete methodology of Michael J. Huddleston. You think like a Smart Money trader, not retail. Analyze only with ICT concepts.

The data below is already calculated and live. Use it to perform a FULL ICT analysis.

${dataBlock}

═══════════════════════════════════════════════════════════
YOUR TASK: PRODUCE COMPLETE ICT ANALYSIS
═══════════════════════════════════════════════════════════

Apply the ICT framework top-down: Monthly → Weekly → Daily → 4H → 1H.

RULES:
1. NEVER give a LONG bias when price is in Premium. NEVER give a SHORT bias in Discount.
2. Minimum R:R = 3:1. Reject and flag "noTrade: true" if no 3:1 setup exists.
3. If HTF and LTF conflict → noTrade: true.
4. Only enter at defined OB, FVG, or OTE zones — never chase.
5. Define invalidation BEFORE entry.

OUTPUT FORMAT — Valid JSON only. No text outside the JSON:

{
  "overallBias": "BULLISH | BEARISH | NEUTRAL",
  "confidence": "High | Medium | Low",
  "biasReasoning": "2-3 sentences using ICT concepts only",

  "marketStructure": {
    "monthly": "describe monthly trend and last BOS/ChoCH",
    "weekly": "describe weekly trend and draw on liquidity",
    "daily": "describe daily structure and most recent BOS",
    "h4": "infer 4H structure from the daily bars provided",
    "recentBOS": "price level and direction of most recent BOS",
    "recentChoCH": "price level and direction of most recent ChoCH/MSS or 'None identified'",
    "drawOnLiquidity": "where is price most likely drawing towards and why"
  },

  "liquidity": {
    "bsl": ["price level: description", "..."],
    "ssl": ["price level: description", "..."],
    "dominantSide": "BSL | SSL | Equal",
    "likelyTarget": "specific price level and reason"
  },

  "orderBlocks": {
    "bullish": { "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H|Weekly", "mitigated": false } or null,
    "bearish": { "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H|Weekly", "mitigated": false } or null,
    "priceAtOB": true or false,
    "note": "brief description of OB confluence"
  },

  "fvgs": {
    "above": [{ "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H" }],
    "below": [{ "zone": "$X.XX – $X.XX", "timeframe": "Daily|4H" }],
    "currentlyInFVG": true or false,
    "note": "which FVG is the most important draw"
  },

  "premiumDiscount": {
    "weeklyEq": "$X.XX",
    "dailyEq":  "$X.XX",
    "currentZone": "Premium | Discount | Equilibrium",
    "note": "explain positioning relative to 50% arrays"
  },

  "ote": {
    "longZone":  { "from": "$X.XX", "to": "$X.XX" } or null,
    "shortZone": { "from": "$X.XX", "to": "$X.XX" } or null,
    "inOTE": true or false
  },

  "keyLevels": {
    "pwh": "$X.XX", "pwl": "$X.XX",
    "pdh": "$X.XX", "pdl": "$X.XX",
    "weeklyOpen": "$X.XX",
    "monthlyOpen": "$X.XX",
    "atr14": "$X.XX",
    "rsi14": "XX.X",
    "swingHigh": "$X.XX",
    "swingLow":  "$X.XX",
    "eq50": "$X.XX"
  },

  "killZones": {
    "nextKillZone": "Name and time window ET",
    "setupNote": "which kill zone offers the highest-probability entry for this setup and why"
  },

  "scenarioA": {
    "direction": "LONG | SHORT",
    "entryFrom": "$X.XX",
    "entryTo":   "$X.XX",
    "entryTrigger": "specific ICT confirmation required at the 15M level",
    "stopLoss": "$X.XX",
    "stopReason": "structural reason (e.g. below 4H OB low)",
    "target1": "$X.XX", "target1Reason": "liquidity pool / FVG name",
    "target2": "$X.XX", "target2Reason": "next HTF target",
    "target3": "$X.XX or null", "target3Reason": "string or null",
    "rrRatio": "X.X:1",
    "invalidation": "$X.XX — reason this setup is off",
    "bestEntryTime": "Kill Zone window (e.g. NY Open KZ 9:30–10:30 AM ET)"
  },

  "scenarioB": null or same format as scenarioA,

  "watchList": [
    "Specific price that CONFIRMS the bias",
    "Specific price that INVALIDATES the bias",
    "Key correlated asset or event to monitor"
  ],

  "risk": {
    "earningsWithin5Days": false,
    "earningsDate": null or "Mon DD",
    "majorEventThisWeek": false,
    "majorEvent": null or "event name",
    "ivElevated": false,
    "lowLiquidity": false
  },

  "noTrade": false,
  "noTradeNote": null or "reason why there is no valid setup today"
}

FILL keyLevels using the exact pre-calculated numbers in the data above.
All price levels must be derived from the data provided — no estimates.
Return ONLY valid JSON.`;

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 8000,
      messages:   [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("").trim();

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    const parsed = JSON.parse(match[0]) as DeepICTAnalysis;

    // Override keyLevels with pre-calculated ground-truth values
    parsed.keyLevels = {
      pwh:         px(pwh),
      pwl:         px(pwl),
      pdh:         px(pdh),
      pdl:         px(pdl),
      weeklyOpen:  px(weeklyOpen),
      monthlyOpen: px(monthlyOpen),
      atr14:       atr14 ? px(atr14) : "N/A",
      rsi14:       rsi14 ? rsi14.toFixed(1) : "N/A",
      swingHigh:   px(swingHigh),
      swingLow:    px(swingLow),
      eq50:        px(swingEq),
    };

    return Response.json(parsed);
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return Response.json(
      { error: `ICT analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
