export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 45;

import { smartMoneyScore } from "@/app/lib/smartMoney";
import { auth } from "@/auth";

const UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","AMD","NFLX","ORCL",
  "JPM","BAC","GS","V","MA",
  "LLY","UNH","JNJ","PFE","ABBV",
  "XOM","CVX","OXY",
  "WMT","COST","DIS","SHOP","PYPL",
  "SPY","QQQ","IWM",
];

async function fetchQuote(symbol: string) {
  try {
    const res  = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=30d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) return null;

    const q       = result?.indicators?.quote?.[0] ?? {};
    const volumes: number[] = (q.volume ?? []).filter(Boolean);
    const closes: number[]  = (q.close  ?? []).filter(Boolean);
    const price  = meta.regularMarketPrice as number;
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const open   = (meta.regularMarketOpen ?? prev) as number;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    const volume = (meta.regularMarketVolume ?? 0) as number;
    const avgVol = volumes.length >= 5
      ? volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 20)
      : volume;
    // 5-day trend — most important signal input, works even when market is closed
    const base5d   = closes.length >= 6 ? closes.at(-6)! : null;
    const trend5d  = base5d && base5d > 0 ? ((price - base5d) / base5d) * 100 : null;

    return { symbol, price, prev, open, high, low, high52, low52, volume, avgVol, trend5d };
  } catch { return null; }
}

// Yahoo crumb cache — shared across all scan calls in the same Lambda warm instance
let _scanYahooCreds: { cookie: string; crumb: string; expiry: number } | null = null;

async function getScanYahooCreds(): Promise<{ cookie: string; crumb: string } | null> {
  if (_scanYahooCreds && Date.now() < _scanYahooCreds.expiry) return _scanYahooCreds;
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
    _scanYahooCreds = { cookie, crumb, expiry: Date.now() + 5 * 60 * 1000 };
    return _scanYahooCreds;
  } catch { return null; }
}

