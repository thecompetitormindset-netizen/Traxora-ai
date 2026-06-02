export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 45;

import { ictScore } from "@/app/lib/ict";
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

    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
    const price  = meta.regularMarketPrice as number;
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    const volume = (meta.regularMarketVolume ?? 0) as number;
    const avgVol = closes.length > 5
      ? closes.slice(-20).reduce((s, c) => s + c, 0) / Math.min(closes.length, 20)
      : volume;

    return { symbol, price, prev, high, low, high52, low52, volume, avgVol };
  } catch { return null; }
}

async function fetchOptionsIV(symbol: string) {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const expiryTs = result.expirationDates?.[0];
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

    return { iv, expiry, callWall, putWall };
  } catch { return null; }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch quotes and options chains in parallel — options are optional
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
    score:        number;
    hasOptions:   boolean;
  }[] = [];

  for (let i = 0; i < UNIVERSE.length; i++) {
    const q   = quotes[i];
    if (!q) continue;

    const opt = optionsData[i]; // may be null — that's fine

    const changePct = ((q.price - q.prev) / q.prev) * 100;
    const ict = ictScore({
      price:         q.price,
      previousClose: q.prev,
      open:          q.prev,
      high:          q.high,
      low:           q.low,
      volume:        q.volume,
      avgVolume:     q.avgVol,
      high52w:       q.high52,
      low52w:        q.low52,
      changePercent: changePct,
    });

    if (ict.signal === "HOLD") continue;

    const ivPct        = opt?.iv ? opt.iv * 100 : null;
    const dailyMove    = ivPct ? (q.price * (ivPct / 100) * Math.sqrt(1 / 252)) : null;
    const expectedMove = dailyMove ? parseFloat(((dailyMove / q.price) * 100).toFixed(2)) : null;

    // Score: ICT signal strength + IV quality (bonus if available) + momentum + confidence
    const normalizedScore = ((ict.score + 20) / 40) * 50;
    const ivScore    = ivPct ? (ivPct >= 25 && ivPct <= 80 ? 30 : ivPct > 80 ? 15 : 5) : 0;
    const momScore   = Math.min(Math.abs(changePct) * 2, 15);
    const confScore  = ict.confidence === "High" ? 10 : ict.confidence === "Medium" ? 5 : 0;
    const score      = normalizedScore + ivScore + momScore + confScore;

    results.push({
      symbol:       q.symbol,
      price:        q.price,
      changePct,
      signal:       ict.signal as "BUY" | "SELL",
      confidence:   ict.confidence,
      play:         ict.signal === "BUY" ? "CALLS" : "PUTS",
      iv:           ivPct ? parseFloat(ivPct.toFixed(1)) : null,
      expiry:       opt?.expiry ?? null,
      callWall:     opt?.callWall ?? null,
      putWall:      opt?.putWall ?? null,
      expectedMove,
      score,
      hasOptions:   !!opt?.iv,
    });
  }

  const top20 = results.sort((a, b) => b.score - a.score).slice(0, 20);

  return Response.json({
    plays:   top20,
    scanned: UNIVERSE.length,
    found:   results.length,
    withIV:  results.filter(r => r.hasOptions).length,
  });
}
