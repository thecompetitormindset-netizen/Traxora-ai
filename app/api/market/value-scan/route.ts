export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";
import { getYahooCookie, YAHOO_UA } from "@/app/lib/yahooAuth";

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

// ── Yahoo screener (authenticated) ───────────────────────────────────────────

function parseYahooQuote(q: Record<string, unknown>): ValueStock | null {
  const sym = q.symbol as string | undefined;
  if (!sym) return null;
  const num = (k: string) => (typeof q[k] === "number" ? (q[k] as number) : null);
  const str = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  const price     = num("regularMarketPrice");
  const changePct = num("regularMarketChangePercent");
  const pe        = num("trailingPE");
  const fp        = num("forwardPE");
  const pb        = num("priceToBook");
  const mcRaw     = num("marketCap");
  const yRaw      = num("trailingAnnualDividendYield") ?? num("dividendYield");
  const s: ValueStock = {
    symbol:    sym,
    name:      str("longName") ?? str("shortName") ?? sym,
    price:     price     !== null ? parseFloat(price.toFixed(2))     : null,
    changePct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
    pe:        pe !== null && pe > 0 ? parseFloat(pe.toFixed(1))     : null,
    forwardPe: fp !== null && fp > 0 ? parseFloat(fp.toFixed(1))     : null,
    pb:        pb !== null && pb > 0 ? parseFloat(pb.toFixed(2))     : null,
    divYield:  yRaw !== null ? parseFloat((yRaw * 100).toFixed(2))   : null,
    marketCap: mcRaw !== null ? parseFloat((mcRaw / 1e9).toFixed(1)) : null,
    sector:    str("sector"),
    score:     0,
    isDip:     false,
  };
  s.score = scoreStock(s);
  s.isDip = (changePct ?? 0) <= -4 && s.score >= 3;
  return s;
}

