export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 45;

import { smartMoneyScore } from "@/app/lib/smartMoney";
import { auth } from "@/auth";

function fmtPrice(p: number): string {
  const decimals = p < 1 ? 4 : p < 10 ? 3 : 2;
  return p.toFixed(decimals);
}

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

// CBOE delayed quotes — free, no API key, real IV, 15-min delay
// iv returned as decimal (0.37 = 37%), same scale as Yahoo impliedVolatility
async function fetchOptionsIV(symbol: string) {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.cboe.com/",
          "Accept":  "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json())?.data;
    if (!data?.current_price || !Array.isArray(data.options)) return null;

    const stockPrice: number = data.current_price;
    const symLen = symbol.length;
    const today  = new Date().toISOString().split("T")[0];

    function parseOpt(name: string): { expiry: string; type: "C" | "P"; strike: number } | null {
      const body = name.slice(symLen);
      const m = /^(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(body);
      if (!m) return null;
      return { expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4] as "C" | "P", strike: parseInt(m[5], 10) / 1000 };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = (data.options as any[]).reduce<{ expiry: string; type: "C"|"P"; strike: number; raw: any }[]>((acc, opt) => {
      const p = parseOpt(opt.option as string);
      if (p && p.expiry > today) acc.push({ ...p, raw: opt });
      return acc;
    }, []);
    if (!parsed.length) return null;

    const expiries  = [...new Set(parsed.map(o => o.expiry))].sort();
    const nowMs     = Date.now();

    // Prefer 21+ DTE for directional plays — near-expiry options decay too fast.
    // Fall back to 14+ DTE, then nearest as a last resort.
    const chosenExp =
      expiries.find(e => new Date(e + "T20:00:00Z").getTime() - nowMs >= 21 * 86_400_000) ??
      expiries.find(e => new Date(e + "T20:00:00Z").getTime() - nowMs >= 14 * 86_400_000) ??
      expiries[0];

    const nearContracts = parsed.filter(o => o.expiry === chosenExp);
    const expiryTs    = Math.floor(new Date(chosenExp + "T20:00:00Z").getTime() / 1000);
    const dte         = Math.max(1, Math.ceil((expiryTs * 1000 - nowMs) / 86_400_000));
    const expiry      = new Date(chosenExp + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const calls = nearContracts.filter(o => o.type === "C");
    const puts  = nearContracts.filter(o => o.type === "P");

    // ATM IV (decimal): nearest call and put with iv > 0
    const atmCall = [...calls]
      .filter(o => (o.raw.iv as number) > 0)
      .sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    const atmPutCand = [...puts]
      .filter(o => (o.raw.iv as number) > 0)
      .sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    const iv = (atmCall?.raw.iv as number) || (atmPutCand?.raw.iv as number) || 0;

    const atmStrike  = atmCall?.strike ?? atmPutCand?.strike ?? null;
    const atmCallMid = atmCall && (atmCall.raw.bid as number) > 0 && (atmCall.raw.ask as number) > 0
      ? ((atmCall.raw.bid as number) + (atmCall.raw.ask as number)) / 2
      : null;
    const atmPutMid  = atmPutCand && (atmPutCand.raw.bid as number) > 0 && (atmPutCand.raw.ask as number) > 0
      ? ((atmPutCand.raw.bid as number) + (atmPutCand.raw.ask as number)) / 2
      : null;

    const callWall = calls.reduce((best: typeof calls[0] | null, c) =>
      !best || (c.raw.open_interest ?? 0) > (best.raw.open_interest ?? 0) ? c : best, null
    )?.strike ?? null;
    const putWall = puts.reduce((best: typeof puts[0] | null, p) =>
      !best || (p.raw.open_interest ?? 0) > (best.raw.open_interest ?? 0) ? p : best, null
    )?.strike ?? null;

    const totalCallVol = calls.reduce((s, c) => s + ((c.raw.volume as number) ?? 0), 0);
    const totalPutVol  = puts.reduce((s,  p) => s + ((p.raw.volume as number) ?? 0), 0);
    const pcVolRatio   = totalCallVol > 0 ? parseFloat((totalPutVol / totalCallVol).toFixed(2)) : null;

    return { iv, expiry, expiryTs, dte, callWall, putWall, atmStrike, atmCallMid, atmPutMid, totalCallVol, totalPutVol, pcVolRatio };
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
    pcVolRatio:   number | null;
    score:        number;
    hasOptions:   boolean;
    dte:          number | null;
    dteWarning:   boolean;
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
    const isBull      = sm.signal === "BUY";
    const finalSignal = sm.signal as "BUY" | "SELL";
    const finalConfidence = sm.confidence;

    // Entry zone: 0.3% band around current price
    const entryLow  = q.price * (isBull ? 0.997 : 1.001);
    const entryHigh = q.price * (isBull ? 1.003 : 0.999);
    const entryZone = `$${fmtPrice(entryLow)} – $${fmtPrice(entryHigh)}`;

    // Target: 2× weekly move in signal direction
    const targetPrice = isBull ? q.price + weeklyMove * 2 : q.price - weeklyMove * 2;
    const target      = `$${fmtPrice(targetPrice)}`;

    // Stop: 1× weekly move against signal direction
    const stopPrice = isBull ? q.price - weeklyMove : q.price + weeklyMove;
    const stop      = `$${fmtPrice(stopPrice)}`;

    // R:R ratio
    const reward = Math.abs(targetPrice - q.price);
    const risk   = Math.abs(stopPrice   - q.price);
    const rrRatio = `${(reward / risk).toFixed(1)}:1 R:R`;

    // Strike: use actual ATM strike from CBOE chain, fall back to nearest round number
    const strikeIncrement = q.price > 500 ? 5 : q.price > 100 ? 5 : q.price > 20 ? 2.5 : 1;
    const strikeRaw  = opt?.atmStrike ?? Math.round(q.price / strikeIncrement) * strikeIncrement;
    const strike     = `$${strikeRaw % 1 === 0 ? strikeRaw.toFixed(0) : strikeRaw.toFixed(1)} ATM`;

    // ATM premium: real bid/ask mid from CBOE chain; Bachelier approximation as fallback
    const dte        = opt?.dte ?? (opt?.expiryTs ? Math.max(1, Math.ceil((opt.expiryTs * 1000 - Date.now()) / 86_400_000)) : null);
    const dteWarning = dte !== null && dte < 14;
    const dteForCalc = dte ?? 7;
    const actualMid  = isBull ? opt?.atmCallMid : opt?.atmPutMid;
    const premiumEst = actualMid
      ? `~$${Math.round(actualMid * 100)} / contract`
      : (ivPct ? `~$${Math.round(q.price * (ivPct / 100) * Math.sqrt(dteForCalc / 365) * 0.4 * 100)} / contract` : null);

    // Score: signal strength + IV quality (bonus if available) + momentum + confidence
    const normalizedScore = ((sm.score + 20) / 40) * 50;
    const ivScore    = ivPct ? (ivPct >= 25 && ivPct <= 80 ? 30 : ivPct > 80 ? 15 : 5) : 0;
    const momScore   = Math.min(Math.abs(changePct) * 2, 15);
    const confScore  = finalConfidence === "High" ? 10 : finalConfidence === "Medium" ? 5 : 0;
    const score      = normalizedScore + ivScore + momScore + confScore;

    results.push({
      symbol:       q.symbol,
      price:        q.price,
      changePct,
      signal:       finalSignal,
      confidence:   finalConfidence,
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
      pcVolRatio:   opt?.pcVolRatio ?? null,
      score,
      hasOptions:   !!opt?.iv,
      dte,
      dteWarning,
    });
  }

  // Hard gates — only surface plays that meet all three criteria:
  // 1. High confidence (score ≥ 7 in smartMoneyScore — trend + day + volume all aligned)
  // 2. Real CBOE IV data available (no price-based estimates)
  // 3. At least 14 DTE so theta decay doesn't wipe the premium
  const premium = results.filter(r =>
    r.confidence === "High" &&
    r.hasOptions &&
    r.dte !== null && r.dte >= 14
  ).sort((a, b) => b.score - a.score).slice(0, 10);

  return { plays: premium, scanned: UNIVERSE.length, found: results.length, withIV: results.filter(r => r.hasOptions).length };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runOptionsScan();
  return Response.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
