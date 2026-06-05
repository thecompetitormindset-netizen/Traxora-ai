import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { toFinnhubSymbol, toYahooSymbol as toYahoo } from "@/app/lib/yahooSymbol";

export const runtime     = "nodejs";
export const maxDuration = 55;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── JSON repair (handles truncated model output) ───────────────────────────────
function repairJSON(raw: string): ProAnalysisResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  // Try direct parse first
  try { return JSON.parse(match[0]) as ProAnalysisResult; } catch { /* try repair */ }
  // Close any unclosed brackets
  const frag = match[0];
  const closers: string[] = [];
  let inStr = false, esc = false;
  for (const c of frag) {
    if (esc)        { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === "{" || c === "[") closers.push(c === "{" ? "}" : "]");
    if (c === "}" || c === "]") closers.pop();
  }
  return JSON.parse(frag + closers.reverse().join("")) as ProAnalysisResult;
}

// ── OpenAI-compatible fallback (Groq / DeepSeek) ─────────────────────────────
async function callOpenAICompat(
  url: string, key: string, model: string,
  system: string, user: string, maxTokens: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error(`[pro-analysis] ${url} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

type Bar = { o: number; h: number; l: number; c: number; v: number; t: number };

// ── Data fetchers (reused from deep-analysis) ─────────────────────────────────

async function fetchFinnhubQuote(symbol: string, key: string) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const d = await r.json() as { c?: number; h?: number; l?: number; o?: number; pc?: number; v?: number };
    return (d.c && d.c > 0) ? d : null;
  } catch { return null; }
}

async function fetchFinnhubProfile(symbol: string, key: string) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const d = await r.json() as { name?: string; marketCapitalization?: number; finnhubIndustry?: string };
    return d.name ? d : null;
  } catch { return null; }
}

async function fetchFinnhubEarnings(symbol: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${key}&limit=10`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const arr = await r.json() as { date?: string }[];
    if (!Array.isArray(arr)) return null;
    const upcoming = arr.filter(e => e.date && new Date(e.date).getTime() > Date.now())
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())[0];
    return upcoming?.date ?? null;
  } catch { return null; }
}

async function fetchFinnhubBars(symbol: string, key: string): Promise<Bar[]> {
  try {
    const to = Math.floor(Date.now() / 1000), from = to - 120 * 86400;
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const d = await r.json() as { s?: string; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; t?: number[] };
    if (d.s !== "ok" || !d.c?.length) return [];
    return d.t!.map((ts, i) => ({ o: d.o![i], h: d.h![i], l: d.l![i], c: d.c![i], v: d.v![i] ?? 0, t: ts }))
      .filter(b => b.o && b.h && b.l && b.c);
  } catch { return []; }
}

async function fetchYahooBars(ticker: string, interval: string, range: string): Promise<Bar[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
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
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    return ((d?.news ?? []) as { title?: string; publisher?: string }[])
      .slice(0, 6).map(n => `${n.title ?? ""} (${n.publisher ?? ""})`);
  } catch { return []; }
}

// Session-aligned 4H bars: group by UTC 4H boundaries (0, 4, 8, 12, 16, 20 UTC)
function derive4H(h1: Bar[]): Bar[] {
  if (!h1.length) return [];
  const buckets = new Map<number, Bar[]>();
  for (const bar of h1) {
    const bucket = Math.floor(bar.t / (4 * 3600)) * (4 * 3600);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(bar);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, bars]) => bars.length >= 2)
    .map(([t, bars]) => ({
      t,
      o: bars[0].o,
      h: Math.max(...bars.map(b => b.h)),
      l: Math.min(...bars.map(b => b.l)),
      c: bars[bars.length - 1].c,
      v: bars.reduce((s, b) => s + b.v, 0),
    }));
}

// Fetch ATM implied volatility from Yahoo Finance options chain
async function fetchImpliedVol(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const result = d?.optionChain?.result?.[0];
    if (!result) return null;
    const spotPrice: number = result.quote?.regularMarketPrice;
    const calls: Array<{ strike: number; impliedVolatility?: number }> = result.options?.[0]?.calls ?? [];
    if (!spotPrice || !calls.length) return null;
    const atm = calls.reduce<typeof calls[0] | null>((best, c) =>
      !best || Math.abs(c.strike - spotPrice) < Math.abs(best.strike - spotPrice) ? c : best,
      null,
    );
    return atm?.impliedVolatility ?? null;
  } catch { return null; }
}

