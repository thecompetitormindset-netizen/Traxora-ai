export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 45;

import { smartMoneyScore, computeCanonicalTrade, type SmScore } from "@/app/lib/smartMoney";
import { checkQuoteSanity, resolvePreviousClose } from "@/app/lib/quoteSanity";
import { computeOptionRR, type OptionRRResult } from "@/app/lib/optionsRR";
import { evaluatePreTradeChecks, type PreTradeFlag } from "@/app/lib/preTradeChecks";
import { auth } from "@/auth";

function calcClosesEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

// Same EMA used above but windowed for point-in-time backtest use.
function emaAt(closes: number[], upto: number, period: number): number | null {
  return calcClosesEMA(closes.slice(0, upto + 1), period);
}

const UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","AMD","NFLX","ORCL",
  "JPM","BAC","GS","V","MA",
  "LLY","UNH","JNJ","PFE","ABBV",
  "XOM","CVX","OXY",
  "WMT","COST","DIS","SHOP","PYPL",
  "SPY","QQQ","IWM",
];

const BACKTEST_WARMUP  = 55;  // needs ema50 (50) + trend5d (5) headroom
const BACKTEST_FORWARD = 14;  // days ahead — matches the 14+ DTE gate below

async function fetchQuote(symbol: string) {
  try {
    const res  = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta?.regularMarketPrice) return null;

    const q       = result?.indicators?.quote?.[0] ?? {};
    const isNum   = (v: unknown): v is number => typeof v === "number";
    const volumes: number[] = (q.volume ?? []).filter(isNum);
    const closes:  number[] = (q.close  ?? []).filter(isNum);
    const highs:   number[] = (q.high   ?? []).filter(isNum);
    const lows:    number[] = (q.low    ?? []).filter(isNum);
    const price  = meta.regularMarketPrice as number;
    // Previous SESSION close. Never meta.chartPreviousClose — for range=1y that
    // is a price from a year ago, which is what rendered OXY as +32.62% in a
    // single session and inflated its momentum score to #1.
    const prev   = resolvePreviousClose(meta, closes);
    const open   = (meta.regularMarketOpen ?? prev ?? price) as number;
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

    // EMA alignment — identical computation to ai/analyze so both routes score identically
    const ema20val = calcClosesEMA(closes, 20);
    const ema50val = calcClosesEMA(closes, 50);
    const emaAlignment: "bullish" | "bearish" | "neutral" | null =
      ema20val != null && ema50val != null
        ? (price > ema20val && ema20val > ema50val ? "bullish"
          : price < ema20val && ema20val < ema50val ? "bearish"
          : "neutral")
        : null;

    const name = (meta.shortName ?? meta.longName ?? symbol) as string;
    return { symbol, name, price, prev, open, high, low, high52, low52, volume, avgVol, trend5d, emaAlignment, closes, highs, lows, volumes };
  } catch { return null; }
}

// ── Point-in-time signal + walk-forward backtest ───────────────────────────────
// Same principle as the crypto direction backtest: replay this exact scoring
// logic across the stock's own trailing ~1y of daily bars, using only data
// available up to each point (no lookahead), then check what price actually
// did over the next BACKTEST_FORWARD days (matched to the 14+ DTE preference
// below). This validates the DIRECTIONAL call an options play depends on —
// not a simulation of the option's own premium/theta/IV path, which isn't
// possible without historical chain data. If the direction is unreliable,
// the specific strike matters far less.

function signalAt(
  i: number, closes: number[], highs: number[], lows: number[], vols: number[],
): SmScore | null {
  if (i < 21 || i >= closes.length) return null;
  const price = closes[i], previousClose = closes[i - 1];
  if (!(previousClose > 0)) return null;
  const changePercent = ((price - previousClose) / previousClose) * 100;
  const trend5dPct = i >= 5 && closes[i - 5] > 0 ? ((price - closes[i - 5]) / closes[i - 5]) * 100 : null;
  const volSlice = vols.slice(Math.max(0, i - 20), i);
  const avgVolume = volSlice.length >= 15 ? volSlice.reduce((s, v) => s + v, 0) / volSlice.length : null;
  const windowStart = Math.max(0, i - 365);
  const highWindow = highs.slice(windowStart, i + 1), lowWindow = lows.slice(windowStart, i + 1);
  const ema20 = emaAt(closes, i, 20), ema50 = emaAt(closes, i, 50);
  const emaAlignment: "bullish" | "bearish" | "neutral" | null =
    ema20 != null && ema50 != null
      ? (price > ema20 && ema20 > ema50 ? "bullish" : price < ema20 && ema20 < ema50 ? "bearish" : "neutral")
      : null;

  return smartMoneyScore(
    {
      price, previousClose,
      open: null, high: highs[i] ?? null, low: lows[i] ?? null,
      volume: vols[i] ?? null, avgVolume,
      high52w: highWindow.length >= 250 ? Math.max(...highWindow) : null,
      low52w:  lowWindow.length  >= 250 ? Math.min(...lowWindow)  : null,
      changePercent,
    },
    { trend5dPct, emaAlignment },
  );
}

