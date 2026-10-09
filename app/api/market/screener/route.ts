import { viewer } from "@/app/lib/viewer";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 25;


// ── Static fundamental universe ────────────────────────────────────────────────
// marketCapB = approximate market cap in $B (slow-moving, updated periodically)
// peRatio    = approximate trailing P/E (null = unprofitable or N/A)

const UNIVERSE = [
  // Technology
  { symbol: "AAPL",  name: "Apple Inc.",             sector: "Technology",    marketCapB: 3100, peRatio: 32 },
  { symbol: "MSFT",  name: "Microsoft Corp.",         sector: "Technology",    marketCapB: 3000, peRatio: 35 },
  { symbol: "NVDA",  name: "NVIDIA Corp.",            sector: "Technology",    marketCapB: 2800, peRatio: 45 },
  { symbol: "AVGO",  name: "Broadcom Inc.",           sector: "Technology",    marketCapB: 850,  peRatio: 35 },
  { symbol: "ORCL",  name: "Oracle Corp.",            sector: "Technology",    marketCapB: 450,  peRatio: 42 },
  { symbol: "AMD",   name: "AMD",                     sector: "Technology",    marketCapB: 220,  peRatio: 55 },
  { symbol: "QCOM",  name: "Qualcomm Inc.",           sector: "Technology",    marketCapB: 190,  peRatio: 18 },
  { symbol: "AMAT",  name: "Applied Materials",       sector: "Technology",    marketCapB: 160,  peRatio: 22 },
  { symbol: "MU",    name: "Micron Technology",       sector: "Technology",    marketCapB: 120,  peRatio: 12 },
  { symbol: "INTC",  name: "Intel Corp.",             sector: "Technology",    marketCapB: 85,   peRatio: null },
  { symbol: "NOW",   name: "ServiceNow Inc.",         sector: "Technology",    marketCapB: 210,  peRatio: 65 },
  { symbol: "CRM",   name: "Salesforce Inc.",         sector: "Technology",    marketCapB: 280,  peRatio: 40 },
  // Communication
  { symbol: "GOOGL", name: "Alphabet Inc.",           sector: "Communication", marketCapB: 2200, peRatio: 22 },
  { symbol: "META",  name: "Meta Platforms",          sector: "Communication", marketCapB: 1400, peRatio: 28 },
  { symbol: "NFLX",  name: "Netflix Inc.",            sector: "Communication", marketCapB: 420,  peRatio: 52 },
  { symbol: "DIS",   name: "Walt Disney Co.",         sector: "Communication", marketCapB: 205,  peRatio: 45 },
  { symbol: "T",     name: "AT&T Inc.",               sector: "Communication", marketCapB: 165,  peRatio: 12 },
  // Consumer
  { symbol: "AMZN",  name: "Amazon.com Inc.",         sector: "Consumer",      marketCapB: 1900, peRatio: 42 },
  { symbol: "TSLA",  name: "Tesla Inc.",              sector: "Consumer",      marketCapB: 800,  peRatio: 65 },
  { symbol: "WMT",   name: "Walmart Inc.",            sector: "Consumer",      marketCapB: 780,  peRatio: 38 },
  { symbol: "COST",  name: "Costco Wholesale",        sector: "Consumer",      marketCapB: 390,  peRatio: 52 },
  { symbol: "MCD",   name: "McDonald's Corp.",        sector: "Consumer",      marketCapB: 215,  peRatio: 25 },
  { symbol: "TGT",   name: "Target Corp.",            sector: "Consumer",      marketCapB: 55,   peRatio: 16 },
  { symbol: "NKE",   name: "Nike Inc.",               sector: "Consumer",      marketCapB: 60,   peRatio: 22 },
  // Finance
  { symbol: "JPM",   name: "JPMorgan Chase",          sector: "Finance",       marketCapB: 700,  peRatio: 13 },
  { symbol: "V",     name: "Visa Inc.",               sector: "Finance",       marketCapB: 560,  peRatio: 30 },
  { symbol: "MA",    name: "Mastercard Inc.",         sector: "Finance",       marketCapB: 480,  peRatio: 34 },
  { symbol: "BAC",   name: "Bank of America",         sector: "Finance",       marketCapB: 300,  peRatio: 14 },
  { symbol: "GS",    name: "Goldman Sachs",           sector: "Finance",       marketCapB: 180,  peRatio: 16 },
  { symbol: "MS",    name: "Morgan Stanley",          sector: "Finance",       marketCapB: 190,  peRatio: 17 },
  { symbol: "PYPL",  name: "PayPal Holdings",         sector: "Finance",       marketCapB: 70,   peRatio: 18 },
  // Healthcare
  { symbol: "LLY",   name: "Eli Lilly & Co.",        sector: "Healthcare",    marketCapB: 750,  peRatio: 62 },
  { symbol: "UNH",   name: "UnitedHealth Group",      sector: "Healthcare",    marketCapB: 450,  peRatio: 20 },
  { symbol: "JNJ",   name: "Johnson & Johnson",       sector: "Healthcare",    marketCapB: 390,  peRatio: 16 },
  { symbol: "ABBV",  name: "AbbVie Inc.",             sector: "Healthcare",    marketCapB: 350,  peRatio: 52 },
  { symbol: "MRK",   name: "Merck & Co.",             sector: "Healthcare",    marketCapB: 270,  peRatio: 12 },
  { symbol: "TMO",   name: "Thermo Fisher",           sector: "Healthcare",    marketCapB: 195,  peRatio: 26 },
  { symbol: "PFE",   name: "Pfizer Inc.",             sector: "Healthcare",    marketCapB: 165,  peRatio: 11 },
  // Energy
  { symbol: "XOM",   name: "ExxonMobil Corp.",        sector: "Energy",        marketCapB: 510,  peRatio: 14 },
  { symbol: "CVX",   name: "Chevron Corp.",           sector: "Energy",        marketCapB: 280,  peRatio: 15 },
  { symbol: "OXY",   name: "Occidental Petroleum",    sector: "Energy",        marketCapB: 55,   peRatio: 14 },
  { symbol: "SLB",   name: "SLB (Schlumberger)",      sector: "Energy",        marketCapB: 52,   peRatio: 13 },
  // Industrials
  { symbol: "CAT",   name: "Caterpillar Inc.",        sector: "Industrials",   marketCapB: 190,  peRatio: 18 },
  { symbol: "HON",   name: "Honeywell Intl.",         sector: "Industrials",   marketCapB: 135,  peRatio: 22 },
  { symbol: "BA",    name: "Boeing Co.",              sector: "Industrials",   marketCapB: 115,  peRatio: null },
  { symbol: "UPS",   name: "UPS Inc.",                sector: "Industrials",   marketCapB: 90,   peRatio: 16 },
  // Materials
  { symbol: "LIN",   name: "Linde PLC",              sector: "Materials",     marketCapB: 215,  peRatio: 30 },
  { symbol: "FCX",   name: "Freeport-McMoRan",        sector: "Materials",     marketCapB: 62,   peRatio: 18 },
  // ETFs
  { symbol: "SPY",   name: "S&P 500 ETF (SPDR)",     sector: "ETF",           marketCapB: 580,  peRatio: 21 },
  { symbol: "QQQ",   name: "NASDAQ-100 ETF (Inv.)",  sector: "ETF",           marketCapB: 310,  peRatio: 28 },
  { symbol: "IWM",   name: "Russell 2000 ETF (iSh)", sector: "ETF",           marketCapB: 60,   peRatio: 18 },
] as const;

