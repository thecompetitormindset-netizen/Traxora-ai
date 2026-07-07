export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";

// No hardcoded universe. Yahoo Finance's screener runs against its entire
// database (~8 000+ US equities). We query predefined screens and let
// their backend do the filtering across the whole market.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ValueStock = {
  symbol:    string;
  name:      string;
  price:     number | null;
  changePct: number | null;
  pe:        number | null;
  forwardPe: number | null;
  pb:        number | null;
  divYield:  number | null;   // percent, e.g. 6.5
  marketCap: number | null;   // billions USD
  sector:    string | null;
  score:     number;
  isDip:     boolean;
};

function scoreStock(s: ValueStock): number {
  let sc = 0;
  if (s.pe        !== null && s.pe > 0)        { if (s.pe < 10) sc += 3; else if (s.pe < 15) sc += 2; else if (s.pe < 20) sc += 1; }
  if (s.forwardPe !== null && s.forwardPe > 0) { if (s.forwardPe < 12) sc += 2; else if (s.forwardPe < 17) sc += 1; }
  if (s.pb        !== null && s.pb > 0)        { if (s.pb < 1) sc += 2; else if (s.pb < 2) sc += 1; }
  if (s.divYield  !== null)                    { if (s.divYield >= 5) sc += 2; else if (s.divYield >= 3) sc += 1; }
  return Math.min(sc, 10);
}

// Parse a single Yahoo quote result into our shape
function parseQuote(q: Record<string, unknown>): ValueStock | null {
  const sym = q.symbol as string | undefined;
  if (!sym) return null;

  const num  = (k: string) => (typeof q[k] === "number" ? (q[k] as number) : null);
  const str  = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);

  const price     = num("regularMarketPrice");
  const changePct = num("regularMarketChangePercent");
  const pe        = num("trailingPE");
  const fp        = num("forwardPE");
  const pb        = num("priceToBook");
  const mcRaw     = num("marketCap");
  const yRaw      = num("trailingAnnualDividendYield") ?? num("dividendYield");

  const s: ValueStock = {
    symbol:    sym,
    name:      (str("longName") ?? str("shortName") ?? sym),
    price:     price     !== null ? parseFloat(price.toFixed(2))     : null,
    changePct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
    pe:        pe !== null && pe > 0 ? parseFloat(pe.toFixed(1))    : null,
    forwardPe: fp !== null && fp > 0 ? parseFloat(fp.toFixed(1))    : null,
    pb:        pb !== null && pb > 0 ? parseFloat(pb.toFixed(2))    : null,
    divYield:  yRaw !== null ? parseFloat((yRaw * 100).toFixed(2))  : null,
    marketCap: mcRaw !== null ? parseFloat((mcRaw / 1e9).toFixed(1)) : null,
    sector:    str("sector"),
    score:     0,
    isDip:     false,
  };
  s.score = scoreStock(s);
  s.isDip = (changePct ?? 0) <= -4 && s.score >= 3;
  return s;
}

// Fetch one of Yahoo's predefined screeners — runs against their full market DB
async function fetchScreen(scrId: string, count = 50): Promise<ValueStock[]> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/${scrId}` +
      `?formatted=false&lang=en-US&region=US&count=${count}&start=0&fields=` +
      `regularMarketPrice,regularMarketChangePercent,trailingPE,forwardPE,` +
      `priceToBook,trailingAnnualDividendYield,dividendYield,marketCap,` +
      `shortName,longName,sector`;

    const res = await fetch(url, {
      cache:   "no-store",
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];

    const json   = await res.json();
    const quotes = (json?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    return quotes.map(parseQuote).filter((s): s is ValueStock => s !== null);
  } catch { return []; }
}

// Fetch a custom POST screener query — used for dip detection across entire market
async function fetchDipScreen(): Promise<ValueStock[]> {
  try {
    const body = {
      offset: 0, size: 100,
      sortField: "percentchange", sortType: "asc",
      quoteType: "EQUITY",
      query: {
        operator: "and",
        operands: [
          // Down at least 4% today
          { operator: "lt", operands: ["percentchange", -4] },
          // Profitable (has a PE ratio)
          { operator: "gt", operands: ["trailingpe",    0]  },
          // Not penny stock (market cap > $200M)
          { operator: "gt", operands: ["intradaymarketcap", 200_000_000] },
        ],
      },
      userId: "", userIdType: "guid",
    };

    const res = await fetch(
      "https://query2.finance.yahoo.com/v1/finance/screener?lang=en-US&region=US&formatted=false",
      {
        method:  "POST",
        cache:   "no-store",
        headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json" },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return [];

    const json   = await res.json();
    const quotes = (json?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    return quotes.map(parseQuote).filter((s): s is ValueStock => s !== null);
  } catch { return []; }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Run all three screens in parallel
  const [undervaluedLarge, undervaluedGrowth, dayLosers] = await Promise.all([
    fetchScreen("undervalued_large_caps",    50),
    fetchScreen("undervalued_growth_stocks", 50),
    fetchDipScreen(),
  ]);

  // Merge value picks, deduplicate by symbol, sort by score desc
  const seen      = new Set<string>();
  const allValue  = [...undervaluedLarge, ...undervaluedGrowth];
  const valuePicks: ValueStock[] = [];
  for (const s of allValue.sort((a, b) => b.score - a.score)) {
    if (seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    valuePicks.push(s);
    if (valuePicks.length >= 16) break;
  }

  // Dip alerts — stocks the custom screener found down ≥4% today with earnings
  const dipSeen   = new Set<string>(valuePicks.map(s => s.symbol));
  const dipAlerts = dayLosers
    .filter(s => !dipSeen.has(s.symbol))
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 20);

  const scanned = undervaluedLarge.length + undervaluedGrowth.length + dayLosers.length;

  return Response.json({
    valuePicks,
    dipAlerts,
    scanned,
    updatedAt: new Date().toISOString(),
  });
}