type BacktestStats = {
  count: number; hitRate: number | null; avgReturn: number | null; baselineAvgReturn: number | null;
};

function backtestDirection(closes: number[], highs: number[], lows: number[], vols: number[], direction: "BUY" | "SELL"): BacktestStats {
  const returns: number[] = [], allReturns: number[] = [];
  const last = closes.length - 1 - BACKTEST_FORWARD;
  for (let i = BACKTEST_WARMUP; i <= last; i++) {
    const fwd = closes[i] > 0 ? ((closes[i + BACKTEST_FORWARD] - closes[i]) / closes[i]) * 100 : null;
    if (fwd === null) continue;
    allReturns.push(fwd);
    const sm = signalAt(i, closes, highs, lows, vols);
    if (!sm || sm.signal !== direction) continue;
    returns.push(fwd);
  }
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  const avgReturn = avg(returns);
  const hit = direction === "BUY" ? returns.filter(r => r > 0).length : returns.filter(r => r < 0).length;
  return {
    count: returns.length,
    hitRate: returns.length > 0 ? Math.round((hit / returns.length) * 1000) / 10 : null,
    avgReturn: avgReturn !== null ? Math.round(avgReturn * 100) / 100 : null,
    baselineAvgReturn: avg(allReturns) !== null ? Math.round(avg(allReturns)! * 100) / 100 : null,
  };
}

// CBOE delayed quotes — free, no API key, real IV + Greeks, 15-min delay
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

    // ATM IV (decimal): nearest call and put with iv > 0 AND a real quoted market
    // (0DTE/expired-looking contracts can carry nonsense IV with no real bid/ask).
    const hasRealQuote = (o: { raw: { bid?: number; ask?: number } }) => (o.raw.bid ?? 0) > 0 && (o.raw.ask ?? 0) > 0;
    const atmCall = [...calls]
      .filter(o => (o.raw.iv as number) > 0 && hasRealQuote(o))
      .sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    const atmPutCand = [...puts]
      .filter(o => (o.raw.iv as number) > 0 && hasRealQuote(o))
      .sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    const iv = (atmCall?.raw.iv as number) || (atmPutCand?.raw.iv as number) || 0;

    const atmStrike  = atmCall?.strike ?? atmPutCand?.strike ?? null;
    const atmCallMid = atmCall && (atmCall.raw.bid as number) > 0 && (atmCall.raw.ask as number) > 0
      ? ((atmCall.raw.bid as number) + (atmCall.raw.ask as number)) / 2
      : null;
    const atmPutMid  = atmPutCand && (atmPutCand.raw.bid as number) > 0 && (atmPutCand.raw.ask as number) > 0
      ? ((atmPutCand.raw.bid as number) + (atmPutCand.raw.ask as number)) / 2
      : null;
    // Real chain-supplied delta — same field options-chain/route.ts already trusts.
    // Not a Black-Scholes estimate.
    const atmCallDelta = typeof atmCall?.raw.delta === "number" ? atmCall.raw.delta : null;
    const atmPutDelta  = typeof atmPutCand?.raw.delta === "number" ? atmPutCand.raw.delta : null;
    // Theta and the quoted market — needed to price the friction the contract
    // pays, which the stock-derived R:R never accounted for.
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const atmCallTheta = num(atmCall?.raw.theta);
    const atmPutTheta  = num(atmPutCand?.raw.theta);
    const atmCallBid   = num(atmCall?.raw.bid);
    const atmCallAsk   = num(atmCall?.raw.ask);
    const atmPutBid    = num(atmPutCand?.raw.bid);
    const atmPutAsk    = num(atmPutCand?.raw.ask);

    const callWall = calls.reduce((best: typeof calls[0] | null, c) =>
      !best || (c.raw.open_interest ?? 0) > (best.raw.open_interest ?? 0) ? c : best, null
    )?.strike ?? null;
    const putWall = puts.reduce((best: typeof puts[0] | null, p) =>
      !best || (p.raw.open_interest ?? 0) > (best.raw.open_interest ?? 0) ? p : best, null
    )?.strike ?? null;

    const totalCallVol = calls.reduce((s, c) => s + ((c.raw.volume as number) ?? 0), 0);
    const totalPutVol  = puts.reduce((s,  p) => s + ((p.raw.volume as number) ?? 0), 0);
    const pcVolRatio   = totalCallVol > 0 ? parseFloat((totalPutVol / totalCallVol).toFixed(2)) : null;

    return {
      iv, expiry, expiryTs, dte, callWall, putWall, atmStrike, atmCallMid, atmPutMid,
      atmCallDelta, atmPutDelta, atmCallTheta, atmPutTheta,
      atmCallBid, atmCallAsk, atmPutBid, atmPutAsk,
      totalCallVol, totalPutVol, pcVolRatio,
    };
  } catch { return null; }
}

