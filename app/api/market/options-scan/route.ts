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
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) },
    );
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) return null;

    const closes: number[] = result?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    const price   = meta.regularMarketPrice as number;
    const prev    = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high    = (meta.regularMarketDayHigh ?? price) as number;
    const low     = (meta.regularMarketDayLow  ?? price) as number;
    const high52  = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52   = (meta.fiftyTwoWeekLow  ?? price) as number;
    const volume  = (meta.regularMarketVolume ?? 0) as number;
    const avgVol  = closes.length > 1
      ? closes.slice(-20).reduce((s, c) => s + c, 0) / Math.min(closes.length, 20)
      : volume;

    return { symbol, price, prev, high, low, high52, low52, volume, avgVol, closes };
  } catch { return null; }
}

async function fetchOptionsIV(symbol: string): Promise<{ iv: number; expiry: string; callWall: number; putWall: number } | null> {
  try {
    const res  = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) },
    );
    const data    = await res.json();
    const result  = data?.optionChain?.result?.[0];
    if (!result) return null;

    const expiryTs = result.expirationDates?.[0];
    if (!expiryTs) return null;
    const expiry = new Date(expiryTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const opts  = result.options?.[0];
    const calls = (opts?.calls ?? []) as any[];
    const puts  = (opts?.puts  ?? []) as any[];
    if (!calls.length && !puts.length) return null;

    const price = result.quote?.regularMarketPrice ?? 0;
    const atm   = (arr: any[]) => [...arr].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price))[0];
    const atmCall = atm(calls);
    const atmPut  = atm(puts);
    const iv = atmCall?.impliedVolatility || atmPut?.impliedVolatility || 0;

    // Find max OI walls
    const callWall = calls.reduce((best: any, c: any) => (!best || (c.openInterest ?? 0) > (best.openInterest ?? 0)) ? c : best, null)?.strike ?? 0;
    const putWall  = puts.reduce((best: any, p: any) => (!best || (p.openInterest ?? 0) > (best.openInterest ?? 0)) ? p : best, null)?.strike ?? 0;

    return { iv, expiry, callWall, putWall };
  } catch { return null; }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all quotes + options in parallel
  const [quotes, optionsData] = await Promise.all([
    Promise.all(UNIVERSE.map(fetchQuote)),
    Promise.all(UNIVERSE.map(fetchOptionsIV)),
  ]);

  const results: {
    symbol:     string;
    price:      number;
    changePct:  number;
    signal:     "BUY" | "SELL" | "HOLD";
    confidence: "High" | "Medium" | "Low";
    play:       "CALLS" | "PUTS" | null;
    iv:         number;
    expiry:     string;
    callWall:   number;
    putWall:    number;
    expectedMove: number;
    score:      number;
  }[] = [];

  for (let i = 0; i < UNIVERSE.length; i++) {
    const q   = quotes[i];
    const opt = optionsData[i];
    if (!q || !opt || opt.iv <= 0) continue;

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

    const signal     = ict.signal;
    const confidence = ict.confidence;
    if (signal === "HOLD") continue;

    const ivPct      = opt.iv * 100;
    const dailyMove  = (q.price * opt.iv * Math.sqrt(1 / 252));
    const expectedMove = (dailyMove / q.price) * 100;

    // Score: ict score (0-20 range) + good IV range (25-80%) + momentum + confidence
    const normalizedScore = ((ict.score + 20) / 40) * 40; // normalize score to 0-40
    const ivScore    = ivPct >= 25 && ivPct <= 80 ? 30 : ivPct > 80 ? 15 : 5;
    const momScore   = Math.min(Math.abs(changePct) * 2, 20);
    const confScore  = confidence === "High" ? 10 : confidence === "Medium" ? 5 : 0;
    const score      = normalizedScore + ivScore + momScore + confScore;

    results.push({
      symbol:    q.symbol,
      price:     q.price,
      changePct,
      signal,
      confidence,
      play:      signal === "BUY" ? "CALLS" : "PUTS",
      iv:        parseFloat(ivPct.toFixed(1)),
      expiry:    opt.expiry,
      callWall:  opt.callWall,
      putWall:   opt.putWall,
      expectedMove: parseFloat(expectedMove.toFixed(2)),
      score,
    });
  }

  const top20 = results
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return Response.json({ plays: top20, scanned: UNIVERSE.length, found: results.length });
}
