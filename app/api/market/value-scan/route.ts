import { viewer } from "@/app/lib/viewer";
import { computeChangePct, resolvePreviousClose } from "@/app/lib/quoteSanity";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;


// ── Types ─────────────────────────────────────────────────────────────────────

export type ValueStock = {
  symbol:    string;
  name:      string;
  price:     number | null;
  changePct: number | null;
  pe:        number | null;
  forwardPe: number | null;
  pb:        number | null;
  divYield:  number | null;   // percent e.g. 6.5
  marketCap: number | null;   // billions USD
  sector:    string | null;
  score:     number;
  isDip:     boolean;
};

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreStock(s: ValueStock): number {
  let sc = 0;
  if (s.pe        !== null && s.pe > 0)        { if (s.pe < 10) sc += 3; else if (s.pe < 15) sc += 2; else if (s.pe < 20) sc += 1; }
  if (s.forwardPe !== null && s.forwardPe > 0) { if (s.forwardPe < 12) sc += 2; else if (s.forwardPe < 17) sc += 1; }
  if (s.pb        !== null && s.pb > 0)        { if (s.pb < 1) sc += 2; else if (s.pb < 2) sc += 1; }
  if (s.divYield  !== null)                    { if (s.divYield >= 5) sc += 2; else if (s.divYield >= 3) sc += 1; }
  return Math.min(sc, 10);
}

// ── Universe ──────────────────────────────────────────────────────────────────
// Same pattern as the options scan: a fixed liquid large-cap universe screened
// with our own data and scoring — no third-party screener endpoints (Yahoo
// blocks datacenter IPs; the EODHD screener is a paid add-on).

const UNIVERSE: Array<{ symbol: string; name: string; sector: string }> = [
  { symbol: "AAPL",  name: "Apple",              sector: "Technology" },
  { symbol: "MSFT",  name: "Microsoft",          sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet",           sector: "Communication" },
  { symbol: "META",  name: "Meta Platforms",     sector: "Communication" },
  { symbol: "INTC",  name: "Intel",              sector: "Technology" },
  { symbol: "CSCO",  name: "Cisco",              sector: "Technology" },
  { symbol: "IBM",   name: "IBM",                sector: "Technology" },
  { symbol: "QCOM",  name: "Qualcomm",           sector: "Technology" },
  { symbol: "MU",    name: "Micron",             sector: "Technology" },
  { symbol: "JPM",   name: "JPMorgan Chase",     sector: "Financials" },
  { symbol: "BAC",   name: "Bank of America",    sector: "Financials" },
  { symbol: "WFC",   name: "Wells Fargo",        sector: "Financials" },
  { symbol: "C",     name: "Citigroup",          sector: "Financials" },
  { symbol: "GS",    name: "Goldman Sachs",      sector: "Financials" },
  { symbol: "MS",    name: "Morgan Stanley",     sector: "Financials" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials" },
  { symbol: "UNH",   name: "UnitedHealth",       sector: "Healthcare" },
  { symbol: "JNJ",   name: "Johnson & Johnson",  sector: "Healthcare" },
  { symbol: "PFE",   name: "Pfizer",             sector: "Healthcare" },
  { symbol: "MRK",   name: "Merck",              sector: "Healthcare" },
  { symbol: "BMY",   name: "Bristol-Myers",      sector: "Healthcare" },
  { symbol: "CVS",   name: "CVS Health",         sector: "Healthcare" },
  { symbol: "XOM",   name: "Exxon Mobil",        sector: "Energy" },
  { symbol: "CVX",   name: "Chevron",            sector: "Energy" },
  { symbol: "COP",   name: "ConocoPhillips",     sector: "Energy" },
  { symbol: "OXY",   name: "Occidental",         sector: "Energy" },
  { symbol: "T",     name: "AT&T",               sector: "Communication" },
  { symbol: "VZ",    name: "Verizon",            sector: "Communication" },
  { symbol: "CMCSA", name: "Comcast",            sector: "Communication" },
  { symbol: "DIS",   name: "Disney",             sector: "Communication" },
  { symbol: "KO",    name: "Coca-Cola",          sector: "Staples" },
  { symbol: "PEP",   name: "PepsiCo",            sector: "Staples" },
  { symbol: "PG",    name: "Procter & Gamble",   sector: "Staples" },
  { symbol: "MO",    name: "Altria",             sector: "Staples" },
  { symbol: "KHC",   name: "Kraft Heinz",        sector: "Staples" },
  { symbol: "TGT",   name: "Target",             sector: "Retail" },
  { symbol: "F",     name: "Ford",               sector: "Autos" },
  { symbol: "GM",    name: "General Motors",     sector: "Autos" },
  { symbol: "CAT",   name: "Caterpillar",        sector: "Industrials" },
  { symbol: "DE",    name: "Deere",              sector: "Industrials" },
  { symbol: "MMM",   name: "3M",                 sector: "Industrials" },
  { symbol: "DOW",   name: "Dow",                sector: "Materials" },
];

// ── Per-symbol data ───────────────────────────────────────────────────────────

async function finnhubMetrics(symbol: string, key: string) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json() as { metric?: Record<string, number | null> };
    const m = data.metric ?? {};
    const num = (k: string) => (typeof m[k] === "number" && isFinite(m[k] as number) ? (m[k] as number) : null);
    return {
      pe:        num("peTTM") ?? num("peBasicExclExtraTTM"),
      forwardPe: num("forwardPE") ?? null,
      pb:        num("pbQuarterly") ?? num("pb"),
      divYield:  num("currentDividendYieldTTM") ?? num("dividendYieldIndicatedAnnual"),
      marketCap: num("marketCapitalization"), // Finnhub returns $M
    };
  } catch { return null; }
}