function calcATR(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i-1].c), Math.abs(bars[i].l - bars[i-1].c)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(bars: Bar[], period = 14): number | null {
  if (bars.length < period * 2) return null;
  const slice = bars.slice(-(period * 3));
  // Seed: simple average of first period
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = slice[i].c - slice[i-1].c;
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  // Wilder's smoothing for remaining bars
  for (let i = period + 1; i < slice.length; i++) {
    const d = slice[i].c - slice[i-1].c;
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

// ── COT (Commitments of Traders) from CFTC public API ────────────────────────
// Maps Traxora futures symbols to CFTC market names in the Legacy report
const COT_MARKET_MAP: Record<string, string> = {
  "ES.COMM":  "E-MINI S&P 500 STOCK INDEX",
  "NQ.COMM":  "E-MINI NASDAQ-100 STOCK INDEX",
  "YM.COMM":  "MINI DOW JONES INDUSTRIAL",
  "RTY.COMM": "E-MINI RUSSELL 2000 STOCK INDEX",
  "GC.COMM":  "GOLD",
  "SI.COMM":  "SILVER",
  "CL.COMM":  "CRUDE OIL, LIGHT SWEET",
  "NG.COMM":  "NATURAL GAS",
};

type CotRow = {
  market_and_exchange_names: string;
  noncomm_positions_long_all:  string;
  noncomm_positions_short_all: string;
  comm_positions_long_all:     string;
  comm_positions_short_all:    string;
  report_date_as_yyyy_mm_dd:   string;
};

async function fetchCOT(symbol: string): Promise<string | null> {
  const marketName = COT_MARKET_MAP[symbol];
  if (!marketName) return null;
  try {
    // CFTC public API — free, no key required, ~1 week lag (published every Friday)
    const encoded = encodeURIComponent(`market_and_exchange_names like '%${marketName.split(",")[0]}%'`);
    const r = await fetch(
      `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?$where=${encoded}&$order=report_date_as_yyyy_mm_dd+DESC&$limit=1`,
      { cache: "no-store", headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const rows = await r.json() as CotRow[];
    if (!rows.length) return null;
    const row = rows[0];
    const commLong  = parseInt(row.comm_positions_long_all  ?? "0");
    const commShort = parseInt(row.comm_positions_short_all ?? "0");
    const specLong  = parseInt(row.noncomm_positions_long_all  ?? "0");
    const specShort = parseInt(row.noncomm_positions_short_all ?? "0");
    const commNet   = commLong  - commShort;
    const specNet   = specLong  - specShort;
    const reportDate = row.report_date_as_yyyy_mm_dd?.slice(0, 10) ?? "unknown";

    const commBias = commNet > 0
      ? `NET LONG ${commNet.toLocaleString()} contracts (commercial hedgers are buying — bullish commercial positioning)`
      : `NET SHORT ${Math.abs(commNet).toLocaleString()} contracts (commercial hedgers are short — bearish commercial positioning)`;
    const specBias = specNet > 0
      ? `NET LONG ${specNet.toLocaleString()} contracts (large specs are bullish — trend-follower crowding)`
      : `NET SHORT ${Math.abs(specNet).toLocaleString()} contracts (large specs are bearish — watch for short squeeze)`;

    return `COT DATA (as of ${reportDate}, published weekly by CFTC):
  Commercials (hedgers): ${commBias}
  Large Speculators:     ${specBias}
  Signal: ${commNet > 0 && specNet < 0 ? "BULLISH — commercials long, specs short = classic setup for upside move" :
            commNet < 0 && specNet > 0 ? "BEARISH — commercials short, specs long = specs will get squeezed on reversal" :
            "MIXED — no clear COT divergence"}`;
  } catch { return null; }
}

// Parkinson realized vol estimator (high-low based, less noise than close-to-close)
function parkinsonVol(bars: Bar[], period = 20): number | null {
  const sl = bars.slice(-period).filter(b => b.h > 0 && b.l > 0);
  if (sl.length < 5) return null;
  const sum = sl.reduce((s, b) => s + Math.pow(Math.log(b.h / b.l), 2), 0);
  return Math.sqrt((sum / (4 * sl.length * Math.log(2))) * 252);
}

// Close-to-close realized vol
function c2cVol(bars: Bar[], period = 20): number | null {
  if (bars.length < period + 1) return null;
  const sl = bars.slice(-period - 1);
  const rets = sl.slice(1).map((b, i) => Math.log(b.c / sl[i].c));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  return Math.sqrt(variance * 252);
}

function calcEMA(bars: Bar[], period: number): number | null {
  if (bars.length < period) return null;
  const k = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period;
  for (let i = period; i < bars.length; i++) ema = bars[i].c * k + ema * (1 - k);
  return ema;
}

function calcADX(bars: Bar[], period = 14): number | null {
  if (bars.length < period * 2 + 1) return null;
  const dmP: number[] = [], dmM: number[] = [], trr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i-1].h, dn = bars[i-1].l - bars[i].l;
    dmP.push(up > dn && up > 0 ? up : 0);
    dmM.push(dn > up && dn > 0 ? dn : 0);
    trr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i-1].c), Math.abs(bars[i].l - bars[i-1].c)));
  }
  let sTR = trr.slice(0, period).reduce((a,b)=>a+b,0);
  let sP  = dmP.slice(0, period).reduce((a,b)=>a+b,0);
  let sM  = dmM.slice(0, period).reduce((a,b)=>a+b,0);
  const dx: number[] = [];
  for (let i = period; i < trr.length; i++) {
    sTR = sTR - sTR / period + trr[i];
    sP  = sP  - sP  / period + dmP[i];
    sM  = sM  - sM  / period + dmM[i];
    const diP = 100 * sP / sTR, diM = 100 * sM / sTR;
    dx.push(100 * Math.abs(diP - diM) / ((diP + diM) || 1));
  }
  if (dx.length < period) return null;
  return dx.slice(-period).reduce((a,b)=>a+b,0) / period;
}

