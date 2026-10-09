import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { promises as fs } from "fs";
import path from "path";

import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";

export const runtime     = "nodejs";
export const maxDuration = 55;

async function callOpenAICompat(url: string, key: string, model: string, prompt: string, timeoutMs = 25_000): Promise<string> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty response");
  return text;
}

async function callAI(prompt: string): Promise<string> {
  const groqKey      = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;

  if (!groqKey && !anthropicKey && !deepseekKey) {
    throw new Error("No AI provider configured. Add ANTHROPIC_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY.");
  }

  const failures: string[] = [];

  // ── Gemini (free tier — 1M TPM, no billing required) ─────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      return await callOpenAICompat(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        geminiKey, "gemini-2.0-flash", prompt, 40_000,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Gemini briefing error:", msg);
      failures.push(`Gemini: ${msg}`);
    }
  }

  // ── Groq (free tier — 12k TPM 70B, 30k TPM 8B) ───────────────────────────
  if (groqKey) {
    const groqModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] as const;
    for (const model of groqModels) {
      try {
        return await callOpenAICompat(
          "https://api.groq.com/openai/v1/chat/completions",
          groqKey, model, prompt, 20_000,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTokenLimit = msg.includes("413") || msg.includes("rate_limit_exceeded") || msg.includes("tokens per minute");
        console.error(`Groq ${model} error:`, msg);
        if (isTokenLimit && model !== "llama-3.1-8b-instant") continue;
        failures.push(`Groq: ${msg}`);
        break;
      }
    }
  }

  // ── Anthropic (primary fallback — higher quality, ~30-45s for large JSON) ──
  // Timeout bumped to 45s: haiku generating 8k tokens of dense JSON needs it.
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await Promise.race([
        client.messages.create({
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system:     SYSTEM_FRAMEWORK,
          messages:   [{ role: "user", content: prompt }],
        }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 45_000)),
      ]);
      return res.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("").trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Anthropic briefing error:", msg);
      failures.push(`Anthropic: ${msg}`);
    }
  }

  // ── DeepSeek (last resort) ─────────────────────────────────────────────────
  if (deepseekKey) {
    try {
      return await callOpenAICompat(
        "https://api.deepseek.com/v1/chat/completions",
        deepseekKey, "deepseek-chat", prompt, 20_000,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("DeepSeek briefing error:", msg);
      failures.push(`DeepSeek: ${msg}`);
    }
  }

  throw new Error(`All AI providers failed — ${failures.join(" | ")}`);
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

function isEDT(utcDate: Date): boolean {
  const y = utcDate.getUTCFullYear();
  const march1 = new Date(Date.UTC(y, 2, 1));
  const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - march1.getUTCDay()) % 7) + 7, 7, 0, 0));
  const nov1 = new Date(Date.UTC(y, 10, 1));
  const dstEnd = new Date(Date.UTC(y, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6, 0, 0));
  return utcDate >= dstStart && utcDate < dstEnd;
}

function etSession(): string {
  const now = new Date();
  const etOff = isEDT(now) ? -4 : -5;
  const et  = new Date(now.getTime() + etOff * 3_600_000);
  const h   = et.getUTCHours();
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][et.getUTCDay()];
  const dt  = et.toISOString().slice(0, 10);
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
// ── Daily cache: in-memory (same Lambda) + /tmp file (same instance, faster cold start) ──
let memCache: { date: string; payload: Record<string, unknown> } | null = null;

async function readCache(date: string): Promise<Record<string, unknown> | null> {
  if (memCache?.date === date) return memCache.payload;
  try {
    const raw = await fs.readFile(path.join("/tmp", `briefing-v2-${date}.json`), "utf-8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    memCache = { date, payload };
    return payload;
  } catch { return null; }
}

async function writeCache(date: string, payload: Record<string, unknown>): Promise<void> {
  memCache = { date, payload };
  try { await fs.writeFile(path.join("/tmp", `briefing-v2-${date}.json`), JSON.stringify(payload)); } catch { /* ignore */ }
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

  // Return cached briefing instantly — no re-generation
  const cached = await readCache(today);
  if (cached) return Response.json({ ...cached, _cached: true });

  // First request of the day — generate, cache, return
  return runBriefing(portfolio, today);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, reason: "UNAUTHORIZED", error: "Sign in to use AI features.", signIn: true }, { status: 401 });
  if (!checkRateLimit(`briefing:${session.user.email}`, 3, 60_000)) {
    return Response.json({ error: "Rate limit — max 3 briefings per minute" }, { status: 429 });
  }
  let portfolio: PortfolioSnapshot | null = null;
  try { const body = await req.json(); portfolio = body.portfolio ?? null; } catch { /* no body */ }
  return handleBriefing(portfolio);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, reason: "UNAUTHORIZED", error: "Sign in to use AI features.", signIn: true }, { status: 401 });
  if (!checkRateLimit(`briefing:${session.user.email}`, 3, 60_000)) {
    return Response.json({ error: "Rate limit — max 3 briefings per minute" }, { status: 429 });
  }
  return handleBriefing(null);
}

