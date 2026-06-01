export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { cacheGet, cacheSet } from "@/app/lib/sentiment";

const CACHE_KEY = "ipo:calendar";
const CACHE_TTL = 30 * 60 * 1_000; // 30 minutes

export interface IPOItem {
  name:          string;
  symbol:        string;
  exchange:      string | null;
  date:          string;
  price:         string | null;
  shares:        number | null;
  totalValue:    number | null;
  status:        "priced" | "expected" | "filed" | "withdrawn";
  rating:        "Strong" | "Watch" | "Speculative";
  ratingReason:  string;
  isSpac:        boolean;
  currentPrice:  number | null;
  ipoPrice:      number | null;
  perfPct:       number | null;
}

interface FinnhubIPO {
  date:             string;
  exchange:         string | null;
  name:             string;
  numberOfShares:   number | null;
  price:            string | null;
  status:           string;
  symbol:           string;
  totalSharesValue: number | null;
}

function isSpac(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("acquisition") || n.includes("blank check") || n.includes("spac") || n.includes("purpose acquisition");
}

function rateIPO(ipo: FinnhubIPO): { rating: IPOItem["rating"]; reason: string } {
  const spac         = isSpac(ipo.name);
  const majorEx      = !!(ipo.exchange?.includes("NASDAQ") || ipo.exchange?.includes("NYSE") || ipo.exchange?.includes("New York Stock"));
  const offerSize    = ipo.totalSharesValue ?? 0;
  const hasSymbol    = !!ipo.symbol;
  const hasPrice     = !!ipo.price;

  if (spac) return { rating: "Speculative", reason: "SPAC — blank check company, high uncertainty" };

  if (majorEx && offerSize >= 200_000_000 && hasSymbol && hasPrice)
    return { rating: "Strong",      reason: `${ipo.exchange} listing, $${(offerSize / 1e6).toFixed(0)}M raise` };
  if (majorEx && offerSize >= 50_000_000)
    return { rating: "Watch",       reason: `${ipo.exchange} listing, $${(offerSize / 1e6).toFixed(0)}M raise` };
  if (majorEx)
    return { rating: "Watch",       reason: `${ipo.exchange ?? "major"} listing, small raise` };
  if (offerSize >= 100_000_000)
    return { rating: "Watch",       reason: `$${(offerSize / 1e6).toFixed(0)}M raise, exchange TBD` };

  return { rating: "Speculative",   reason: hasSymbol ? "Small offering, limited institutional coverage" : "No exchange / symbol assigned yet" };
}

async function fetchIPORange(from: string, to: string): Promise<FinnhubIPO[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const url = `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${key}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const d = await r.json() as { ipoCalendar?: FinnhubIPO[] };
    return Array.isArray(d?.ipoCalendar) ? d.ipoCalendar : [];
  } catch { return []; }
}

async function fetchQuote(symbol: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || !symbol) return null;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const d = await r.json() as { c?: number };
    return typeof d?.c === "number" && d.c > 0 ? d.c : null;
  } catch { return null; }
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const cached = cacheGet<{ upcoming: IPOItem[]; recent: IPOItem[] }>(CACHE_KEY);
  if (cached) return Response.json(cached);

  const today    = new Date();
  const past90   = new Date(today); past90.setDate(today.getDate() - 90);
  const future60 = new Date(today); future60.setDate(today.getDate() + 60);

  const [recentRaw, upcomingRaw] = await Promise.all([
    fetchIPORange(fmt(past90), fmt(today)),
    fetchIPORange(fmt(today),  fmt(future60)),
  ]);

  const todayStr = fmt(today);

  // ── Recent: priced IPOs in last 90 days ───────────────────────────────────
  const recentPriced = recentRaw
    .filter(i => i.status === "priced" && i.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  // Fetch current quotes for recent ones with real symbols (limit 10)
  const quoteFetches = recentPriced
    .filter(i => i.symbol && !isSpac(i.name))
    .slice(0, 10)
    .map(i => fetchQuote(i.symbol));
  const quotes = await Promise.all(quoteFetches);

  let qIdx = 0;
  const recent: IPOItem[] = recentPriced.map(i => {
    const { rating, reason } = rateIPO(i);
    const ipoPrice = i.price ? parseFloat(i.price.replace(/[^0-9.]/g, "")) || null : null;
    let currentPrice: number | null = null;
    if (i.symbol && !isSpac(i.name) && qIdx < quotes.length) {
      currentPrice = quotes[qIdx++] ?? null;
    }
    const perfPct = ipoPrice && currentPrice
      ? +((( currentPrice - ipoPrice) / ipoPrice) * 100).toFixed(2)
      : null;
    return {
      name:         i.name,
      symbol:       i.symbol,
      exchange:     i.exchange,
      date:         i.date,
      price:        i.price,
      shares:       i.numberOfShares,
      totalValue:   i.totalSharesValue,
      status:       "priced",
      rating,
      ratingReason: reason,
      isSpac:       isSpac(i.name),
      currentPrice,
      ipoPrice,
      perfPct,
    };
  });

  // ── Upcoming: filed/expected (future dates) ───────────────────────────────
  const upcoming: IPOItem[] = upcomingRaw
    .filter(i => i.status !== "withdrawn" && i.status !== "priced")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30)
    .map(i => {
      const { rating, reason } = rateIPO(i);
      return {
        name:         i.name,
        symbol:       i.symbol,
        exchange:     i.exchange,
        date:         i.date,
        price:        i.price,
        shares:       i.numberOfShares,
        totalValue:   i.totalSharesValue,
        status:       (i.status as IPOItem["status"]) ?? "filed",
        rating,
        ratingReason: reason,
        isSpac:       isSpac(i.name),
        currentPrice: null,
        ipoPrice:     i.price ? parseFloat(i.price.replace(/[^0-9.]/g, "")) || null : null,
        perfPct:      null,
      };
    });

  const payload = { upcoming, recent };
  cacheSet(CACHE_KEY, payload, CACHE_TTL);
  return Response.json(payload);
}