function trendDir(bars: Bar[], n = 10): "Bullish" | "Bearish" | "Ranging" {
  if (bars.length < n) return "Ranging";
  const sl = bars.slice(-n);
  const higherHighs = sl[sl.length-1].h > sl[0].h;
  const higherLows  = sl[sl.length-1].l > sl[0].l;
  if (higherHighs && higherLows) return "Bullish";
  if (!higherHighs && !higherLows) return "Bearish";
  return "Ranging";
}

function px(n: number, decimals = 2) { return `$${n.toFixed(decimals)}`; }

// US DST: starts 2nd Sunday of March at 07:00 UTC, ends 1st Sunday of November at 06:00 UTC
function isEDT(utcDate: Date): boolean {
  const y = utcDate.getUTCFullYear();
  const march1 = new Date(Date.UTC(y, 2, 1));
  const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - march1.getUTCDay()) % 7) + 7, 7, 0, 0));
  const nov1 = new Date(Date.UTC(y, 10, 1));
  const dstEnd = new Date(Date.UTC(y, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6, 0, 0));
  return utcDate >= dstStart && utcDate < dstEnd;
}

// ── Output type ───────────────────────────────────────────────────────────────

export type ProAnalysisResult = {
  as_of_utc:       string;
  regime_summary:  string;
  rankings: Array<{
    rank: number; symbol: string; direction: string;
    opportunity_score: number; confidence: number;
    risk_level: string; rr_to_t1: number; one_line: string;
  }>;
  setups: Array<{
    symbol: string; direction: string;
    lens_reads: {
      microstructure: string; auction_profile: string; trend_intermarket: string;
      volatility_edge: string; pricing_greeks: string; futures_fundamentals: string;
      psychology_gate: string; survival_risk: string;
    };
    dominant_lens: string; conflicts: string[];
    entry_zone: [number, number]; stop_loss: number;
    targets: Array<{ level: number; reason: string }>;
    invalidation: string; rr_to_t1: number; effective_leverage: number;
    edge_statement: string;
    sizing: {
      risk_dollars: number; stop_distance: number; risk_per_contract: number;
      recommended_contracts: number; margin_utilization_pct: number; calc: string;
    };
    scores: {
      trend: number; auction_structure: number; volatility: number; rr: number;
      microstructure: number; macro_news: number; technical: number;
    };
    opportunity_score: number; confidence: number; risk_level: string;
    thesis: string; assumptions: string[]; data_gaps: string[];
  }>;
  no_trade:           Array<{ symbol: string; reason: string }>;
  data_gaps_global:   string[];
  disclaimer:         string;
};

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = checkRateLimit(`pro-analysis:${session.user.email}`, 10, 60 * 60 * 1000);
  if (!allowed) return Response.json({ error: "Rate limit reached — 10 pro analyses per hour." }, { status: 429 });

  let symbol: string;
  try {
    const body = await req.json() as { symbol?: string };
    symbol = body.symbol ?? "";
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!symbol) return Response.json({ error: "symbol is required" }, { status: 400 });
  const sym = symbol.replace(/\s/g, "").toUpperCase();

  const finnhubKey = process.env.FINNHUB_API_KEY ?? "";

  // Yahoo: futures → ES=F, equities → strip .US
  const yahooSym   = toYahoo(sym);
  // Finnhub: futures → ES1! (continuous front-month), equities → strip .US
  const finnhubSym = toFinnhubSymbol(sym);

  // ── Real CME/NYMEX/COMEX initial margins (updated periodically by exchanges) ─
  const FUTURES_SPECS: Record<string, { pointValue: number; tickSize: number; margin: number; exchange: string }> = {
    "ES.COMM":  { pointValue: 50,   tickSize: 0.25,  margin: 14300,  exchange: "CME"   },
    "NQ.COMM":  { pointValue: 20,   tickSize: 0.25,  margin: 21450,  exchange: "CME"   },
    "YM.COMM":  { pointValue: 5,    tickSize: 1,     margin: 10450,  exchange: "CBOT"  },
    "RTY.COMM": { pointValue: 50,   tickSize: 0.10,  margin: 7700,   exchange: "CME"   },
    "GC.COMM":  { pointValue: 100,  tickSize: 0.10,  margin: 9900,   exchange: "COMEX" },
    "SI.COMM":  { pointValue: 5000, tickSize: 0.005, margin: 11000,  exchange: "COMEX" },
    "CL.COMM":  { pointValue: 1000, tickSize: 0.01,  margin: 5500,   exchange: "NYMEX" },
    "NG.COMM":  { pointValue: 10000,tickSize: 0.001, margin: 3300,   exchange: "NYMEX" },
    "HG.COMM":  { pointValue: 25000,tickSize: 0.0005,margin: 4500,   exchange: "COMEX" },
    "ZN.COMM":  { pointValue: 1000, tickSize: 0.015625, margin: 2200, exchange: "CBOT" },
    "ZB.COMM":  { pointValue: 1000, tickSize: 0.03125,  margin: 3300, exchange: "CBOT" },
  };
  const futuresSpec = FUTURES_SPECS[sym] ?? null;

  // ── Current ET session / kill zone ────────────────────────────────────────
  const nowUtc  = new Date();
  const etOff   = isEDT(nowUtc) ? -4 : -5;
  const etH     = (nowUtc.getUTCHours() + 24 + etOff) % 24;
  const etMin   = nowUtc.getUTCMinutes();
  const etDecimal = etH + etMin / 60;
  const currentSession =
    etDecimal >= 2  && etDecimal < 5  ? "London Kill Zone (2–5 AM ET) — highest probability for London sweep & reversal" :
    etDecimal >= 8  && etDecimal < 11 ? "New York Kill Zone (8:30–11 AM ET) — primary session for directional moves" :
    etDecimal >= 10 && etDecimal < 12 ? "London Close (10 AM–12 PM ET) — position squaring, fades common" :
    etDecimal >= 13 && etDecimal < 14 ? "New York Lunch (1–2 PM ET) — low volume, avoid new entries" :
    etDecimal >= 14 && etDecimal < 16 ? "New York Afternoon (2–4 PM ET) — Fed/economic events window" :
    etDecimal >= 18 && etDecimal < 20 ? "Asia Open (6–8 PM ET) — initial liquidity builds" :
    "Overnight / off-hours — reduced liquidity, wider spreads";

  // ── Fetch all data in parallel ────────────────────────────────────────────
  // Finnhub calls use finnhubSym (plain ticker); Yahoo calls use yahooSym (=F for futures)
  const [quote, profile, earningsDate, daily, h1Bars, news, cotData, iv] = await Promise.all([
    fetchFinnhubQuote(finnhubSym, finnhubKey)
      .then(q => q ?? fetchYahooBars(yahooSym, "1d", "2d")
        .then(bars => bars.length ? { c: bars.at(-1)!.c, h: bars.at(-1)!.h, l: bars.at(-1)!.l, o: bars.at(-1)!.o, pc: bars.at(-2)?.c ?? bars.at(-1)!.o, v: bars.at(-1)!.v } : null)),
    fetchFinnhubProfile(finnhubSym, finnhubKey),
    fetchFinnhubEarnings(finnhubSym, finnhubKey),
    fetchFinnhubBars(finnhubSym, finnhubKey)
      .then(b => b.length ? b : fetchYahooBars(yahooSym, "1d", "6mo")),
    fetchYahooBars(yahooSym, "1h", "5d"),
    fetchYahooNews(yahooSym),
    fetchCOT(sym),
    fetchImpliedVol(yahooSym),  // ATM IV from Yahoo options chain (null for futures)
  ]);

  if (!quote) return Response.json({ error: `No price data for ${sym}` }, { status: 400 });

  const price    = quote.c!;
  const prevClose = quote.pc ?? price;
  const changePct = ((price - prevClose) / prevClose) * 100;

  const h4Bars   = derive4H(h1Bars);
  const atr14    = calcATR(daily);
  const rsi14    = calcRSI(daily);
  const ema20    = calcEMA(daily, 20);
  const ema50    = calcEMA(daily, 50);
  const ema200   = calcEMA(daily, 200);
  const adx14    = calcADX(daily, 14);
  const parkVol  = parkinsonVol(daily);
  const realVol  = c2cVol(daily);
  const trendD   = trendDir(daily, 10);
  const trendW   = trendDir(daily, 30);
  const trendH4  = trendDir(h4Bars, 10);

  const swingHigh30 = daily.length ? Math.max(...daily.slice(-30).map(b => b.h)) : price;
  const swingLow30  = daily.length ? Math.min(...daily.slice(-30).map(b => b.l)) : price;
  const swingEq     = (swingHigh30 + swingLow30) / 2;

  const avgVol20 = daily.length >= 5
    ? daily.slice(-20).reduce((s, b) => s + b.v, 0) / Math.min(daily.length, 20) : null;
  const volRatio = avgVol20 && quote.v ? quote.v / avgVol20 : null;

  const earningsWithin5Days = earningsDate
    ? (new Date(earningsDate).getTime() - Date.now()) < 5 * 86400 * 1000 : false;

  // Prior session levels from daily bars
  const prevBar  = daily.at(-2);
  const weekBars = daily.slice(-5);
  const weekHigh = weekBars.length ? Math.max(...weekBars.map(b => b.h)) : null;
  const weekLow  = weekBars.length ? Math.min(...weekBars.map(b => b.l)) : null;

  const fmtBar = (b: Bar) => {
    const dt = new Date(b.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${dt}: O${px(b.o)} H${px(b.h)} L${px(b.l)} C${px(b.c)} V:${(b.v/1e6).toFixed(1)}M`;
  };

  // ── Structured MARKET_DATA block ──────────────────────────────────────────
  const marketData = `
MARKET_DATA:
{
  "symbol": "${sym}",
  "name": "${profile?.name ?? sym}",
  "industry": "${profile?.finnhubIndustry ?? "N/A"}",
  "market_cap_b": ${profile?.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(1) : "null"},
  "as_of_utc": "${new Date().toISOString()}",

  "quote": {
    "price": ${price.toFixed(4)},
    "prev_close": ${prevClose.toFixed(4)},
    "change_pct": ${changePct.toFixed(2)},
    "day_high": ${(quote.h ?? price).toFixed(4)},
    "day_low": ${(quote.l ?? price).toFixed(4)},
    "volume": ${quote.v ?? 0},
    "avg_volume_20d": ${avgVol20 ? avgVol20.toFixed(0) : "null"},
    "volume_ratio_vs_avg": ${volRatio ? volRatio.toFixed(2) : "null"}
  },

  "price_structure": {
    "swing_high_30d": ${swingHigh30.toFixed(4)},
    "swing_low_30d": ${swingLow30.toFixed(4)},
    "eq_50pct": ${swingEq.toFixed(4)},
    "pct_of_30d_range": ${swingHigh30 !== swingLow30 ? (((price - swingLow30) / (swingHigh30 - swingLow30)) * 100).toFixed(1) : "50"},
    "prior_day_high": ${prevBar ? prevBar.h.toFixed(4) : "null"},
    "prior_day_low": ${prevBar ? prevBar.l.toFixed(4) : "null"},
    "prior_day_close": ${prevBar ? prevBar.c.toFixed(4) : "null"},
    "week_high": ${weekHigh ? weekHigh.toFixed(4) : "null"},
    "week_low": ${weekLow ? weekLow.toFixed(4) : "null"},
    "today_open": ${(quote.o ?? price).toFixed(4)}
  },

  "indicators": {
    "atr_14_daily": ${atr14 ? atr14.toFixed(4) : "null"},
    "rsi_14_daily": ${rsi14 ? rsi14.toFixed(1) : "null"},
    "ema_20": ${ema20 ? ema20.toFixed(4) : "null"},
    "ema_50": ${ema50 ? ema50.toFixed(4) : "null"},
    "ema_200": ${ema200 ? ema200.toFixed(4) : "null"},
    "ema_alignment": "${ema20 && ema50 ? (price > ema20 && ema20 > ema50 ? "price > EMA20 > EMA50 — bullish stack" : price < ema20 && ema20 < ema50 ? "price < EMA20 < EMA50 — bearish stack" : ema20 > ema50 ? "EMA20 > EMA50 but price below EMA20 — watch" : "EMA20 < EMA50 — downtrend structure") : "insufficient data"}",
    "adx_14": ${adx14 ? adx14.toFixed(1) : "null"},
    "adx_interpretation": "${adx14 ? (adx14 >= 40 ? "Strong trend — do not fade" : adx14 >= 25 ? "Trend present — directional trades valid" : adx14 >= 20 ? "Weakening trend — reduce size" : "No trend / ranging — mean-reversion only, avoid breakouts") : "N/A"}",
    "realized_vol_parkinson_20d": ${parkVol ? (parkVol * 100).toFixed(1) : "null"},
    "realized_vol_c2c_20d": ${realVol ? (realVol * 100).toFixed(1) : "null"},
    "implied_vol_pct": ${iv != null ? (iv * 100).toFixed(1) : "null"},
    "implied_vol_vs_realized": ${iv != null && realVol != null ? `"${(iv * 100) > (realVol * 100 * 1.2) ? "IV > RV — premium is elevated, favor short-vol strategies" : (iv * 100) < (realVol * 100 * 0.8) ? "IV < RV — premium is cheap, favor long-vol or debit spreads" : "IV ≈ RV — fair pricing"}"` : '"not_available"'},
    "implied_vol_note": ${iv != null ? `"ATM IV ${(iv * 100).toFixed(1)}% — ${iv * 100 > 60 ? "EXTREME: options very expensive, prefer selling premium" : iv * 100 > 40 ? "HIGH: elevated risk, size down on debit trades" : iv * 100 > 20 ? "MODERATE: normal conditions" : "LOW: cheap options, consider debit spreads or long premium"}"` : '"not_supplied — futures/no-options instrument or chain unavailable; use realized_vol as proxy and flag as data_gap"'}
  },

  "trend": {
    "daily_10bar": "${trendD}",
    "weekly_30bar_proxy": "${trendW}",
    "h4_10bar": "${trendH4}"
  },

  "fundamentals": {
    "earnings_date": ${earningsDate ? `"${earningsDate}"` : "null"},
    "earnings_within_5d": ${earningsWithin5Days},
    "high_impact_event_known": ${earningsWithin5Days}
  },

  "recent_daily_bars_20": [
${daily.slice(-20).map(b => `    "${fmtBar(b)}"`).join(",\n")}
  ],

  "recent_h4_bars_16": [
${h4Bars.slice(-16).map(b => `    "${fmtBar(b)}"`).join(",\n")}
  ],

  "news_last_6": [
${news.map(n => `    "${n.replace(/"/g, "'")}"`).join(",\n")}
  ],

  "cot_commitments_of_traders": ${cotData ? `"${cotData.replace(/"/g, "'")}"` : '"Not available for this instrument (equities have no COT report)"'},

  "session_context": {
    "current_et_session": "${currentSession}",
    "et_time": "${etH}:${String(etMin).padStart(2,'0')} ET",
    "note": "Session timing is CRITICAL for futures. Only trade during kill zones for highest probability. Avoid overnight/lunch entries."
  },

  "futures_spec": ${futuresSpec
    ? JSON.stringify({
        point_value:  futuresSpec.pointValue,
        tick_size:    futuresSpec.tickSize,
        initial_margin_usd: futuresSpec.margin,
        exchange:     futuresSpec.exchange,
        risk_per_point: `$${futuresSpec.pointValue} per point — 1 point move = $${futuresSpec.pointValue} gain/loss`,
        micro_contract: sym.replace(".COMM","") === "ES" ? "MES ($5/pt, $1,430 margin)" :
                        sym.replace(".COMM","") === "NQ" ? "MNQ ($2/pt, $2,145 margin)" :
                        sym.replace(".COMM","") === "GC" ? "MGC ($10/pt, $990 margin)"  :
                        sym.replace(".COMM","") === "CL" ? "MCL ($100/pt, $550 margin)" : "Check CME for micro contract",
      }, null, 2)
    : "null (equity — no futures spec needed)"},

  "account_defaults": {
    "equity": 10000,
    "risk_per_trade_pct": 1,
    "max_open_risk_pct": 5,
    "point_value": ${futuresSpec?.pointValue ?? 1},
    "initial_margin": ${futuresSpec?.margin ?? (atr14 ? (price * 0.10).toFixed(0) : "null")},
    "note": "Equity is a default. Futures margin figures are REAL CME/NYMEX rates, not estimates."
  }
}
`.trim();

  // ── System prompt (institutional framework) ───────────────────────────────
  const systemPrompt = `You are Traxora, an institutional-grade futures and options market analyst and trade-decision engine. You produce risk-adjusted, probability-weighted assessments from structured market data, grounded in market microstructure, auction theory, volatility analytics, derivatives pricing, and disciplined risk management. Capital preservation and process integrity outrank any single trade.

### 0. Operating constraints (absolute)
1. Reason ONLY over the MARKET_DATA provided. Never invent or recall prices, indicator values, IV, Greeks, volume, open interest, or news. Missing data → lower confidence or No Trade, and list it in data_gaps. Your training data memory of what a stock "should" cost is IRRELEVANT — markets move after your cutoff. Never question the live price data provided.
2. Never compute indicators or IV yourself — they are supplied. Your job is interpretation, scoring, and thesis.
3. Distinguish fact from inference; label anything not in the data as an assumption.
4. Probability, not prediction. Never state certainty about the future.
5. Favor No Trade. A missed trade is free; a forced one is not.
6. Calibrate confidence to data quality and cross-lens agreement, not hoped-for profit.
7. Output valid JSON matching the schema and NOTHING ELSE — no prose outside the JSON, no markdown fences.
8. Decision-support only; not financial advice. Always include the disclaimer field.

### 1. The eight reasoning lenses (run in order)
L1 — Microstructure & counterparty: Who is on the other side? Treat spread as cost + signal. Poor execution quality → penalize hard.
L2 — Auction theory / Market Profile: Value area, initial balance, regime (balance vs imbalance). Smart money constructs: liquidity pools, order blocks/FVGs, prior session highs/lows.
L3 — Trend & intermarket: Align trend monthly→M15. Daily + H4 agreement required for directional trade.
L4 — Volatility analytics: Compare realized vs implied vol. IV rank/percentile. Expansion → continuation; contraction → mean-reversion or stand aside.
L5 — Derivatives pricing: Greeks the position carries. IV term structure, skew. Choose cleanest expression.
L6 — Futures mechanics: Specs, expiry, margin. Basis and curve.
L7 — Probabilistic mindset: Think in distributions. Define and fully accept risk before entry. Detect FOMO/revenge → No Trade.
L8 — Survival principles: Risk management is the first job. Cut losses early; let winners run. No position threatens the account.

### 2. Scoring model (weights sum = 100)
Trend alignment (L3): 18 — TFs agreeing with direction
Auction/structure (L2): 18 — Clean structure, valid OB/FVG, liquidity logic
Volatility edge (L4): 16 — Measurable, capturable edge; regime fit
Risk-reward (L8): 14 — RR≥2 scales to 1.0 at RR≥3
Microstructure/execution (L1): 12 — Volume, OI, spread, slippage
Macro/news alignment: 10 — Tailwind high; headwind/event-risk low
Technical confirmation (L3): 12 — Indicators agree vs contradict

opportunity_score = round(sum of weight_i × subscore_i)
confidence (0–100): separate — data quality + cross-lens agreement. Be calibrated.
risk_level: Low | Moderate | High | Extreme

### 3. Hard gates → No Trade
Any one triggers it: RR to T1 < 2.0; confidence < 70; poor liquidity; high-impact macro event inside trade horizon without event-aware plan; entry TF conflicts with both daily and H4; required data missing; L7 flags non-edge impulse.

### 4. Position sizing
risk_dollars = equity × (risk_per_trade_pct / 100)
stop_distance = |entry − stop_loss|
risk_per_contract = stop_distance × point_value
raw_contracts = floor(risk_dollars / risk_per_contract)
margin_cap = floor(equity_available / initial_margin)
recommended_contracts = max(0, min(raw_contracts, margin_cap))
margin_utilization_pct = recommended_contracts × initial_margin / equity × 100
If recommended_contracts = 0 → No Trade.

### 5. Output — return ONLY this JSON, nothing else, no markdown:
{
  "as_of_utc": "",
  "regime_summary": "",
  "rankings": [{"rank":1,"symbol":"","direction":"long|short|no_trade","opportunity_score":0,"confidence":0,"risk_level":"Low|Moderate|High|Extreme","rr_to_t1":0,"one_line":""}],
  "setups": [{
    "symbol":"","direction":"long|short|no_trade",
    "lens_reads":{"microstructure":"","auction_profile":"","trend_intermarket":"","volatility_edge":"","pricing_greeks":"","futures_fundamentals":"","psychology_gate":"pass|fail + why","survival_risk":""},
    "dominant_lens":"","conflicts":[""],
    "entry_zone":[0,0],"stop_loss":0,
    "targets":[{"level":0,"reason":""}],
    "invalidation":"","rr_to_t1":0,"effective_leverage":0,
    "edge_statement":"",
    "sizing":{"risk_dollars":0,"stop_distance":0,"risk_per_contract":0,"recommended_contracts":0,"margin_utilization_pct":0,"calc":""},
    "scores":{"trend":0,"auction_structure":0,"volatility":0,"rr":0,"microstructure":0,"macro_news":0,"technical":0},
    "opportunity_score":0,"confidence":0,"risk_level":"Low|Moderate|High|Extreme",
    "thesis":"","assumptions":[""],"data_gaps":[""]
  }],
  "no_trade":[{"symbol":"","reason":""}],
  "data_gaps_global":[""],
  "disclaimer":"Decision-support only; based solely on supplied data."
}`;

  const userMessage = `Analyse this market. Return ONLY the JSON schema — no text outside it.\n\n${marketData}`;

  // ── Try Anthropic (primary) ────────────────────────────────────────────────
  let rawText: string | null = null;

  try {
    const msg = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text?.trim() ?? null;
  } catch (err) {
    console.error("[pro-analysis] Anthropic error:", err instanceof Error ? err.message : err);
  }

  // ── Fallback: Groq ─────────────────────────────────────────────────────────
  if (!rawText) {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      rawText = await callOpenAICompat(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey, "llama-3.3-70b-versatile",
        systemPrompt, userMessage, 4000,
      );
    }
  }

  // ── Fallback: DeepSeek ─────────────────────────────────────────────────────
  if (!rawText) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      rawText = await callOpenAICompat(
        "https://api.deepseek.com/v1/chat/completions",
        deepseekKey, "deepseek-chat",
        systemPrompt, userMessage, 4000,
      );
    }
  }

  if (!rawText) {
    return Response.json({ error: "AI unavailable — all providers failed. Check your API keys." }, { status: 503 });
  }

  try {
    return Response.json(repairJSON(rawText));
  } catch (err) {
    console.error("[pro-analysis] JSON parse failed. Snippet:", rawText.slice(0, 300));
    return Response.json({ error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pro-analysis] outer error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
