import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { promises as fs } from "fs";
import path from "path";

import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";

export const runtime     = "nodejs";
export const maxDuration = 55;

async function callOpenAICompat(url: string, key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty response");
  return text;
}

async function callAI(prompt: string): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;

  // ── Anthropic (primary) ────────────────────────────────────────────────────
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await client.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 6000,
        system:     SYSTEM_FRAMEWORK,
        messages:   [{ role: "user", content: prompt }],
      });
      return res.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("").trim();
    } catch (err) {
      console.error("Anthropic briefing error:", err instanceof Error ? err.message : err);
      // fall through to next provider
    }
  }

  // ── Groq (free fallback) ───────────────────────────────────────────────────
  if (groqKey) {
    try {
      return await callOpenAICompat(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey, "llama-3.3-70b-versatile", prompt,
      );
    } catch (err) {
      console.error("Groq briefing error:", err instanceof Error ? err.message : err);
    }
  }

  // ── DeepSeek (fallback) ────────────────────────────────────────────────────
  if (deepseekKey) {
    try {
      return await callOpenAICompat(
        "https://api.deepseek.com/v1/chat/completions",
        deepseekKey, "deepseek-chat", prompt,
      );
    } catch (err) {
      console.error("DeepSeek briefing error:", err instanceof Error ? err.message : err);
    }
  }

  throw new Error("No AI provider configured. Add ANTHROPIC_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY.");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Q {
  price: number; prevClose: number; changePct: number;
  volume?: number; avgVol?: number; high52w?: number; low52w?: number;
  open?: number; high?: number; low?: number; name?: string;
}

async function yq(ticker: string): Promise<Q | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10d`;
    const r   = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
    const d   = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    const q    = d?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!meta?.regularMarketPrice) return null;
    const price     = meta.regularMarketPrice as number;
    const prevClose = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    return {
      price, prevClose,
      changePct:  prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      volume:     meta.regularMarketVolume,
      avgVol:     meta.averageDailyVolume10Day ?? meta.averageDailyVolume3Month,
      high52w:    meta.fiftyTwoWeekHigh,
      low52w:     meta.fiftyTwoWeekLow,
      open:       (q?.open  ?? []).filter(Boolean).at(-1),
      high:       (q?.high  ?? []).filter(Boolean).at(-1),
      low:        (q?.low   ?? []).filter(Boolean).at(-1),
      name:       meta.shortName ?? meta.longName,
    };
  } catch { return null; }
}

async function yNews(sym: string): Promise<string[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=3&quotesCount=0`;
    const r   = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(3000) });
    const d   = await r.json();
    return ((d?.news ?? []) as { title?: string; publisher?: string }[])
      .slice(0, 3).map(n => `${n.title ?? ""} (${n.publisher ?? ""})`);
  } catch { return []; }
}