async function runBriefing(portfolio: PortfolioSnapshot | null, cacheDate?: string) {
  const tickers = {
    // Broad US
    SPY: "SPY", QQQ: "QQQ", IWM: "IWM", DIA: "DIA",
    // Volatility — raw Yahoo symbols; encodeURIComponent in yq() handles encoding
    VIX: "^VIX", VXN: "^VXN",
    // Futures
    ES: "ES=F", NQ: "NQ=F", YM: "YM=F",
    // Sectors
    XLF: "XLF", XLK: "XLK", XLE: "XLE", XLV: "XLV",
    XLY: "XLY", XLP: "XLP", XLI: "XLI", XLC: "XLC",
    // Mega cap
    AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA", TSLA: "TSLA",
    AMZN: "AMZN", GOOGL: "GOOGL", META: "META", JPM: "JPM",
    // Commodities
    GOLD: "GC=F", SILVER: "SI=F", OIL: "CL=F", NATGAS: "NG=F",
    // Forex
    EURUSD: "EURUSD=X", USDJPY: "USDJPY=X", GBPUSD: "GBPUSD=X", DXY: "DX-Y.NYB",
    // Fixed Income
    TNX: "^TNX", TYX: "^TYX", IRX: "^IRX",
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
    newsMap[k] = await yNews(tickers[k].replace("DX-Y.NYB", "DXY").replace(/^\^/, "").replace(/=[A-Z]$/, ""));
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

  const prompt = `Institutional AI analyst for Traxora AI. Apply Smart Money methodology (OB, FVG, liquidity sweeps, market structure, Kill Zones, PO3). Capital preservation first. Label facts vs probabilities. Derive all prices from live data only.

LIVE MARKET DATA:
${dataBlock}
${portfolioBlock}
Return ONLY valid JSON — no markdown, no text outside the object:
{"session":"ET session name","regime":"Risk-ON|Risk-OFF|Mixed","regimeColor":"bullish|bearish|mixed","regimeDetail":"1 sentence","vixReading":"VIX reading and position sizing note","marketOutlook":{"summary":"2-3 sentence macro overview","bullishFactors":["f1","f2","f3"],"bearishFactors":["f1","f2","f3"],"keyRisks":["r1","r2"]},"marketAnalysis":{"bias":"Bullish|Bearish|Neutral","killZone":"which kill zone today and why","priceZone":"SPY premium/discount and equilibrium","liquidityAbove":"nearest BSL with price","liquidityBelow":"nearest SSL with price","keyFVG":"FVG range or null","keyOrderBlock":"OB range or null","sectorLeaders":["s1","s2"],"sectorLaggers":["s1","s2"],"smtDivergence":"divergence or null","marketMakerModel":"Accumulation|Manipulation|Distribution — reason"},"opportunities":[{"rank":1,"asset":"TICKER","name":"Full Name","type":"Stock|Options|Futures|ETF|Crypto|Forex|Commodity","sector":"sector","trend":"Bullish|Bearish|Ranging","timeHorizon":"Intraday|1-3 days|1-2 weeks|1+ month","thesis":"1-2 sentence thesis","bullCase":"bull scenario with target","bearCase":"bear scenario with invalidation","catalyst":"primary catalyst","setupNote":"specific Smart Money setup","entryZone":"price range","stopLoss":"price + structural reason","target1":"first target","target2":"second target or null","rrRatio":"3.2:1","riskLevel":"Low|Medium|High|Very High","confidence":72,"optionsPlay":"options play or null","expectedVolatility":"ATR context","keyRisk":"biggest invalidation risk","facts":["FACT from data"],"probabilities":["PROBABILITY from structure"],"speculative":null}],"economicCalendar":[{"time":"8:30 AM ET","event":"event name","importance":"High|Medium|Low","expectedImpact":"bullish/bearish impact"}],"keyLevels":{"SPY":{"support":["price"],"resistance":["price"],"fvg":"range or null","orderBlock":"range or null"},"QQQ":{"support":["price"],"resistance":["price"],"fvg":"range or null","orderBlock":"range or null"},"Gold":{"support":["price"],"resistance":["price"],"notes":"notes"}},"riskWarnings":["w1","w2","w3"],"positionSizingNote":"VIX-based sizing guidance","overallConfidence":68,"topOptionsPlays":[{"rank":1,"symbol":"TICKER","name":"Company Name","direction":"Calls|Puts","strike":"$290 ATM","expiry":"Jun 20 (16 DTE)","dte":16,"entryTrigger":"condition to enter","entryPrice":"current price","stopCondition":"invalidation","target":"price target","maxRisk":"~$X00/contract","riskRating":"Low|Medium|High|Extreme","dteRisk":"theta decay warning","ivContext":"IV context","confidence":72,"thesis":"1-2 sentence thesis","hardGates":"PASS|FAIL — reason if FAIL"}],"topFuturesPlays":[{"rank":1,"contract":"ES|NQ|GC|CL|SI|YM|RTY","name":"Contract Name","direction":"Long|Short","entryZone":"price range","stopLoss":"price + reason","target1":"first target","target2":"second or null","rrRatio":"3.2:1","sessionTiming":"kill zone timing","pointValue":"$50/pt for ES","riskPerContract":"$X00 risk per contract","microContract":"Use MES ($5/pt)","leverageWarning":"leverage risk warning","riskRating":"Low|Medium|High|Extreme","confidence":70,"thesis":"1-2 sentence thesis","keyLevel":"key price level"}]}

RULES: exactly 5 opportunities, 3 topOptionsPlays, 3 topFuturesPlays. All prices from live data. Options HARD GATE: if DTE≤7 and OTM>1% set riskRating=Extreme, hardGates=FAIL. Futures: always include microContract and riskPerContract. Valid complete JSON only.`;

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