async function yahooQuote(symbol: string) {
  try {
    const ySym = symbol.replace(".", "-"); // BRK.B → BRK-B
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{
        meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number };
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }> };
    };
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice ?? null;
    // Previous SESSION close from the daily series. This read only
    // meta.chartPreviousClose, which is the close before the range's first bar
    // rather than the prior session, and had no other source to fall back to.
    const prev  = resolvePreviousClose(meta, result?.indicators?.quote?.[0]?.close ?? []);
    return {
      price,
      changePct: price != null ? computeChangePct(price, prev) : null,
    };
  } catch { return null; }
}

// ── Cache — fundamentals change slowly; don't re-hit Finnhub every page load ──

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;

  const results = await Promise.all(UNIVERSE.map(async (u) => {
    const [metrics, quote] = await Promise.all([
      finnhubKey ? finnhubMetrics(u.symbol, finnhubKey) : Promise.resolve(null),
      yahooQuote(u.symbol),
    ]);
    if (!metrics && !quote) return null;
    const s: ValueStock = {
      symbol:    u.symbol,
      name:      u.name,
      sector:    u.sector,
      price:     quote?.price ?? null,
      changePct: quote?.changePct != null ? parseFloat(quote.changePct.toFixed(2)) : null,
      pe:        metrics?.pe        != null ? parseFloat(metrics.pe.toFixed(1))        : null,
      forwardPe: metrics?.forwardPe != null ? parseFloat(metrics.forwardPe.toFixed(1)) : null,
      pb:        metrics?.pb        != null ? parseFloat(metrics.pb.toFixed(1))        : null,
      divYield:  metrics?.divYield  != null ? parseFloat(metrics.divYield.toFixed(2))  : null,
      marketCap: metrics?.marketCap != null ? parseFloat((metrics.marketCap / 1000).toFixed(1)) : null,
      score:     0,
      isDip:     false,
    };
    s.score = scoreStock(s);
    s.isDip = s.changePct != null && s.changePct <= -3;
    return s;
  }));

  const scanned = results.filter((s): s is ValueStock => s !== null);

  // Value picks: cheap on fundamentals, ranked by score
  const valuePicks = scanned
    .filter(s => s.score >= 3 && s.pe !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  // Dips: quality names having a bad day — a dip is only a "buy" when the
  // stock also screens as value. A stock that's both undervalued AND dipping
  // belongs here first (it's the actionable one). When fundamentals are
  // unavailable (no Finnhub key), fall back to price-only dips.
  const dipAlerts = scanned
    .filter(s => s.isDip && (s.pe === null || s.score >= 2))
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 12);

  const payload = {
    valuePicks,
    dipAlerts,
    scanned:   scanned.length,
    source:    finnhubKey ? "finnhub+yahoo" : "yahoo-only",
    updatedAt: new Date().toISOString(),
  };
  if (scanned.length > 0) cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
