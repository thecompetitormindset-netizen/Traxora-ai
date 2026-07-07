export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";
import { getYahooCookie, YAHOO_UA } from "@/app/lib/yahooAuth";

// Quality universe — stocks worth owning at the right price
const UNIVERSE = [
  "PFE", "INTC", "DVN", "KEY", "CSCO", "MO", "VZ",
  "JNJ", "JPM", "BAC", "XOM", "CVX", "WMT", "KO",
  "PG", "ABBV", "MRK", "CVS", "WBA", "GE", "CAT",
  "IBM", "ORCL", "T",  "C",   "WFC", "COP", "PM",
  "MMM", "O",
];

export type ValueStock = {
  symbol:       string;
  name:         string;
  price:        number | null;
  changePct:    number | null;
  pe:           number | null;  // trailing P/E
  forwardPe:    number | null;
  pb:           number | null;  // price-to-book
  divYield:     number | null;  // percent, e.g. 6.5
  debtToEquity: number | null;
  epsGrowth:    number | null;  // 5y earnings growth %
  score:        number;         // 0–10 value score
  isDip:        boolean;        // down ≥4% today AND score ≥ 4
};

// Module-level fundamentals cache (TTL 4 hours — fundamentals don't change intraday)
type Fundamentals = Pick<ValueStock, "name" | "pe" | "forwardPe" | "pb" | "divYield" | "debtToEquity" | "epsGrowth">;
const fundCache = new Map<string, { data: Fundamentals; ts: number }>();
const FUND_TTL = 4 * 60 * 60 * 1_000;

function scoreStock(v: ValueStock): number {
  let s = 0;
  if (v.pe   !== null) { if (v.pe < 10) s += 3; else if (v.pe < 15) s += 2; else if (v.pe < 20) s += 1; }
  if (v.forwardPe !== null && v.forwardPe > 0) { if (v.forwardPe < 12) s += 2; else if (v.forwardPe < 17) s += 1; }
  if (v.pb   !== null) { if (v.pb < 1) s += 2; else if (v.pb < 2) s += 1; }
  if (v.divYield !== null) { if (v.divYield >= 5) s += 2; else if (v.divYield >= 3) s += 1; }
  if (v.debtToEquity !== null && v.debtToEquity < 1) s += 1;
  return Math.min(s, 10);
}

async function fetchFundamentals(symbol: string, cookie: string, crumb: string): Promise<Fundamentals> {
  const cached = fundCache.get(symbol);
  if (cached && Date.now() - cached.ts < FUND_TTL) return cached.data;

  try {
    const url =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
      `?modules=financialData%2CdefaultKeyStatistics%2CsummaryDetail&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": YAHOO_UA, Cookie: cookie },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    const r    = json?.quoteSummary?.result?.[0];
    const fd   = (r?.financialData       ?? {}) as Record<string, { raw?: number }>;
    const ks   = (r?.defaultKeyStatistics ?? {}) as Record<string, { raw?: number }>;
    const sd   = (r?.summaryDetail        ?? {}) as Record<string, { raw?: number }>;

    const num = (o: Record<string, { raw?: number }>, k: string) =>
      typeof o[k]?.raw === "number" ? (o[k].raw as number) : null;

    const name      = (r?.price?.longName ?? r?.price?.shortName ?? symbol) as string;
    const divYieldRaw = num(sd, "dividendYield") ?? num(fd, "dividendYield") ?? null;

    const data: Fundamentals = {
      name,
      pe:           num(sd, "trailingPE")          ?? num(fd, "trailingPE")          ?? null,
      forwardPe:    num(sd, "forwardPE")            ?? num(ks, "forwardPE")            ?? null,
      pb:           num(ks, "priceToBook")          ?? null,
      divYield:     divYieldRaw !== null ? parseFloat((divYieldRaw * 100).toFixed(2)) : null,
      debtToEquity: num(fd, "debtToEquity")         ?? null,
      epsGrowth:    num(ks, "earningsQuarterlyGrowth") !== null
        ? parseFloat(((num(ks, "earningsQuarterlyGrowth") ?? 0) * 100).toFixed(1))
        : null,
    };
    fundCache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch {
    const fallback: Fundamentals = { name: symbol, pe: null, forwardPe: null, pb: null, divYield: null, debtToEquity: null, epsGrowth: null };
    return fallback;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const yAuth = await getYahooCookie();
  if (!yAuth) return Response.json({ valuePicks: [], dipAlerts: [], scanned: 0, error: "Yahoo auth failed" });

  // Fetch quotes + fundamentals concurrently, but throttle to avoid rate limits
  const results: ValueStock[] = [];

  const chunks: string[][] = [];
  for (let i = 0; i < UNIVERSE.length; i += 5) chunks.push(UNIVERSE.slice(i, i + 5));

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map(async (symbol) => {
        const [quoteRes, fund] = await Promise.all([
          fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
            {
              cache: "no-store",
              headers: { "User-Agent": YAHOO_UA, Cookie: yAuth.cookie },
              signal: AbortSignal.timeout(6_000),
            }
          ).then(r => r.ok ? r.json() : null).catch(() => null),
          fetchFundamentals(symbol, yAuth.cookie, yAuth.crumb),
        ]);

        const meta     = quoteRes?.chart?.result?.[0]?.meta ?? {};
        const price    = (meta.regularMarketPrice as number) ?? null;
        const prevClose= (meta.chartPreviousClose ?? meta.previousClose) as number | null;
        const changePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null;

        const v: ValueStock = {
          symbol,
          ...fund,
          price,
          changePct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
          score: 0,
          isDip: false,
        };
        v.score  = scoreStock(v);
        v.isDip  = (changePct ?? 0) <= -4 && v.score >= 4;
        return v;
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }

    // Small pause between chunks to be polite to Yahoo
    await new Promise(res => setTimeout(res, 120));
  }

  const dipAlerts  = results.filter(s => s.isDip).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  const valuePicks = results
    .filter(s => !s.isDip && s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return Response.json({
    valuePicks,
    dipAlerts,
    scanned:   results.length,
    updatedAt: new Date().toISOString(),
  });
}