async function fetchOptionsIV(symbol: string) {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const baseHeaders = { "User-Agent": ua, "Accept": "application/json, text/plain, */*", "Referer": "https://finance.yahoo.com/" };

    async function tryUrl(url: string, extra: Record<string, string> = {}) {
      const res = await fetch(url, { cache: "no-store", headers: { ...baseHeaders, ...extra }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.optionChain?.result?.[0] ?? null;
    }

    // Try crumb-authenticated first, then unauthenticated fallbacks
    const creds = await getScanYahooCreds();
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

    const expiryTs = result.expirationDates?.[0] as number | undefined;
    const expiry   = expiryTs
      ? new Date(expiryTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    const opts  = result.options?.[0];
    const calls = (opts?.calls ?? []) as any[];
    const puts  = (opts?.puts  ?? []) as any[];
    const quotePrice = result.quote?.regularMarketPrice ?? 0;

    const atm = (arr: any[]) =>
      [...arr].sort((a, b) => Math.abs(a.strike - quotePrice) - Math.abs(b.strike - quotePrice))[0];

    const atmCall = atm(calls);
    const atmPut  = atm(puts);
    const iv = (atmCall?.impliedVolatility ?? 0) || (atmPut?.impliedVolatility ?? 0);

    const callWall = calls.reduce((best: any, c: any) =>
      (!best || (c.openInterest ?? 0) > (best.openInterest ?? 0)) ? c : best, null)?.strike ?? null;
    const putWall = puts.reduce((best: any, p: any) =>
      (!best || (p.openInterest ?? 0) > (best.openInterest ?? 0)) ? p : best, null)?.strike ?? null;

    return { iv, expiry, expiryTs, callWall, putWall };
  } catch { return null; }
}

// Exported so the morning-email cron can call it directly (no HTTP round-trip / auth needed)
export async function runOptionsScan() {
  const [quotes, optionsData] = await Promise.all([
    Promise.all(UNIVERSE.map(fetchQuote)),
    Promise.all(UNIVERSE.map(fetchOptionsIV)),
  ]);

  const results: {
    symbol:       string;
    price:        number;
    changePct:    number;
    signal:       "BUY" | "SELL";
    confidence:   "High" | "Medium" | "Low";
    play:         "CALLS" | "PUTS";
    iv:           number | null;
    expiry:       string | null;
    callWall:     number | null;
    putWall:      number | null;
    expectedMove: number | null;
    strike:       string;
    entryZone:    string;
    target:       string;
    stop:         string;
    rrRatio:      string;
    premiumEst:   string | null;
    score:        number;
    hasOptions:   boolean;
  }[] = [];

  for (let i = 0; i < UNIVERSE.length; i++) {
    const q   = quotes[i];
    if (!q) continue;

    const opt = optionsData[i]; // may be null — that's fine

    const changePct = ((q.price - q.prev) / q.prev) * 100;
    const sm = smartMoneyScore(
      {
        price:         q.price,
        previousClose: q.prev,
        open:          q.open,
        high:          q.high,
        low:           q.low,
        volume:        q.volume,
        avgVolume:     q.avgVol,
        high52w:       q.high52,
        low52w:        q.low52,
        changePercent: changePct,
      },
      { trend5dPct: q.trend5d ?? undefined },
    );

    if (sm.signal === "HOLD") continue;

    const ivPct        = opt?.iv ? opt.iv * 100 : null;
    const dailyMove    = ivPct
      ? q.price * (ivPct / 100) * Math.sqrt(1 / 252)
      : q.price * 0.015; // fallback: 1.5% daily move estimate
    const weeklyMove   = dailyMove * Math.sqrt(5);
    const expectedMove = parseFloat(((dailyMove / q.price) * 100).toFixed(2));

    // ── Trade levels ────────────────────────────────────────
    const isBull = sm.signal === "BUY";

    // Entry zone: 0.3% band around current price
    const entryLow  = q.price * (isBull ? 0.997 : 1.001);
    const entryHigh = q.price * (isBull ? 1.003 : 0.999);
    const entryZone = `$${entryLow.toFixed(2)} – $${entryHigh.toFixed(2)}`;

    // Target: 2× weekly move in signal direction
    const targetPrice = isBull ? q.price + weeklyMove * 2 : q.price - weeklyMove * 2;
    const target      = `$${targetPrice.toFixed(2)}`;

    // Stop: 1× weekly move against signal direction
    const stopPrice = isBull ? q.price - weeklyMove : q.price + weeklyMove;
    const stop      = `$${stopPrice.toFixed(2)}`;

    // R:R ratio
    const reward = Math.abs(targetPrice - q.price);
    const risk   = Math.abs(stopPrice   - q.price);
    const rrRatio = `${(reward / risk).toFixed(1)}:1 R:R`;

    // Strike: nearest round number to current price
    const strikeIncrement = q.price > 500 ? 5 : q.price > 100 ? 5 : q.price > 20 ? 2.5 : 1;
    const strikeRaw  = Math.round(q.price / strikeIncrement) * strikeIncrement;
    const strike     = `$${strikeRaw % 1 === 0 ? strikeRaw.toFixed(0) : strikeRaw.toFixed(1)} ATM`;

    // ATM premium estimate per contract — Bachelier approximation: S × (σ/√252) × √DTE × 0.4 × 100
    const dte = opt?.expiryTs ? Math.max(1, Math.ceil((opt.expiryTs * 1000 - Date.now()) / 86_400_000)) : 7;
    const premiumEst = ivPct
      ? `~$${Math.round(q.price * (ivPct / 100) * Math.sqrt(dte / 365) * 0.4 * 100)} / contract`
      : null;

    // Score: signal strength + IV quality (bonus if available) + momentum + confidence
    const normalizedScore = ((sm.score + 20) / 40) * 50;
    const ivScore    = ivPct ? (ivPct >= 25 && ivPct <= 80 ? 30 : ivPct > 80 ? 15 : 5) : 0;
    const momScore   = Math.min(Math.abs(changePct) * 2, 15);
    const confScore  = sm.confidence === "High" ? 10 : sm.confidence === "Medium" ? 5 : 0;
    const score      = normalizedScore + ivScore + momScore + confScore;

    results.push({
      symbol:       q.symbol,
      price:        q.price,
      changePct,
      signal:       sm.signal as "BUY" | "SELL",
      confidence:   sm.confidence,
      play:         isBull ? "CALLS" : "PUTS",
      iv:           ivPct ? parseFloat(ivPct.toFixed(1)) : null,
      expiry:       opt?.expiry ?? null,
      callWall:     opt?.callWall ?? null,
      putWall:      opt?.putWall ?? null,
      expectedMove,
      strike,
      entryZone,
      target,
      stop,
      rrRatio,
      premiumEst,
      score,
      hasOptions:   !!opt?.iv,
    });
  }

  const top20 = results.sort((a, b) => b.score - a.score).slice(0, 20);

  return { plays: top20, scanned: UNIVERSE.length, found: results.length, withIV: results.filter(r => r.hasOptions).length };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runOptionsScan();
  return Response.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
