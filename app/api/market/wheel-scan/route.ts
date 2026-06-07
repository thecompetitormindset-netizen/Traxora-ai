export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

import { auth } from "@/auth";

const WHEEL_UNIVERSE = [
  "NVDA","AMD","TSLA","META","AMZN","GOOGL","MSFT","AAPL","NFLX","COIN",
  "JPM","BAC","GS","C",
  "SMCI","PLTR","MARA","SOFI","IREN",
  "SPY","QQQ","IWM",
  "PYPL","SHOP","CRWD","SNAP","UBER","F","GM",
];

// ── Crumb cache (same pattern as options-scan) ────────────────────────────────

let _creds: { cookie: string; crumb: string; expiry: number } | null = null;

async function getCreds(): Promise<{ cookie: string; crumb: string } | null> {
  if (_creds && Date.now() < _creds.expiry) return _creds;
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const pageRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": ua, "Accept": "text/html,*/*" },
      redirect: "follow", signal: AbortSignal.timeout(8000),
    });
    const setCookie = pageRes.headers.get("set-cookie") ?? "";
    const cookiePairs = [...setCookie.matchAll(/([A-Za-z0-9_-]+=(?:[^;,"\s]|"[^"]*")+)/g)]
      .map(m => m[1])
      .filter(p => !["expires=","path=","domain=","SameSite=","Secure"].some(x => p.startsWith(x)));
    const cookie = cookiePairs.join("; ");
    if (!cookie) return null;
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": ua, "Cookie": cookie }, signal: AbortSignal.timeout(6000),
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 4 || crumb.includes("<")) return null;
    _creds = { cookie, crumb, expiry: Date.now() + 5 * 60 * 1000 };
    return _creds;
  } catch { return null; }
}

// ── Quote fetch ───────────────────────────────────────────────────────────────

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
    const price   = meta.regularMarketPrice as number;
    const prev    = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high52  = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52   = (meta.fiftyTwoWeekLow  ?? price) as number;
    const range52 = high52 - low52;
    const pos52   = range52 > 0 ? Math.round(((price - low52) / range52) * 100) : 50;

    // 20-day historical volatility (annualised)
    let hv20: number | null = null;
    if (closes.length >= 21) {
      const last21  = closes.slice(-21);
      const returns = last21.slice(1).map((c, i) => Math.log(c / last21[i]));
      const mean    = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      hv20 = Math.round(Math.sqrt(variance * 252) * 100);
    }

    return { symbol, price, prev, high52, low52, pos52, hv20, changePct: ((price - prev) / prev) * 100 };
  } catch { return null; }
}

// ── Options fetch (crumb-authenticated) ──────────────────────────────────────

async function fetchWheelOptions(symbol: string) {
  try {
    const ua      = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const headers = { "User-Agent": ua, "Accept": "application/json, text/plain, */*", "Referer": "https://finance.yahoo.com/" };

    async function tryUrl(url: string, extra: Record<string, string> = {}) {
      const res = await fetch(url, { cache: "no-store", headers: { ...headers, ...extra }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.optionChain?.result?.[0] ?? null;
    }

    // Try with crumb first, fall back to unauthenticated
    const creds = await getCreds();
    let result = null;
    if (creds) {
      result = await tryUrl(
        `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(creds.crumb)}`,
        { "Cookie": creds.cookie },
      );
    }
    if (!result) result = await tryUrl(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
    if (!result) result = await tryUrl(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
    if (!result) return null;

    const quotePrice  = (result.quote?.regularMarketPrice ?? 0) as number;
    const expiryDates = (result.expirationDates ?? []) as number[];
    const expiryTs    = expiryDates[0] as number | undefined;
    const opts        = result.options?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const puts  = (opts?.puts  ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (opts?.calls ?? []) as any[];

    if (!quotePrice || !puts.length) return null;

    const dte = expiryTs ? Math.max(1, Math.ceil((expiryTs * 1000 - Date.now()) / 86_400_000)) : 30;

    // ATM IV from the nearest call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const atmCall = [...calls].sort((a: any, b: any) => Math.abs(a.strike - quotePrice) - Math.abs(b.strike - quotePrice))[0];
    const atmIV   = atmCall?.impliedVolatility ? Math.round(atmCall.impliedVolatility * 100) : null;

    // Approximate 30-delta put strike: price × exp(−0.52 × σ × √T)
    const targetStrike = atmIV
      ? Math.round(quotePrice * Math.exp(-0.52 * (atmIV / 100) * Math.sqrt(dte / 365)) / 2.5) * 2.5
      : Math.round(quotePrice * 0.93 / 2.5) * 2.5;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nearestPut = [...puts].sort((a: any, b: any) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];

    const mid        = nearestPut?.bid != null && nearestPut?.ask != null ? (nearestPut.bid + nearestPut.ask) / 2 : null;
    const premiumPct = mid && nearestPut?.strike ? +((mid / nearestPut.strike) * 100).toFixed(2) : null;
    const expiryLabel = expiryTs
      ? new Date(expiryTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    return {
      atmIV,
      dte,
      expiryLabel,
      strike:       nearestPut?.strike ?? targetStrike,
      premium:      mid ? +mid.toFixed(2) : null,
      premiumPct,
      openInterest: (nearestPut?.openInterest ?? null) as number | null,
    };
  } catch { return null; }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function score(
  q: NonNullable<Awaited<ReturnType<typeof fetchQuote>>>,
  o: NonNullable<Awaited<ReturnType<typeof fetchWheelOptions>>>,
): number {
  let s = 0;
  if (o.atmIV) {
    if (o.atmIV >= 40 && o.atmIV <= 70) s += 35;
    else if (o.atmIV >= 30)              s += 25;
    else if (o.atmIV >= 20)              s += 10;
  }
  const spread = o.atmIV && q.hv20 ? o.atmIV - q.hv20 : null;
  if (spread != null) s += spread > 10 ? 20 : spread > 0 ? 10 : 0;
  if (q.pos52 >= 30 && q.pos52 <= 75) s += 20;
  else if (q.pos52 >= 20)              s += 10;
  if (o.premiumPct) {
    if (o.premiumPct >= 3)      s += 20;
    else if (o.premiumPct >= 2) s += 12;
    else if (o.premiumPct >= 1) s += 5;
  }
  if (o.openInterest) s += o.openInterest >= 1000 ? 5 : o.openInterest >= 200 ? 2 : 0;
  return Math.min(Math.round(s), 100);
}

function verdict(sc: number, iv: number | null): string {
  if (sc >= 75) return "Strong candidate";
  if (sc >= 55) return "Good candidate";
  if (sc >= 35) return iv && iv < 20 ? "Low IV — poor premium" : "Marginal";
  return "Avoid";
}

// ── Route ─────────────────────────────────────────────────────────────────────

export type WheelCandidate = {
  symbol: string; price: number; changePct: number; pos52: number;
  hv20: number | null; atmIV: number | null; ivHvSpread: number | null;
  dte: number; expiry: string | null; strike: number;
  premium: number | null; premiumPct: number | null; openInterest: number | null;
  wheelScore: number; verdict: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [quotes, optionsResults] = await Promise.all([
    Promise.all(WHEEL_UNIVERSE.map(fetchQuote)),
    Promise.all(WHEEL_UNIVERSE.map(fetchWheelOptions)),
  ]);

  const candidates: WheelCandidate[] = [];

  for (let i = 0; i < WHEEL_UNIVERSE.length; i++) {
    const q = quotes[i];
    const o = optionsResults[i];
    if (!q || !o) continue;

    const wheelScore  = score(q, o);
    const ivHvSpread  = o.atmIV && q.hv20 ? Math.round(o.atmIV - q.hv20) : null;

    candidates.push({
      symbol: q.symbol, price: +q.price.toFixed(2), changePct: +q.changePct.toFixed(2),
      pos52: q.pos52, hv20: q.hv20, atmIV: o.atmIV, ivHvSpread,
      dte: o.dte, expiry: o.expiryLabel, strike: o.strike,
      premium: o.premium, premiumPct: o.premiumPct, openInterest: o.openInterest,
      wheelScore, verdict: verdict(wheelScore, o.atmIV),
    });
  }

  return Response.json(
    { candidates: candidates.sort((a, b) => b.wheelScore - a.wheelScore), scanned: WHEEL_UNIVERSE.length, withIV: candidates.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