type Row = {
  symbol:     string;
  name:       string;
  sector:     string;
  marketCapB: number;
  peRatio:    number | null;
  price:      number | null;
  change:     number | null;   // day change %
  volume:     number | null;   // today's volume
  avgVolume:  number | null;   // 20-day avg volume
  volRatio:   number | null;   // volume / avgVolume
};

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Batch-fetch quotes from Yahoo Finance v7 (multiple symbols in one request)
  const symbols = UNIVERSE.map(u => u.symbol).join(",");

  let liveData: Record<string, { price: number | null; change: number | null; volume: number | null; avgVolume: number | null }> = {};

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month`,
      {
        cache:   "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept":     "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (res.ok) {
      const json = await res.json();
      const quotes: unknown[] = json?.quoteResponse?.result ?? [];
      for (const q of quotes) {
        if (typeof q !== "object" || q === null) continue;
        const obj = q as Record<string, unknown>;
        const sym = typeof obj.symbol === "string" ? obj.symbol : null;
        if (!sym) continue;
        liveData[sym] = {
          price:     typeof obj.regularMarketPrice           === "number" ? obj.regularMarketPrice           : null,
          change:    typeof obj.regularMarketChangePercent   === "number" ? obj.regularMarketChangePercent   : null,
          volume:    typeof obj.regularMarketVolume          === "number" ? obj.regularMarketVolume          : null,
          avgVolume: typeof obj.averageDailyVolume3Month     === "number" ? obj.averageDailyVolume3Month     : null,
        };
      }
    }
  } catch { /* fall through — live data just won't be populated */ }

  const rows: Row[] = UNIVERSE.map(u => {
    const live = liveData[u.symbol] ?? { price: null, change: null, volume: null, avgVolume: null };
    const volRatio =
      live.volume && live.avgVolume && live.avgVolume > 0
        ? parseFloat((live.volume / live.avgVolume).toFixed(2))
        : null;
    return {
      symbol:     u.symbol,
      name:       u.name,
      sector:     u.sector,
      marketCapB: u.marketCapB,
      peRatio:    u.peRatio,
      price:      live.price,
      change:     live.change !== null ? parseFloat(live.change.toFixed(2)) : null,
      volume:     live.volume,
      avgVolume:  live.avgVolume,
      volRatio,
    };
  });

  const url = new URL(req.url);
  void url; // reserved for future query params

  return Response.json({ rows, updatedAt: new Date().toISOString() });
}