async function batch<T>(items: T[], fn: (i: T) => Promise<unknown>, size = 10) {
  const out: unknown[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

function row(label: string, q: Q | null): string {
  if (!q) return `${label}: N/A`;
  const chg  = `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`;
  const vol  = q.volume && q.avgVol ? ` | Vol surge: ${(q.volume / q.avgVol).toFixed(1)}x` : "";
  const yr   = q.high52w && q.low52w ? ` | 52w: $${q.low52w.toFixed(0)}-$${q.high52w.toFixed(0)} (${(((q.price - q.low52w) / (q.high52w - q.low52w)) * 100).toFixed(0)}% of range)` : "";
  const zone = q.high && q.low ? ` | Zone: ${q.price > (q.high + q.low) / 2 ? "Premium" : "Discount"}` : "";
  return `${label}: $${q.price.toFixed(2)} (${chg})${vol}${yr}${zone}`;
}

function etSession(): string {
  const now = new Date();
  const etOff = now.getTimezoneOffset() < new Date(now.getFullYear(), 6, 1).getTimezoneOffset() ? -4 : -5;
  const et  = new Date(now.getTime() + (now.getTimezoneOffset() + etOff * 60) * 60_000);
  const h   = et.getHours();
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][et.getDay()];
  const dt  = et.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const session =
    h < 2  ? "Overnight / Pre-London" :
    h < 5  ? "London Open Kill Zone (2-5 AM ET)" :
    h < 8  ? "London Mid-Session" :
    h < 9  ? "Pre-Market (8-9:30 AM ET)" :
    h < 10 ? "NY Open Kill Zone (9:30-10:30 AM ET)" :
    h < 12 ? "London Close / NY AM" :
    h < 16 ? "NY Afternoon Session" :
             "After-Hours / Overnight";
  return `${day} ${dt} — ${session}`;
}

// ─── JSON repair ─────────────────────────────────────────────────────────────
// Handles truncated output by closing open arrays/objects and filling defaults.
function parseJSON(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { /* try repair */ }

  // Walk the string tracking bracket depth to find the last balanced close
  let depth = 0;
  let inStr  = false;
  let esc    = false;
  let lastZ  = 0; // last position where depth returned to 0

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc)        { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") { depth--; if (depth === 0) lastZ = i + 1; }
  }

  // Close any open structure by appending missing brackets
  const closers: string[] = [];
  let d2 = 0;
  let s2 = false; let e2 = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (e2)         { e2 = false; continue; }
    if (c === "\\" && s2) { e2 = true; continue; }
    if (c === '"')  { s2 = !s2; continue; }
    if (s2)         continue;
    if (c === "{")  { d2++; closers.push("}"); }
    if (c === "[")  { d2++; closers.push("]"); }
    if (c === "}" || c === "]") { d2--; closers.pop(); }
  }

  // First try: close open brackets
  const closed = raw + closers.reverse().join("");
  try { return JSON.parse(closed) as Record<string, unknown>; } catch { /* fall through */ }

  // Second try: use only the last fully-balanced slice
  if (lastZ > 0) {
    try { return JSON.parse(raw.slice(0, lastZ)) as Record<string, unknown>; } catch { /* fall through */ }
  }

  throw new Error(`JSON parse failed after repair attempt`);
}

// MDT = UTC-6 (Mar–Oct), MST = UTC-7 (Nov–Feb)
function mdtOffset(): number {
  const m = new Date().getUTCMonth(); // 0-indexed
  return (m >= 2 && m < 11) ? -6 : -7;
}
function mdtDate(): string {
  return new Date(Date.now() + mdtOffset() * 3_600_000).toISOString().slice(0, 10);
}
function mdtHour(): number {
  return new Date(Date.now() + mdtOffset() * 3_600_000).getUTCHours();
}
function inBriefingWindow(): boolean {
  const h = mdtHour();
  return h >= 6 && h < 7;
}

// ── Daily cache: in-memory (same Lambda) + /tmp file (same instance, faster cold start) ──
let memCache: { date: string; payload: Record<string, unknown> } | null = null;