async function yahooScreen(
  scrId: string,
  cookie: string,
  count = 50,
): Promise<ValueStock[]> {
  try {
    const fields = [
      "regularMarketPrice","regularMarketChangePercent","trailingPE","forwardPE",
      "priceToBook","trailingAnnualDividendYield","dividendYield","marketCap",
      "shortName","longName","sector",
    ].join(",");
    const url =
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/${scrId}` +
      `?formatted=false&lang=en-US&region=US&count=${count}&start=0&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, {
      cache:   "no-store",
      headers: { "User-Agent": YAHOO_UA, "Accept": "application/json", Cookie: cookie },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const json   = await res.json();
    const quotes = (json?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    return quotes.map(parseYahooQuote).filter((s): s is ValueStock => s !== null);
  } catch { return []; }
}

async function yahooDipScreen(cookie: string, crumb: string): Promise<ValueStock[]> {
  try {
    const body = {
      offset: 0, size: 100,
      sortField: "percentchange", sortType: "asc",
      quoteType: "EQUITY",
      query: {
        operator: "and",
        operands: [
          { operator: "lt", operands: ["percentchange",    -4]          },
          { operator: "gt", operands: ["trailingpe",        0]          },
          { operator: "gt", operands: ["intradaymarketcap", 200_000_000] },
        ],
      },
      userId: "", userIdType: "guid",
    };
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/screener?lang=en-US&region=US&formatted=false&crumb=${encodeURIComponent(crumb)}`,
      {
        method:  "POST",
        cache:   "no-store",
        headers: { "User-Agent": YAHOO_UA, "Content-Type": "application/json", "Accept": "application/json", Cookie: cookie },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return [];
    const json   = await res.json();
    const quotes = (json?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    return quotes.map(parseYahooQuote).filter((s): s is ValueStock => s !== null);
  } catch { return []; }
}

// ── EODHD screener fallback ───────────────────────────────────────────────────

function parseEodhdRow(r: Record<string, unknown>): ValueStock | null {
  const code = (r.code as string | undefined)?.replace(/\.(US|NASDAQ|NYSE)$/i, "");
  if (!code) return null;
  const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  const price     = num("price") ?? num("close");
  const changePct = num("change_p");
  const pe        = num("pe_ratio") ?? num("pe");
  const pb        = num("price_to_book") ?? num("pb");
  const mcRaw     = num("market_capitalization");
  const yRaw      = num("dividend_yield");
  const s: ValueStock = {
    symbol:    code,
    name:      str("name") ?? code,
    price:     price     !== null ? parseFloat(price.toFixed(2))      : null,
    changePct: changePct !== null ? parseFloat(changePct.toFixed(2))  : null,
    pe:        pe !== null && pe > 0 ? parseFloat(pe.toFixed(1))      : null,
    forwardPe: null,
    pb:        pb !== null && pb > 0 ? parseFloat(pb.toFixed(2))      : null,
    divYield:  yRaw !== null ? parseFloat((yRaw * 100).toFixed(2))    : null,
    marketCap: mcRaw !== null ? parseFloat((mcRaw / 1e9).toFixed(1))  : null,
    sector:    str("sector") ?? str("industry") ?? null,
    score:     0,
    isDip:     false,
  };
  s.score = scoreStock(s);
  s.isDip = (changePct ?? 0) <= -4 && s.score >= 3;
  return s;
}

async function eodhdScreen(filters: string, sort: string, limit = 50): Promise<ValueStock[]> {
  const key = process.env.EODHD_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://eodhd.com/api/screener?api_token=${key}` +
      `&filters=${encodeURIComponent(filters)}&sort=${encodeURIComponent(sort)}` +
      `&limit=${limit}&country=US`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = (Array.isArray(json) ? json : json?.data ?? []) as Record<string, unknown>[];
    return rows.map(parseEodhdRow).filter((s): s is ValueStock => s !== null);
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Get Yahoo auth cookie for authenticated screener calls
  const yAuth = await getYahooCookie();

  let undervaluedLarge: ValueStock[] = [];
  let undervaluedGrowth: ValueStock[] = [];
  let dipAlerts: ValueStock[] = [];

  if (yAuth) {
    [undervaluedLarge, undervaluedGrowth, dipAlerts] = await Promise.all([
      yahooScreen("undervalued_large_caps",    yAuth.cookie, 50),
      yahooScreen("undervalued_growth_stocks", yAuth.cookie, 50),
      yahooDipScreen(yAuth.cookie, yAuth.crumb),
    ]);
  }

  // Fall back to EODHD if Yahoo returned nothing
  const yahooWorked = undervaluedLarge.length > 0 || undervaluedGrowth.length > 0;
  if (!yahooWorked) {
    const valueFilt = JSON.stringify([
      ["market_capitalization", ">", "200000000"],
      ["pe_ratio", "<", "20"],
      ["pe_ratio", ">", "0"],
    ]);
    const dipFilt = JSON.stringify([
      ["change_p", "<", "-4"],
      ["pe_ratio", ">", "0"],
      ["market_capitalization", ">", "200000000"],
    ]);
    [undervaluedLarge, dipAlerts] = await Promise.all([
      eodhdScreen(valueFilt, "pe_ratio,asc", 50),
      eodhdScreen(dipFilt,   "change_p,asc", 50),
    ]);
  }

  // Merge + deduplicate value picks
  const seen      = new Set<string>();
  const allValue  = [...undervaluedLarge, ...undervaluedGrowth];
  const valuePicks: ValueStock[] = [];
  for (const s of allValue.sort((a, b) => b.score - a.score)) {
    if (seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    valuePicks.push(s);
    if (valuePicks.length >= 16) break;
  }

  const dipSeen = new Set<string>(valuePicks.map(s => s.symbol));
  const filteredDips = dipAlerts
    .filter(s => !dipSeen.has(s.symbol))
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 20);

  return Response.json({
    valuePicks,
    dipAlerts:  filteredDips,
    scanned:    undervaluedLarge.length + undervaluedGrowth.length + dipAlerts.length,
    source:     yahooWorked ? "yahoo" : "eodhd",
    updatedAt:  new Date().toISOString(),
  });
}
