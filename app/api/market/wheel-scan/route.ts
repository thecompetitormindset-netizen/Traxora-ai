export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

import { auth } from "@/auth";

// High-liquidity stocks suitable for the wheel strategy
const WHEEL_UNIVERSE = [
  // High-IV tech
  "NVDA","AMD","TSLA","META","AMZN","GOOGL","MSFT","AAPL","NFLX","COIN",
  // Finance
  "JPM","BAC","GS","C",
  // Semi / growth
  "SMCI","PLTR","MARA","SOFI","IREN",
  // ETFs (low IV but liquid)
  "SPY","QQQ","IWM",
  // Other popular wheel names
  "PYPL","SHOP","CRWD","SNAP","UBER","LYFT","RIVN","F","GM","NIO",
];

async function fetchQuote(symbol: string) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=60d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) return null;

    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
    const price  = meta.regularMarketPrice as number;
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;

    // 52-week position: 0 = at 52-week low, 100 = at 52-week high
    const range52 = high52 - low52;
    const pos52   = range52 > 0 ? Math.round(((price - low52) / range52) * 100) : 50;

    // 20-day historical volatility
    let hv20 = null;
    if (closes.length >= 21) {
      const last21 = closes.slice(-21);
      const returns = last21.slice(1).map((c, i) => Math.log(c / last21[i]));
      const mean    = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      hv20 = Math.round(Math.sqrt(variance * 252) * 100);
    }

    return { symbol, price, prev, high52, low52, pos52, hv20, changePct: ((price - prev) / prev) * 100 };
  } catch { return null; }
}

async function fetchOptionsIV(symbol: string) {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`,
      { cache: "no-store", headers: { "User-Agent": ua, "Referer": "https://finance.yahoo.com/" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const opts  = result.options?.[0];
    const puts  = (opts?.puts  ?? []) as Array<{ strike: number; impliedVolatility: number; bid: number; ask: number; openInterest: number; expiration: number }>;
    const calls = (opts?.calls ?? []) as Array<{ strike: number; impliedVolatility: number; bid: number; ask: number; openInterest: number }>;
    const quotePrice  = result.quote?.regularMarketPrice ?? 0;
    const expiryDates = (result.expirationDates ?? []) as number[];
    const expiryTs    = expiryDates[0];

    if (!quotePrice || !puts.length) return null;

    // ATM IV from calls
    const atmCall = [...calls].sort((a, b) => Math.abs(a.strike - quotePrice) - Math.abs(b.strike - quotePrice))[0];
    const atmIV   = atmCall?.impliedVolatility ? Math.round(atmCall.impliedVolatility * 100) : null;

    // DTE
    const dte = expiryTs ? Math.max(1, Math.ceil((expiryTs * 1000 - Date.now()) / 86_400_000)) : 30;

    // Find ~30 delta put (approximately 0.85 * price for short DTE)
    // Delta ≈ -0.30 corresponds to roughly price * exp(-0.52 * IV * sqrt(T))
    const targetStrike = atmIV
      ? Math.round(quotePrice * Math.exp(-0.52 * (atmIV / 100) * Math.sqrt(dte / 365)) / 2.5) * 2.5
      : Math.round(quotePrice * 0.93 / 2.5) * 2.5;

    const nearestPut = [...puts].sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];

    const midPremium = nearestPut?.bid != null && nearestPut?.ask != null
      ? (nearestPut.bid + nearestPut.ask) / 2
      : null;
    const premiumPct = midPremium && quotePrice
      ? +((midPremium / nearestPut.strike) * 100).toFixed(2)
      : null;

    const expiryLabel = expiryTs
      ? new Date(expiryTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    return {
      atmIV,
      dte,
      expiryLabel,
      targetStrike: nearestPut?.strike ?? targetStrike,
      premium:      midPremium ? +midPremium.toFixed(2) : null,
      premiumPct,
      openInterest: nearestPut?.openInterest ?? null,
    };
  } catch { return null; }
}

export type WheelCandidate = {
  symbol:       string;
  price:        number;
  changePct:    number;
  pos52:        number;
  hv20:         number | null;
  atmIV:        number | null;
  ivHvSpread:   number | null;
  dte:          number;
  expiry:       string | null;
  strike:       number;
  premium:      number | null;
  premiumPct:   number | null;
  openInterest: number | null;
  wheelScore:   number;
  verdict:      string;
};

function scoreCandidate(q: NonNullable<Awaited<ReturnType<typeof fetchQuote>>>, o: NonNullable<Awaited<ReturnType<typeof fetchOptionsIV>>>): number {
  let score = 0;

  // IV quality — sweet spot 30–70%
  if (o.atmIV) {
    if (o.atmIV >= 40 && o.atmIV <= 70) score += 35;
    else if (o.atmIV >= 30)              score += 25;
    else if (o.atmIV >= 20)              score += 10;
  }

  // IV > HV spread (higher = better premium relative to realized vol)
  const spread = o.atmIV && q.hv20 ? o.atmIV - q.hv20 : null;
  if (spread != null) {
    if (spread > 10)      score += 20;
    else if (spread > 0)  score += 10;
    else                  score += 0; // IV < HV — not ideal
  }

  // 52-week position — want stock not at all-time lows (risky assignment)
  if (q.pos52 >= 30 && q.pos52 <= 75) score += 20; // mid-range: not overextended, not collapsing
  else if (q.pos52 >= 20)              score += 10;

  // Premium yield — higher is better for income
  if (o.premiumPct) {
    if (o.premiumPct >= 3)     score += 20;
    else if (o.premiumPct >= 2) score += 12;
    else if (o.premiumPct >= 1) score += 5;
  }

  // Open interest — liquidity check
  if (o.openInterest) {
    if (o.openInterest >= 1000) score += 5;
    else if (o.openInterest >= 200) score += 2;
  }

  return Math.min(Math.round(score), 100);
}

function verdict(score: number, iv: number | null): string {
  if (score >= 75) return "Strong candidate";
  if (score >= 55) return "Good candidate";
  if (score >= 35) return iv && iv < 20 ? "Low IV — poor premium" : "Marginal";
  return "Avoid";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [quotes, optionsResults] = await Promise.all([
    Promise.all(WHEEL_UNIVERSE.map(fetchQuote)),
    Promise.all(WHEEL_UNIVERSE.map(fetchOptionsIV)),
  ]);

  const candidates: WheelCandidate[] = [];

  for (let i = 0; i < WHEEL_UNIVERSE.length; i++) {
    const q = quotes[i];
    const o = optionsResults[i];
    if (!q || !o) continue;

    const spread      = o.atmIV && q.hv20 ? o.atmIV - q.hv20 : null;
    const wheelScore  = scoreCandidate(q, o);

    candidates.push({
      symbol:       q.symbol,
      price:        +q.price.toFixed(2),
      changePct:    +q.changePct.toFixed(2),
      pos52:        q.pos52,
      hv20:         q.hv20,
      atmIV:        o.atmIV,
      ivHvSpread:   spread != null ? Math.round(spread) : null,
      dte:          o.dte,
      expiry:       o.expiryLabel,
      strike:       o.targetStrike,
      premium:      o.premium,
      premiumPct:   o.premiumPct,
      openInterest: o.openInterest,
      wheelScore,
      verdict:      verdict(wheelScore, o.atmIV),
    });
  }

  const sorted = candidates.sort((a, b) => b.wheelScore - a.wheelScore);

  return Response.json(
    { candidates: sorted, scanned: WHEEL_UNIVERSE.length, withIV: candidates.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