async function readCache(date: string): Promise<Record<string, unknown> | null> {
  if (memCache?.date === date) return memCache.payload;
  try {
    const raw = await fs.readFile(path.join("/tmp", `briefing-${date}.json`), "utf-8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    memCache = { date, payload };
    return payload;
  } catch { return null; }
}

async function writeCache(date: string, payload: Record<string, unknown>): Promise<void> {
  memCache = { date, payload };
  try { await fs.writeFile(path.join("/tmp", `briefing-${date}.json`), JSON.stringify(payload)); } catch { /* ignore */ }
}

// ─── Main handler ────────────────────────────────────────────────────────────

type PortfolioSnapshot = {
  cash: number;
  holdingsCount: number;
  totalValue: number;
  holdings: { symbol: string; quantity: number; avgPrice: number }[];
  recentTradeCount: number;
};

async function handleBriefing(portfolio: PortfolioSnapshot | null): Promise<Response> {
  const today = mdtDate();

  // Always serve the cached briefing if it exists — no regeneration needed
  const cached = await readCache(today);
  if (cached) return Response.json({ ...cached, _cached: true });

  // No cache — only generate inside the 6–7 AM MDT window
  if (!inBriefingWindow()) {
    return Response.json(
      { ok: false, reason: "OUTSIDE_WINDOW", message: "Today's briefing isn't ready yet — it generates at 6 AM MDT and is then available all day." },
      { status: 403 },
    );
  }

  // Generate once, store, return
  return runBriefing(portfolio, today);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  if (!checkRateLimit(`briefing:${session.user.email}`, 3, 60_000)) {
    return Response.json({ error: "Rate limit — max 3 briefings per minute" }, { status: 429 });
  }
  let portfolio: PortfolioSnapshot | null = null;
  try { const body = await req.json(); portfolio = body.portfolio ?? null; } catch { /* no body */ }
  return handleBriefing(portfolio);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  if (!checkRateLimit(`briefing:${session.user.email}`, 3, 60_000)) {
    return Response.json({ error: "Rate limit — max 3 briefings per minute" }, { status: 429 });
  }
  return handleBriefing(null);
}

async function runBriefing(portfolio: PortfolioSnapshot | null, cacheDate?: string) {
  const tickers = {
    // Broad US
    SPY: "SPY", QQQ: "QQQ", IWM: "IWM", DIA: "DIA",
    // Volatility
    VIX: "%5EVIX", VXN: "%5EVXN",
    // Futures
    ES: "ES%3DF", NQ: "NQ%3DF", YM: "YM%3DF",
    // Sectors
    XLF: "XLF", XLK: "XLK", XLE: "XLE", XLV: "XLV",
    XLY: "XLY", XLP: "XLP", XLI: "XLI", XLC: "XLC",
    // Mega cap
    AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA", TSLA: "TSLA",
    AMZN: "AMZN", GOOGL: "GOOGL", META: "META", JPM: "JPM",
    // Commodities
    GOLD: "GC%3DF", SILVER: "SI%3DF", OIL: "CL%3DF", NATGAS: "NG%3DF",
    // Forex
    EURUSD: "EURUSD%3DX", USDJPY: "USDJPY%3DX", GBPUSD: "GBPUSD%3DX", DXY: "DX-Y.NYB",
    // Fixed Income
    TNX: "%5ETNX", TYX: "%5ETYX", IRX: "%5EIRX",
    // Crypto
    BTC: "BTC-USD", ETH: "ETH-USD",
    // International
    EEM: "EEM", EFA: "EFA",
  };

  // Fetch all quotes in parallel batches
  const keys   = Object.keys(tickers) as Array<keyof typeof tickers>;
  const values = await batch(keys, (k) => yq(tickers[k]));
  const data: Record<string, Q | null> = {};
  keys.forEach((k, i) => { data[k] = values[i] as Q | null; });

  // Top movers by absolute % change — fetch news for them
  const movers = keys
    .filter(k => data[k])
    .sort((a, b) => Math.abs((data[b]?.changePct ?? 0)) - Math.abs((data[a]?.changePct ?? 0)))
    .slice(0, 8);
  const newsMap: Record<string, string[]> = {};
  await Promise.all(movers.map(async k => {
    newsMap[k] = await yNews(tickers[k].replace(/%3DF|%5E|%3DX/g, "=").replace("DX-Y.NYB", "DXY"));
  }));

  // Regime detection
  const spyUp  = (data.SPY?.changePct ?? 0) > 0;
  const qqqUp  = (data.QQQ?.changePct ?? 0) > 0;
  const vix    = data.VIX?.price ?? null;
  const regime = spyUp && qqqUp ? "Risk-ON" : !spyUp && !qqqUp ? "Risk-OFF" : "Mixed / Rotation";

  // Build data block for Claude
  const dataBlock = `
=== LIVE MARKET DATA (${etSession()}) ===

US BROAD MARKET:
${row("SPY (S&P 500 ETF)",     data.SPY)}
${row("QQQ (Nasdaq-100 ETF)",  data.QQQ)}
${row("IWM (Russell 2000)",    data.IWM)}
${row("DIA (Dow Jones ETF)",   data.DIA)}

VOLATILITY:
${row("VIX Fear Index",  data.VIX)} ${vix ? `→ ${vix < 15 ? "Extreme complacency" : vix < 20 ? "Low fear" : vix < 25 ? "Moderate fear" : vix < 30 ? "Elevated fear" : "PANIC / extreme fear"}` : ""}
${row("VXN (Nasdaq Vol)", data.VXN)}

FUTURES:
${row("ES (E-mini S&P 500)", data.ES)}
${row("NQ (E-mini Nasdaq)",  data.NQ)}
${row("YM (E-mini Dow)",     data.YM)}

SECTORS:
${row("XLF Financial",   data.XLF)} | ${row("XLK Technology",  data.XLK)}
${row("XLE Energy",      data.XLE)} | ${row("XLV Healthcare",  data.XLV)}
${row("XLY Consumer Disc",data.XLY)}| ${row("XLP Consumer Stap",data.XLP)}
${row("XLI Industrial",  data.XLI)} | ${row("XLC Comms",        data.XLC)}

MEGA-CAP EQUITIES:
${row("AAPL", data.AAPL)} | ${row("MSFT", data.MSFT)}
${row("NVDA", data.NVDA)} | ${row("TSLA", data.TSLA)}
${row("AMZN", data.AMZN)} | ${row("GOOGL",data.GOOGL)}
${row("META", data.META)} | ${row("JPM",  data.JPM)}

COMMODITIES:
${row("Gold (GC futures)",   data.GOLD)}
${row("Silver (SI futures)", data.SILVER)}
${row("Crude Oil (CL futures)",data.OIL)}
${row("Natural Gas (NG)",    data.NATGAS)}

FOREX & DOLLAR:
${row("EUR/USD", data.EURUSD)} | ${row("USD/JPY", data.USDJPY)}
${row("GBP/USD", data.GBPUSD)} | ${row("DXY (Dollar Index)", data.DXY)}

FIXED INCOME (YIELDS):
${row("10-Year Treasury Yield (TNX)", data.TNX)}
${row("30-Year Treasury Yield (TYX)", data.TYX)}
${row("3-Month T-Bill (IRX)",         data.IRX)}

CRYPTO:
${row("Bitcoin (BTC)",  data.BTC)}
${row("Ethereum (ETH)", data.ETH)}

INTERNATIONAL:
${row("EEM (Emerging Markets)", data.EEM)}
${row("EFA (International Developed)", data.EFA)}

CURRENT REGIME: ${regime}

=== BREAKING NEWS (top movers) ===
${movers.map(k => newsMap[k]?.length ? `${k}:\n${newsMap[k].map(h => `  • ${h}`).join("\n")}` : "").filter(Boolean).join("\n\n")}
`;

  const portfolioBlock = portfolio
    ? `═══════════════════════════════════════════════════════════
USER PORTFOLIO SNAPSHOT (paper trading account)
═══════════════════════════════════════════════════════════
Cash available: $${portfolio.cash.toFixed(2)}
Total account value: $${portfolio.totalValue.toFixed(2)}
Open positions (${portfolio.holdingsCount}):${
  portfolio.holdings.length
    ? "\n" + portfolio.holdings.map(h => `  • ${h.symbol}: ${h.quantity} shares @ $${h.avgPrice.toFixed(2)} avg`).join("\n")
    : " none"
}
Recent activity: ${portfolio.recentTradeCount} trades logged

When discussing opportunities, note which (if any) align with the user's existing positions. If they are already in a winner, suggest how to manage it today. If they are overexposed or in a losing position, flag it as a risk.

`
    : "";

  const prompt = `You are an institutional-level market analyst, quantitative researcher, smart money concepts specialist, macroeconomic analyst, options strategist, futures trader, portfolio manager, and risk manager operating as the core intelligence engine of Traxora AI.

═══════════════════════════════════════════════════════════
ROLE & FULL CAPABILITY FRAMEWORK
═══════════════════════════════════════════════════════════

PAPER TRADING SIMULATION MODE
For every trade idea provide:
• Entry price (derived from live data)
• Stop loss (with structural reason — swing low, OB, FVG)
• Profit targets (T1 liquidity sweep, T2 structural target)
• Position sizing example (1% account risk at given stop distance)
• Risk/reward ratio
• Trade management scenario (how to handle partial fills, trail stops, add-ons)
• Expected intraday volatility impact
Treat every recommendation as if it affects a real paper-trading account with real consequences.

OPTIONS TRADING INTELLIGENCE (HIGHEST PRIORITY)
Options are the primary trading vehicle. For every options opportunity analyze:
• Directional bias (based on price action and market structure)
• Implied volatility environment and VIX context
• IV Rank and IV Percentile interpretation
• Gamma exposure — near-term expiries vs far-dated
• Open interest concentration at key strikes
• Unusual options flow and volume spikes (infer from news/momentum context)
• Expiration selection (weekly, monthly, LEAPS)
• Strike selection (ATM, OTM, spread construction)
• Probability of profit assessment
• Risk of total premium loss scenario
• Earnings and event risk evaluation
Explain WHY a call, put, debit spread, or credit spread is preferred. If setup quality is poor, explicitly recommend staying out.

FUTURES ANALYSIS
For futures opportunities analyze trend, liquidity zones, volume context, institutional positioning inference, volatility conditions, and session behavior. Always highlight leverage risk specific to futures.

CROSS-ASSET OPPORTUNITY DISCOVERY (HIGHEST PRIORITY)
Perform a comprehensive market scan covering:
Equities: Large/mid/small-cap, high-growth, value, sector leaders, high-RS stocks, unusual movers
Options: Calls, puts, debit spreads, credit spreads, earnings trades, swing/momentum setups
Futures: Equity index (ES/NQ/YM), Gold, Silver, Oil, NatGas, Treasury futures
ETFs: Broad market, sector, commodity, bond, international
Fixed Income: Treasury bonds, corporates, yield opportunities, rate-sensitive assets
Commodities: Gold, Silver, Copper, Oil, NatGas, industrial metals, agricultural products
Key Growth Themes: AI, Semiconductors, Aviation, Aerospace & Defense, EVs, Energy, Precious Metals, Infrastructure, Robotics, Quantum Computing, Biotech, Cybersecurity, Cloud Computing

NEWS MONITORING & EVENT ALERTS
Monitor for FOMC, CPI, PPI, NFP, GDP, major earnings, geopolitical developments, central bank announcements, significant options flow, and market-moving headlines. For approaching events provide: expected release time, market expectations, potential bullish/bearish reactions, historical volatility patterns, and risk warnings.

═══════════════════════════════════════════════════════════
ANALYTICAL METHODOLOGY
═══════════════════════════════════════════════════════════

SMART MONEY FRAMEWORK (apply to every instrument):
• Market Structure: HH/HL (bullish) vs LH/LL (bearish) across timeframes
• Liquidity Sweeps: Buy-side (BSL) above swing highs, Sell-side (SSL) below swing lows
• Fair Value Gaps (FVG): Price imbalances that act as magnets
• Order Blocks (OB): Last opposing candle before impulse move
• Breaker Blocks: Failed OBs that flip polarity
• Premium & Discount Arrays: Price above/below 50% equilibrium of dealing range
• Daily/Weekly/Monthly liquidity targets
• SMT Divergence: Correlated instruments diverging (SPY vs QQQ, Gold vs DXY)
• OTE: Optimal Trade Entry at 62%–79% Fibonacci retracement
• Kill Zones: London (2–5 AM ET), NY Open (9:30–10:30 AM ET), London Close (10 AM–12 PM ET)
• Multi-timeframe: Monthly → Weekly → Daily → 4H → 1H cascade
• Power of 3 (PO3): Accumulation → Manipulation → Distribution
• Intermarket: Bonds vs equities, DXY vs Gold/Oil, VIX vs SPY

OPPORTUNITY RANKING SYSTEM
For each opportunity provide:
• Asset name, sector, current trend, primary catalyst, time horizon
• Evidence review: price action, technical structure, market sentiment, institutional positioning inference, analyst revision trends, earnings context, macro impact, news flow, options flow inference, volume behavior, relative strength, volatility conditions
• Clearly label: FACT | PROBABILITY | ASSUMPTION | SPECULATION

OPTIONS TRADE CONSTRUCTION
When an options opportunity appears attractive provide:
• Direction (Bullish/Bearish/Neutral) and timing (enter now / wait for pullback / wait for confirmation / key trigger price)
• Contract selection: strike prices, expiration dates, risk level, probability assessment
• Trade plan: entry zone, stop/risk limit, profit targets, position management, max acceptable loss
• Event analysis: earnings, economic releases, Fed events, major catalysts and their expected effect

LONG-TERM INVESTMENT ANALYSIS
For longer-horizon opportunities: thesis (why outperform, growth drivers, competitive advantages, industry outlook), risks (economic/industry/company-specific/valuation), investment horizon (3M/6M/12M/multi-year), suggested strategy (buy now / scale in / wait for pullback / avoid).

═══════════════════════════════════════════════════════════
IMPORTANT RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════
1. Capital preservation comes first. Protect capital; seek profits second.
2. Never promise profits. Never claim certainty.
3. Confidence scores represent probabilities, not guarantees.
4. If data quality is insufficient, say so clearly.
5. If risk is unusually high, recommend waiting or reducing size.
6. If setup quality is poor, explicitly recommend staying out.
7. Every recommendation must be supported by evidence from the live data provided.
8. Clearly separate: FACTS | PROBABILITIES | ASSUMPTIONS | SPECULATION
9. Avoid unnecessary speculation — label it when you must include it.

═══════════════════════════════════════════════════════════
LIVE MARKET DATA
═══════════════════════════════════════════════════════════

${dataBlock}
${portfolioBlock}

═══════════════════════════════════════════════════════════
TODAY'S ANALYSIS TASK — DAILY MORNING BRIEFING
═══════════════════════════════════════════════════════════

Using the live data above, produce the full institutional morning briefing covering:
1. Market regime and macro outlook (bullish/bearish factors, key risks)
2. Major news developments and their potential market impact
3. Smart Money analysis (bias, kill zones, liquidity targets, FVG, OB, SMT, MM phase)
4. Cross-asset scan — identify the 10 highest-probability opportunities across ALL asset classes (equities, options, futures, ETFs, commodities, crypto, forex, fixed income)
5. Critical price levels for SPY, QQQ, and Gold (support, resistance, FVG, OB)
6. Economic calendar — real upcoming events this week
7. Options opportunities with full construction details
8. Futures opportunities with leverage risk warnings
9. Risk warnings — events that could invalidate current assumptions
10. Position sizing guidance based on current VIX

OPPORTUNITY RANKING CRITERIA (rank strictly by this order):
• Setup quality and technical alignment
• Risk/reward ratio (minimum 2:1 preferred)
• Confidence level (based on data evidence)
• Time sensitivity
• Cross-asset confirmation (multiple instruments agreeing)

OUTPUT FORMAT — Respond ONLY in valid JSON. No text, markdown, or explanation outside the JSON object:

{
  "session": "string — current ET session description",
  "regime": "Risk-ON | Risk-OFF | Mixed",
  "regimeColor": "bullish | bearish | mixed",
  "regimeDetail": "string — 1 sentence explaining the regime",
  "vixReading": "string — VIX interpretation and position sizing implication",

  "marketOutlook": {
    "summary": "string — 2-3 sentence institutional macro overview",
    "bullishFactors": ["string", "string", "string"],
    "bearishFactors": ["string", "string", "string"],
    "keyRisks": ["string", "string"]
  },

  "ictAnalysis": {
    "bias": "Bullish | Bearish | Neutral",
    "killZone": "string — which Kill Zone to prioritize today and why",
    "priceZone": "string — SPY premium/discount position with equilibrium price",
    "liquidityAbove": "string — nearest BSL level on SPY with price",
    "liquidityBelow": "string — nearest SSL level on SPY with price",
    "keyFVG": "string or null — price range of key Fair Value Gap",
    "keyOrderBlock": "string or null — price range of key Order Block",
    "sectorLeaders": ["string", "string"],
    "sectorLaggers": ["string", "string"],
    "smtDivergence": "string or null — any SPY vs QQQ or IWM divergence",
    "marketMakerModel": "string — current MM phase: Accumulation | Manipulation | Distribution and why"
  },

  "opportunities": [
    {
      "rank": 1,
      "asset": "TICKER",
      "name": "Full Asset Name",
      "type": "Stock | Options | Futures | ETF | Crypto | Forex | Commodity",
      "sector": "string",
      "trend": "Bullish | Bearish | Ranging",
      "timeHorizon": "Intraday | 1-3 days | 1-2 weeks | 1+ month",
      "thesis": "string — clear 1-2 sentence thesis with market structure rationale",
      "bullCase": "string — specific bull scenario with price target",
      "bearCase": "string — specific bear scenario with invalidation level",
      "catalyst": "string — primary catalyst driving this setup",
      "ictSetup": "string — specific setup (e.g. 'Bullish FVG fill at Order Block in Discount zone during NY session')",
      "entryZone": "string — specific price range for entry",
      "stopLoss": "string — price level + structural reason (e.g. 'Below $XXX OB low')",
      "target1": "string — first liquidity target with price",
      "target2": "string or null — second structural target with price",
      "rrRatio": "string e.g. 3.2:1",
      "riskLevel": "Low | Medium | High | Very High",
      "confidence": 72,
      "optionsPlay": "string or null — e.g. 'Buy ATM call, ~30 DTE, risk = premium paid; avoid if IV rank >70'",
      "expectedVolatility": "string — expected price range or ATR context",
      "keyRisk": "string — the single biggest risk that could invalidate this trade",
      "facts": ["string — FACT from live data"],
      "probabilities": ["string — PROBABILITY based on market structure"],
      "speculative": "string or null — any SPECULATION clearly labeled"
    }
  ],

  "economicCalendar": [
    {
      "time": "string e.g. 8:30 AM ET",
      "event": "string — event name",
      "importance": "High | Medium | Low",
      "expectedImpact": "string — potential bullish/bearish market reaction"
    }
  ],

  "keyLevels": {
    "SPY":  { "support": ["string"], "resistance": ["string"], "fvg": "string or null", "orderBlock": "string or null" },
    "QQQ":  { "support": ["string"], "resistance": ["string"], "fvg": "string or null", "orderBlock": "string or null" },
    "Gold": { "support": ["string"], "resistance": ["string"], "notes": "string" }
  },

  "riskWarnings": ["string", "string", "string"],
  "positionSizingNote": "string — specific VIX-based sizing guidance (e.g. 'VIX at 18 = normal sizing; reduce to 50% above VIX 25')",
  "overallConfidence": 68
}

FINAL CHECKS before responding:
• Exactly 10 opportunities ranked by conviction.
• Every price level must be derived from the live data provided above.
• Options plays must include direction, structure type, DTE concept, and IV warning if VIX is elevated.
• Futures plays must include session timing and leverage risk warning.
• Economic calendar reflects real events this week (use your training knowledge of typical scheduled releases).
• facts[] arrays contain only verified data from the feed. probabilities[] contain structure-based inferences. speculative field is null unless truly needed.
• The JSON must be complete and valid — do not truncate.`;

  try {
    const text = await callAI(prompt);

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    const parsed = parseJSON(match[0]);

    const payload: Record<string, unknown> = {
      ...parsed,
      _raw: {
        session: etSession(),
        regime,
        data: {
          vix:       data.VIX?.price  ?? null,
          spy:       data.SPY?.price  ?? null,  spyChg:  data.SPY?.changePct  ?? null,
          qqq:       data.QQQ?.price  ?? null,  qqqChg:  data.QQQ?.changePct  ?? null,
          iwm:       data.IWM?.price  ?? null,  iwmChg:  data.IWM?.changePct  ?? null,
          es:        data.ES?.price   ?? null,  esChg:   data.ES?.changePct   ?? null,
          gold:      data.GOLD?.price ?? null,  goldChg: data.GOLD?.changePct ?? null,
          silver:    data.SILVER?.price ?? null,silverChg:data.SILVER?.changePct ?? null,
          oil:       data.OIL?.price  ?? null,  oilChg:  data.OIL?.changePct  ?? null,
          btc:       data.BTC?.price  ?? null,  btcChg:  data.BTC?.changePct  ?? null,
          tnx:       data.TNX?.price  ?? null,  tnxChg:  data.TNX?.changePct  ?? null,
          dxy:       data.DXY?.price  ?? null,  dxyChg:  data.DXY?.changePct  ?? null,
          eurusd:    data.EURUSD?.price ?? null, eurChg: data.EURUSD?.changePct ?? null,
          xlk:       data.XLK?.changePct ?? null,
          xlf:       data.XLF?.changePct ?? null,
          xle:       data.XLE?.changePct ?? null,
          xlv:       data.XLV?.changePct ?? null,
        },
      },
    };

    // Store once for the whole day
    if (cacheDate) await writeCache(cacheDate, payload);

    return Response.json(payload);
  } catch (err) {
    const httpStatus = (err as { status?: unknown }).status;
    if (httpStatus === 401 || httpStatus === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return Response.json(
      { error: `Briefing failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
