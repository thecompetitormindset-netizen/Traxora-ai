export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";

// ── Universe ──────────────────────────────────────────────────────────────────
// ~150 quality stocks across every sector — large, mid, and some growth names.
// The actual picks and dip alerts are determined entirely by live fundamentals,
// not by anything hardcoded here. Add or remove symbols freely.
const UNIVERSE = [
  // Mega-cap tech
  "AAPL","MSFT","GOOGL","META","AMZN","NVDA","ORCL","CRM","ADBE","INTC",
  "AMD","QCOM","AMAT","MU","TXN","AVGO","IBM","CSCO","NOW","SNOW",
  // Consumer discretionary
  "TSLA","WMT","COST","MCD","NKE","TGT","SBUX","HD","LOW","F",
  "GM","BKNG","EBAY","ETSY","DASH","LYFT","UBER",
  // Financials — banks, payments, fintech
  "JPM","BAC","WFC","GS","MS","C","AXP","BLK","SCHW","USB",
  "KEY","RF","CFG","FITB","HBAN","MTB","ZION","CMA","PYPL","SQ","HOOD",
  // Healthcare
  "JNJ","UNH","LLY","ABBV","MRK","PFE","TMO","ABT","BMY","GILD",
  "CVS","CI","HUM","MDT","SYK","BSX","EW","ISRG",
  // Energy
  "XOM","CVX","COP","OXY","SLB","HAL","DVN","MPC","VLO","PSX",
  "BKR","EOG","HES","FANG",
  // Consumer staples
  "PG","KO","PEP","MO","PM","MDLZ","CL","GIS","K","CAG","WBA",
  // Telecom
  "VZ","T","TMUS",
  // Industrials
  "CAT","BA","HON","GE","RTX","LMT","NOC","DE","MMM","UPS","FDX",
  // Materials
  "LIN","APD","FCX","NEM","ALB","CF",
  // REITs
  "O","AMT","PLD","CCI","EQIX","SPG","WPC",
  // Sector ETFs (useful for macro dip alerts)
  "XLF","XLE","XLK","XLV","XLI",
  // High-beta / growth (crash harder = better dip alerts)
  "PLTR","SOFI","RIVN","COIN","RBLX","SNAP","PINS",
  "SPOT","SHOP","NET","DDOG","ZS","CRWD","S","GTLB",
];

export type ValueStock = {
  symbol:       string;
  name:         string;
  price:        number | null;
  changePct:    number | null;
  pe:           number | null;
  forwardPe:    number | null;
  pb:           number | null;
  divYield:     number | null;  // percent, e.g. 6.5
  marketCap:    number | null;  // billions
  score:        number;
  isDip:        boolean;
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function scoreStock(s: ValueStock): number {
  let sc = 0;
  const pe = s.pe;
  const fp = s.forwardPe;
  if (pe   !== null && pe   > 0) { if (pe < 10) sc += 3; else if (pe < 15) sc += 2; else if (pe < 20) sc += 1; }
  if (fp   !== null && fp   > 0) { if (fp < 12) sc += 2; else if (fp < 17) sc += 1; }
  if (s.pb !== null && s.pb > 0) { if (s.pb < 1) sc += 2; else if (s.pb < 2) sc += 1; }
  if (s.divYield !== null)        { if (s.divYield >= 5) sc += 2; else if (s.divYield >= 3) sc += 1; }
  return Math.min(sc, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Single batch call — Yahoo v7 returns price + fundamental fields for all symbols
  const fields = [
    "regularMarketPrice",
    "regularMarketChangePercent",
    "trailingPE",
    "forwardPE",
    "priceToBook",
    "trailingAnnualDividendYield",
    "dividendYield",
    "marketCap",
    "shortName",
    "longName",
  ].join(",");

  const symbolsParam = UNIVERSE.join(",");

  let raw: Record<string, ValueStock> = {};

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}&fields=${encodeURIComponent(fields)}`,
      {
        cache:   "no-store",
        headers: { "User-Agent": UA, "Accept": "application/json" },
        signal:  AbortSignal.timeout(15_000),
      },
    );

    if (res.ok) {
      const json  = await res.json();
      const quotes = (json?.quoteResponse?.result ?? []) as Record<string, unknown>[];

      for (const q of quotes) {
        const sym = q.symbol as string;
        if (!sym) continue;

        const num = (k: string) =>
          typeof q[k] === "number" ? (q[k] as number) : null;

        const price     = num("regularMarketPrice");
        const changePct = num("regularMarketChangePercent");
        const pe        = num("trailingPE");
        const fp        = num("forwardPE");
        const pb        = num("priceToBook");
        const mcRaw     = num("marketCap");
        const yieldRaw  = num("trailingAnnualDividendYield") ?? num("dividendYield");
        const divYield  = yieldRaw !== null ? parseFloat((yieldRaw * 100).toFixed(2)) : null;
        const name      = (q.longName ?? q.shortName ?? sym) as string;
        const mcB       = mcRaw !== null ? parseFloat((mcRaw / 1e9).toFixed(1)) : null;

        const s: ValueStock = {
          symbol:    sym,
          name,
          price:     price    !== null ? parseFloat(price.toFixed(2))    : null,
          changePct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
          pe:        pe !== null && pe > 0 ? parseFloat(pe.toFixed(1)) : null,
          forwardPe: fp !== null && fp > 0 ? parseFloat(fp.toFixed(1)) : null,
          pb:        pb !== null && pb > 0 ? parseFloat(pb.toFixed(2)) : null,
          divYield,
          marketCap: mcB,
          score:     0,
          isDip:     false,
        };
        s.score = scoreStock(s);
        // Dip = down ≥4% today AND has some value quality (score ≥ 3)
        s.isDip = (changePct ?? 0) <= -4 && s.score >= 3;
        raw[sym] = s;
      }
    }
  } catch { /* return empty if Yahoo is down */ }

  const all        = Object.values(raw);
  const dipAlerts  = all.filter(s => s.isDip).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  // Value picks: scored ≥ 3, not in dip-alert list, sorted by score desc
  const valuePicks = all
    .filter(s => !s.isDip && s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return Response.json({
    valuePicks,
    dipAlerts,
    scanned:   all.length,
    updatedAt: new Date().toISOString(),
  });
}