// Calendar events for the automated pre-trade checks. Same quoteSummary module
// the earnings route already uses; returns unix seconds.
async function fetchCalendar(symbol: string): Promise<{ earningsTs: number | null; exDividendTs: number | null }> {
  const empty = { earningsTs: null, exDividendTs: null };
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return empty;
    const events = (await res.json())?.quoteSummary?.result?.[0]?.calendarEvents;
    const raw = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const dates = events?.earnings?.earningsDate;
    return {
      earningsTs:   Array.isArray(dates) && dates.length > 0 ? raw(dates[0]?.raw) : null,
      exDividendTs: raw(events?.exDividendDate?.raw),
    };
  } catch { return empty; }
}

// Exported so the morning-email cron can call it directly (no HTTP round-trip / auth needed)
export async function runOptionsScan() {
  const [quotes, optionsData, calendars] = await Promise.all([
    Promise.all(UNIVERSE.map(fetchQuote)),
    Promise.all(UNIVERSE.map(fetchOptionsIV)),
    Promise.all(UNIVERSE.map(fetchCalendar)),
  ]);

  // Quotes rejected by the plausibility gate — surfaced so a data outage is
  // visible rather than silently shrinking the scan.
  const suspect: { symbol: string; reason: string }[] = [];

  const results: {
    symbol:       string;
    name:         string;
    price:        number;
    changePct:    number;
    signal:       "BUY" | "SELL";
    confidence:   "High" | "Medium" | "Low";
    play:         "CALLS" | "PUTS";
    iv:           number | null;
    delta:        number | null;
    expiry:       string | null;
    callWall:     number | null;
    putWall:      number | null;
    expectedMove: number | null;
    strike:       string;
    entryZone:    string;
    target:       string;
    stop:         string;
    /** R:R of the instrument on the card — the contract, net of friction. */
    rrRatio:      string;
    /** R:R of the stock leg, for the shares-instead comparison. */
    equityRrRatio: string;
    /** Which instrument rrRatio describes. */
    rrBasis:      "option" | "equity";
    optionRR:     number | null;
    equityRR:     number | null;
    thetaCost:    number | null;
    spreadCost:   number | null;
    holdingDays:  number | null;
    recommendShares: boolean;
    /** Underlying levels, so the client sizes from the same numbers. */
    entryMid:     number;
    stopRaw:      number;
    riskPerContract: number | null;
    preTradeFlags: PreTradeFlag[];
    premiumEst:   string | null;
    premiumPerContract: number | null;
    premiumReal:  boolean;
    pcVolRatio:   number | null;
    score:        number;
    hasOptions:   boolean;
    dte:          number | null;
    dteWarning:   boolean;
    backtest:     BacktestStats | null;
  }[] = [];

  for (let i = 0; i < UNIVERSE.length; i++) {
    const q   = quotes[i];
    if (!q) continue;

    const opt = optionsData[i]; // may be null — that's fine

    // Plausibility gate BEFORE scoring: a bogus percent change feeds the
    // momentum term of the score, so a bad quote corrupts the whole ranking,
    // not just its own card. Every name in UNIVERSE is a large cap or a major
    // index ETF, so the 20% single-session gate applies to all of them.
    const sanity = checkQuoteSanity({ symbol: q.symbol, price: q.price, previousClose: q.prev, isLargeCap: true });
    if (!sanity.ok) {
      console.error(`[options-scan] suspect quote excluded from ranking — ${sanity.reason}`);
      suspect.push({ symbol: q.symbol, reason: sanity.reason });
      continue;
    }
    const changePct = sanity.changePct;
    const prevClose = q.prev as number;

    const sm = smartMoneyScore(
      {
        price:         q.price,
        previousClose: prevClose,
        open:          q.open,
        high:          q.high,
        low:           q.low,
        volume:        q.volume,
        avgVolume:     q.avgVol,
        high52w:       q.high52,
        low52w:        q.low52,
        changePercent: changePct,
      },
      { trend5dPct: q.trend5d ?? undefined, emaAlignment: q.emaAlignment },
    );

    if (sm.signal === "HOLD") continue;

    const ivPct        = opt?.iv ? opt.iv * 100 : null;
    const dailyMove    = ivPct
      ? q.price * (ivPct / 100) * Math.sqrt(1 / 252)
      : q.price * 0.015; // fallback: 1.5% daily move estimate (display only)
    const expectedMove = parseFloat(((dailyMove / q.price) * 100).toFixed(2));

    const finalSignal     = sm.signal as "BUY" | "SELL";
    const finalConfidence = sm.confidence;

    // ── Canonical trade levels — same computation as analyze(); no local math ──
    // These are UNDERLYING STOCK levels (where the stock needs to go), not the
    // option's own premium levels — the UI must label them as such.
    const canonTrade = computeCanonicalTrade(sm, q.price);
    if (!canonTrade) continue;

    const isBull = finalSignal === "BUY";

    // Strike: use actual ATM strike from CBOE chain, fall back to nearest round number
    const strikeIncrement = q.price > 500 ? 5 : q.price > 100 ? 5 : q.price > 20 ? 2.5 : 1;
    const strikeRaw  = opt?.atmStrike ?? Math.round(q.price / strikeIncrement) * strikeIncrement;
    const strike     = `$${strikeRaw % 1 === 0 ? strikeRaw.toFixed(0) : strikeRaw.toFixed(1)} ATM`;
    const delta      = isBull ? opt?.atmCallDelta ?? null : opt?.atmPutDelta ?? null;

    const dte        = opt?.dte ?? (opt?.expiryTs ? Math.max(1, Math.ceil((opt.expiryTs * 1000 - Date.now()) / 86_400_000)) : null);
    const dteWarning = dte !== null && dte < 14;
    const dteForCalc = dte ?? 7;
    const actualMid  = isBull ? opt?.atmCallMid : opt?.atmPutMid;
    const premiumReal = actualMid !== null && actualMid !== undefined;
    const premiumPerContract = premiumReal
      ? Math.round(actualMid! * 100)
      : (ivPct ? Math.round(q.price * (ivPct / 100) * Math.sqrt(dteForCalc / 365) * 0.4 * 100) : null);
    const premiumEst = premiumPerContract !== null
      ? `~$${premiumPerContract} / contract${premiumReal ? "" : " (est.)"}`
      : null;

    // ── R:R on the instrument actually being traded ───────────────────────────
    // canonTrade's ratio describes the STOCK leg. The card offers a contract, so
    // it must show the contract's own ratio, net of theta over the expected hold
    // and the bid-ask round trip. The stock ratio is kept alongside it so the
    // card can recommend shares when friction has eaten the option's edge.
    const theta = isBull ? opt?.atmCallTheta ?? null : opt?.atmPutTheta ?? null;
    const bid   = isBull ? opt?.atmCallBid   ?? null : opt?.atmPutBid   ?? null;
    const ask   = isBull ? opt?.atmCallAsk   ?? null : opt?.atmPutAsk   ?? null;

    const rr: OptionRRResult | null =
      delta !== null && premiumPerContract !== null
        ? computeOptionRR({
            entry:  canonTrade.entryMid,
            stop:   canonTrade.stopRaw,
            target: canonTrade.targetRaw,
            delta,
            dte: dteForCalc,
            premiumPerContract,
            theta,
            bid,
            ask,
            expectedDailyMove: dailyMove,
          })
        : null;

    // Automated pre-trade calendar checks — no longer the user's job to remember.
    const preTradeFlags: PreTradeFlag[] = evaluatePreTradeChecks({
      earningsTs:   calendars[i]?.earningsTs ?? null,
      exDividendTs: calendars[i]?.exDividendTs ?? null,
      expiryTs:     opt?.expiryTs ?? null,
      hasShortLeg:  false, // long single-leg calls/puts only in this scan
    });

    // Score: signal strength + IV quality (bonus if available) + momentum + confidence
    const normalizedScore = ((sm.score + 20) / 40) * 50;
    const ivScore    = ivPct ? (ivPct >= 25 && ivPct <= 80 ? 30 : ivPct > 80 ? 15 : 5) : 0;
    const momScore   = Math.min(Math.abs(changePct) * 2, 15);
    const confScore  = finalConfidence === "High" ? 10 : finalConfidence === "Medium" ? 5 : 0;
    const score      = normalizedScore + ivScore + momScore + confScore;

    // Runtime invariant: direction must match signal — never diverge.
    const play = finalSignal === "BUY" ? "CALLS" : "PUTS";
    if (process.env.NODE_ENV !== "production") {
      if ((play === "CALLS") !== (finalSignal === "BUY")) {
        throw new Error(`[options-scan] Invariant: ${q.symbol} play=${play} signal=${finalSignal}`);
      }
    }

    const backtest = q.closes.length >= BACKTEST_WARMUP + BACKTEST_FORWARD + 10
      ? backtestDirection(q.closes, q.highs, q.lows, q.volumes, finalSignal)
      : null;

    results.push({
      symbol:       q.symbol,
      name:         q.name,
      price:        q.price,
      changePct,
      signal:       finalSignal,
      confidence:   finalConfidence,
      play,
      iv:           ivPct ? parseFloat(ivPct.toFixed(1)) : null,
      delta:        delta !== null ? parseFloat(delta.toFixed(3)) : null,
      expiry:       opt?.expiry ?? null,
      callWall:     opt?.callWall ?? null,
      putWall:      opt?.putWall ?? null,
      expectedMove,
      strike,
      entryZone:    canonTrade.entryZone,
      target:       canonTrade.targetFmt,
      stop:         canonTrade.stopFmt,
      // When the chain gives us delta and a real premium, the card's ratio is
      // the contract's. Without them we fall back to the stock ratio and label
      // it as such rather than passing a stock number off as the contract's.
      rrRatio:      rr ? `${rr.optionRR.toFixed(1)}:1 R:R` : `${canonTrade.rrNum}:1 R:R`,
      equityRrRatio: rr ? `${rr.equityRR.toFixed(1)}:1` : `${canonTrade.rrNum}:1`,
      rrBasis:      rr ? "option" : "equity",
      optionRR:     rr ? parseFloat(rr.optionRR.toFixed(2)) : null,
      equityRR:     rr ? parseFloat(rr.equityRR.toFixed(2)) : null,
      thetaCost:    rr ? Math.round(rr.thetaCost)  : null,
      spreadCost:   rr ? Math.round(rr.spreadCost) : null,
      holdingDays:  rr ? rr.holdingDays : null,
      recommendShares: rr?.recommendShares ?? false,
      entryMid:     canonTrade.entryMid,
      stopRaw:      canonTrade.stopRaw,
      riskPerContract: rr ? parseFloat(rr.optionRisk.toFixed(2)) : null,
      preTradeFlags,
      premiumEst,
      premiumPerContract,
      premiumReal,
      pcVolRatio:   opt?.pcVolRatio ?? null,
      score,
      hasOptions:   !!opt?.iv,
      dte,
      dteWarning,
      backtest,
    });
  }

  // Hard gates — only surface plays that meet all criteria.
  // No count cap: some days there are 0, some days 6, depends on the market.
  // 1. High confidence (smartMoneyScore ≥ 7 — trend + day + volume all aligned)
  // 2. Real CBOE IV data (no price-based estimates)
  // 3. Real bid/ask premium (not the Bachelier fallback estimate)
  // 4. At least 14 DTE (near-expiry options decay too fast for directional plays)
  const premium = results.filter(r =>
    r.confidence === "High" &&
    r.hasOptions &&
    r.premiumReal &&
    r.dte !== null && r.dte >= 14
  ).sort((a, b) => b.score - a.score);

  return {
    plays: premium,
    scanned: UNIVERSE.length,
    found: results.length,
    withIV: results.filter(r => r.hasOptions).length,
    suspect,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runOptionsScan();
  return Response.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
