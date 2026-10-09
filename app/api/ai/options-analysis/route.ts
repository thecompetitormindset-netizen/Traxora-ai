import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { smartMoneyScore } from "@/app/lib/smartMoney";

export const runtime     = "nodejs";
export const maxDuration = 55;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type OptionContract = {
  contractSymbol:    string;
  strike:            number;
  lastPrice:         number;
  bid:               number;
  ask:               number;
  volume?:           number;
  openInterest?:     number;
  impliedVolatility: number;
  inTheMoney:        boolean;
  // Real chain-supplied Greeks (same field CBOE gives options-chain/route.ts) —
  // preferred over the Black-Scholes estimate below whenever CBOE has them.
  delta?:            number | null;
  gamma?:            number | null;
  theta?:            number | null;
};

// ── Black-Scholes ATM Greeks ───────────────────────────────────────────────
// Abramowitz & Stegun normal CDF approximation (max error 7.5e-8)
function normCDF(x: number): number {
  if (x < -8) return 0;
  if (x >  8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const n = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) * p;
  return x >= 0 ? 1 - n : n;
}
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

type BSGreeks = { delta: number; gamma: number; thetaPerDay: number };

function bsGreeks(S: number, K: number, T: number, sigma: number, isCall: boolean): BSGreeks | null {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return null;
  const r = 0.05; // approximate risk-free rate
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  // theta in dollars per day (annualised / 365)
  const theta = (-(S * sigma * normPDF(d1)) / (2 * sqrtT)
    - r * K * Math.exp(-r * T) * (isCall ? normCDF(d2) : normCDF(-d2))) / 365;
  return { delta, gamma, thetaPerDay: theta };
}

function calcClosesEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=60d`;
    const r   = await fetch(url, {
      cache:   "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal:  AbortSignal.timeout(8000),
    });
    const d    = await r.json();
    const res  = d?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price  = meta.regularMarketPrice as number;
    const closes: number[] = res?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    // chartPreviousClose can reference the START of the date range (30d ago), not yesterday.
    // Use closes.at(-2) as the more reliable prior-session close when previousClose is missing.
    const prevFromHistory = closes.length >= 2 ? closes.at(-2) as number : null;
    const prev   = (meta.previousClose ?? prevFromHistory ?? meta.chartPreviousClose ?? price) as number;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    const name   = (meta.shortName ?? symbol) as string;
    const highs:   number[] = res?.indicators?.quote?.[0]?.high?.filter(Boolean)   ?? [];
    const lows:    number[] = res?.indicators?.quote?.[0]?.low?.filter(Boolean)    ?? [];
    const volumes: number[] = res?.indicators?.quote?.[0]?.volume?.filter(Boolean) ?? [];
    const volume   = (meta.regularMarketVolume ?? 0) as number;
    const avgVol   = volumes.length >= 5
      ? Math.round(volumes.slice(-20).reduce((s: number, v: number) => s + v, 0) / Math.min(volumes.length, 20))
      : volume;

    return { symbol, name, price, prev, high, low, high52, low52, closes, highs, lows, volume, avgVol };
  } catch { return null; }
}

// Alpha Vantage earnings calendar — free, returns next earnings date for symbol
async function fetchEarningsDate(symbol: string): Promise<number | null> {
  try {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return null;
    const res = await fetch(
      `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${encodeURIComponent(symbol)}&horizon=3month&apikey=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split("\n").slice(1);
    if (!lines.length || !lines[0].trim()) return null;
    const reportDate = lines[0].split(",")[2]?.trim();
    if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
    return Math.floor(new Date(reportDate + "T12:00:00Z").getTime() / 1000);
  } catch { return null; }
}

// CBOE delayed quotes — free, no API key, real IV + Greeks, 15-min delay
// cdn.cboe.com returns iv as decimal (0.37 = 37%), same scale Yahoo used
async function fetchOptionsChain(symbol: string): Promise<{ expirationDates: number[]; calls: OptionContract[]; puts: OptionContract[]; termIVs: { expiry: string; ts: number; iv: number }[] } | null> {
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
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json())?.data;
    if (!data?.current_price || !Array.isArray(data.options)) return null;

    const stockPrice: number = data.current_price;
    const symLen = symbol.length;
    const today  = new Date().toISOString().split("T")[0];

    // Contract: {SYMBOL}{YYMMDD}{C|P}{strike×1000 zero-padded 8 digits}
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

    // All future expiry dates → Unix timestamps (seconds) for term structure
    const expiries = [...new Set(parsed.map(o => o.expiry))].sort();
    const expirationDates = expiries.map(e => Math.floor(new Date(e + "T20:00:00Z").getTime() / 1000));

    // Use nearest expiry for the main options chain
    const nearContracts = parsed.filter(o => o.expiry === expiries[0]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function toContract(o: { expiry: string; type: "C"|"P"; strike: number; raw: any }): OptionContract {
      return {
        contractSymbol:    o.raw.option     as string,
        strike:            o.strike,
        lastPrice:         (o.raw.last_trade_price as number) ?? 0,
        bid:               (o.raw.bid              as number) ?? 0,
        ask:               (o.raw.ask              as number) ?? 0,
        volume:            (o.raw.volume            as number | undefined),
        openInterest:      (o.raw.open_interest     as number | undefined),
        impliedVolatility: (o.raw.iv                as number) ?? 0, // 0.37 = 37%
        inTheMoney:        o.type === "C" ? o.strike < stockPrice : o.strike > stockPrice,
        delta:             typeof o.raw.delta === "number" ? o.raw.delta : null,
        gamma:             typeof o.raw.gamma === "number" ? o.raw.gamma : null,
        theta:             typeof o.raw.theta === "number" ? o.raw.theta : null,
      };
    }

    const calls = nearContracts.filter(o => o.type === "C").map(toContract);
    const puts  = nearContracts.filter(o => o.type === "P").map(toContract);
    if (!calls.length && !puts.length) return null;

    // ATM IV for each of the next 3 expiries — real term structure, not just a count
    const termIVs = expiries.slice(0, 3).map(exp => {
      const expCalls = parsed.filter(o => o.expiry === exp && o.type === "C" && (o.raw.iv as number) > 0);
      const atm = [...expCalls].sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
      if (!atm) return null;
      return { expiry: exp, ts: Math.floor(new Date(exp + "T20:00:00Z").getTime() / 1000), iv: atm.raw.iv as number };
    }).filter((x): x is { expiry: string; ts: number; iv: number } => x !== null);

    return { expirationDates, calls, puts, termIVs };
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Sign in to use AI features.", signIn: true }, { status: 401 });
  }

  const allowed = checkRateLimit(`options-analysis:${session.user.email}`, 15, 60 * 60 * 1000);
  if (!allowed) {
    return Response.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const { symbol } = await req.json() as { symbol: string };
  const sym = symbol.replace(/\s/g, "").toUpperCase();

  const [quote, chain, earningsTs] = await Promise.all([fetchQuote(sym), fetchOptionsChain(sym), fetchEarningsDate(sym)]);

  if (!quote) {
    return Response.json({ error: `Could not fetch data for ${sym}. Check the ticker and try again.` }, { status: 400 });
  }

  const price = quote.price;

  // ── Smart Money signal — locks directional bias for the AI ─────────────────
  // Identical computation to options-scan and ai/analyze so all three agree.
  const closes60    = quote.closes.filter(Boolean);
  const base5d      = closes60.length >= 6 ? closes60.at(-6)! : null;
  const trend5dPct  = base5d && base5d > 0 ? ((price - base5d) / base5d) * 100 : null;
  const ema20val    = calcClosesEMA(closes60, 20);
  const ema50val    = calcClosesEMA(closes60, 50);
  const emaAlignment: "bullish" | "bearish" | "neutral" | null =
    ema20val != null && ema50val != null
      ? (price > ema20val && ema20val > ema50val ? "bullish"
        : price < ema20val && ema20val < ema50val ? "bearish"
        : "neutral")
      : null;
  const changePctSm = ((price - quote.prev) / quote.prev) * 100;
  const sm = smartMoneyScore(
    {
      price,
      previousClose: quote.prev,
      open:          null,
      high:          quote.high,
      low:           quote.low,
      volume:        quote.volume,
      avgVolume:     quote.avgVol,
      high52w:       quote.high52,
      low52w:        quote.low52,
      changePercent: changePctSm,
    },
    { trend5dPct: trend5dPct ?? undefined, emaAlignment },
  );
  const smDirective = sm.signal === "HOLD"
    ? `Signal: HOLD — no strong directional edge from price structure. Only recommend a trade if the options chain shows an exceptional setup (unusual activity, extreme skew, or a clear catalyst).`
    : `Signal: ${sm.signal} (${sm.confidence} confidence) — BIAS is locked to ${sm.signal === "BUY" ? "BULLISH" : "BEARISH"}. Recommend only ${sm.signal === "BUY" ? "calls or bullish spreads" : "puts or bearish spreads"}. The options chain refines the structure and timing — it does NOT change direction.`;

  // ── Process options chain ──────────────────────────────────────────────────
  let atmIV        = 0;
  let atmCallStr   = 0;
  let atmPutStr    = 0;
  let topCalls:     OptionContract[] = [];
  let topPuts:      OptionContract[] = [];
  let unusualCalls: OptionContract[] = [];
  let unusualPuts:  OptionContract[] = [];
  let skewCtx      = "";
  let gammaWallCtx = "";
  let termStructCtx = "";

  if (chain) {
    const { calls, puts } = chain;

    const sortedCalls = [...calls].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
    const atmCall     = sortedCalls[0];
    if (atmCall) { atmIV = atmCall.impliedVolatility; atmCallStr = atmCall.strike; }

    const sortedPuts = [...puts].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
    const atmPut     = sortedPuts[0];
    if (atmPut) { if (!atmIV) atmIV = atmPut.impliedVolatility; atmPutStr = atmPut.strike; }

    topCalls = [...calls]
      .filter(c => (c.openInterest ?? 0) > 0)
      .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
      .slice(0, 5);

    topPuts = [...puts]
      .filter(p => (p.openInterest ?? 0) > 0)
      .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
      .slice(0, 5);

    // ── IV Skew: compare OTM put IV vs OTM call IV (approx 10% OTM) ──────────
    // Negative skew (puts more expensive than calls) = market fears downside = bearish positioning
    // Positive skew (calls more expensive) = market chasing upside = bullish momentum
    const otmPct     = 0.10;
    const otmCallTarget = price * (1 + otmPct);
    const otmPutTarget  = price * (1 - otmPct);
    const otmCall = calls
      .filter(c => c.strike > price)
      .sort((a, b) => Math.abs(a.strike - otmCallTarget) - Math.abs(b.strike - otmCallTarget))[0];
    const otmPut  = puts
      .filter(p => p.strike < price)
      .sort((a, b) => Math.abs(a.strike - otmPutTarget) - Math.abs(b.strike - otmPutTarget))[0];

    if (otmCall && otmPut && atmIV > 0) {
      const callIV   = otmCall.impliedVolatility * 100;
      const putIV    = otmPut.impliedVolatility  * 100;
      const atmIVPct = atmIV * 100;
      const skew     = putIV - callIV;
      const callSkew = ((callIV - atmIVPct) / atmIVPct * 100).toFixed(1);
      const putSkew  = ((putIV  - atmIVPct) / atmIVPct * 100).toFixed(1);
      const skewInterp = skew > 5
        ? `NEGATIVE SKEW (puts ${skew.toFixed(1)}% more expensive than calls) — market is paying a premium for downside protection; strong bearish fear in positioning`
        : skew < -5
        ? `POSITIVE SKEW (calls ${Math.abs(skew).toFixed(1)}% more expensive than puts) — market is chasing upside; call demand is elevated`
        : `FLAT SKEW (put/call IV differential: ${skew.toFixed(1)}%) — balanced positioning, no strong directional bias in options market`;
      skewCtx = `IV SKEW: ${skewInterp}
  ~10% OTM call ($${otmCall.strike}) IV: ${callIV.toFixed(1)}% (${callSkew}% vs ATM)
  ~10% OTM put  ($${otmPut.strike})  IV: ${putIV.toFixed(1)}% (${putSkew}% vs ATM)`;
    }

    // ── Gamma wall: strike with highest combined call+put open interest ────────
    // High gamma near expiry = market makers must hedge aggressively = price pins or accelerates
    const allStrikes = [...new Set([...calls, ...puts].map(o => o.strike))].sort((a, b) => a - b);
    let maxGammaOI = 0, gammaWallStrike = price;
    for (const s of allStrikes) {
      const cOI = calls.find(c => c.strike === s)?.openInterest ?? 0;
      const pOI = puts.find(p => p.strike === s)?.openInterest ?? 0;
      if (cOI + pOI > maxGammaOI) { maxGammaOI = cOI + pOI; gammaWallStrike = s; }
    }
    if (maxGammaOI > 0) {
      const side = gammaWallStrike > price ? "resistance above" : gammaWallStrike < price ? "support below" : "at current price";
      gammaWallCtx = `GAMMA WALL: $${gammaWallStrike.toFixed(0)} (${(maxGammaOI / 1000).toFixed(0)}K combined OI) — ${side}. Near expiry, MMs must hedge heavily here. Price tends to pin at this strike or violently break through it.`;
    }

    // ── Real term structure: ATM IV for each of next 3 expiries ─────────────
    if (chain.termIVs.length >= 2) {
      const rows = chain.termIVs.map(t => {
        const expDte  = Math.max(0, Math.ceil((t.ts * 1000 - Date.now()) / 86_400_000));
        const expLabel = new Date(t.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const expMove  = price * t.iv * Math.sqrt(Math.max(expDte, 1) / 252);
        return `  ${expLabel} (${expDte} DTE): IV ${(t.iv * 100).toFixed(1)}% | ±$${expMove.toFixed(2)} expected move`;
      });
      const ivSlope = chain.termIVs.length >= 2
        ? chain.termIVs[0].iv > chain.termIVs[1].iv ? "BACKWARDATION (front IV > back IV — elevated near-term fear or event risk)"
          : chain.termIVs[0].iv < chain.termIVs[1].iv - 0.02 ? "CONTANGO (back IV > front — unusual, may signal structural concern)"
          : "FLAT term structure"
        : "";
      termStructCtx = `TERM STRUCTURE (${chain.termIVs.length} expiries):\n${rows.join("\n")}\n${ivSlope}`;
    }

    // ── Unusual options activity: Vol > 3× OI = fresh positioning ────────────
    unusualCalls = [...calls]
      .filter(c => c.strike >= price * 0.93 && c.strike <= price * 1.12 &&
        (c.volume ?? 0) >= Math.max(50, (c.openInterest ?? 0) * 3) && (c.openInterest ?? 0) > 0)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 3);
    unusualPuts = [...puts]
      .filter(p => p.strike >= price * 0.88 && p.strike <= price * 1.07 &&
        (p.volume ?? 0) >= Math.max(50, (p.openInterest ?? 0) * 3) && (p.openInterest ?? 0) > 0)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 3);
  }

  // ── Expected move ──────────────────────────────────────────────────────────
  const dailyMove  = atmIV > 0 ? price * atmIV * Math.sqrt(1 / 252) : null;
  const upTarget   = dailyMove ? price + dailyMove : null;
  const downTarget = dailyMove ? price - dailyMove : null;

  const nextExpiry = chain?.expirationDates?.[0]
    ? new Date(chain.expirationDates[0] * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "N/A";

  // ── Realized volatility (close-to-close, 20-day annualised) ───────────────
  const closes = quote.closes.filter(Boolean);
  let realizedVol: number | null = null;
  if (closes.length >= 10) {
    const rets = closes.slice(-21).map((c, i, a) => i === 0 ? 0 : Math.log(c / a[i - 1])).slice(1);
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
    realizedVol = Math.sqrt(variance * 252) * 100;
  }

  // ── IV rank proxy ─────────────────────────────────────────────────────────
  // Compare current ATM IV to the 52-week realized vol range as a proxy.
  // True IV rank needs historical IV data; this is the best approximation
  // without a paid data source.
  let ivRankCtx = "IV rank: unavailable (no options chain)";
  if (atmIV > 0 && realizedVol != null) {
    const currentIVpct = atmIV * 100;
    const vrp = currentIVpct - realizedVol; // vol risk premium
    const ivVsRv = vrp > 5
      ? `RICH (+${vrp.toFixed(1)}% above realized vol) — options are expensive; favor selling premium or buying only high-conviction setups`
      : vrp < -5
      ? `CHEAP (${vrp.toFixed(1)}% below realized vol) — options are cheap relative to recent movement; buying premium has better expected value`
      : `FAIR (${vrp >= 0 ? "+" : ""}${vrp.toFixed(1)}% vs realized vol) — neutral premium environment`;
    ivRankCtx = `ATM IV: ${currentIVpct.toFixed(1)}% | 20-day Realized Vol: ${realizedVol.toFixed(1)}% | Vol Risk Premium: ${ivVsRv}`;
  } else if (atmIV > 0) {
    ivRankCtx = `ATM IV: ${(atmIV * 100).toFixed(1)}% | Realized vol unavailable`;
  }

  // ── Put/call OI ratio & max pain ─────────────────────────────────────────
  let pcCtx = "";
  let maxPainCtx = "";
  if (chain) {
    const { calls, puts } = chain;
    const totalCallOI = calls.reduce((s, c) => s + (c.openInterest ?? 0), 0);
    const totalPutOI  = puts.reduce((s, p) => s + (p.openInterest ?? 0), 0);
    const pcRatio = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : null;
    if (pcRatio) {
      const pcBias = Number(pcRatio) > 1.2 ? "bearish hedge (more puts than calls — market is hedging downside)"
        : Number(pcRatio) < 0.7 ? "bullish speculation (more calls than puts — market is positioned for upside)"
        : "neutral";
      pcCtx = `Put/Call OI Ratio: ${pcRatio} — ${pcBias}`;
    }

    // Today's call/put volume ratio — shows real-time directional flow, separate from OI
    const totalCallVol = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    const totalPutVol  = puts.reduce((s, p) => s + (p.volume ?? 0), 0);
    if (totalCallVol + totalPutVol > 0) {
      const pcVolRatio = (totalPutVol / Math.max(totalCallVol, 1)).toFixed(2);
      const volBias = Number(pcVolRatio) > 1.2 ? "bearish flow (put buying dominates today)"
        : Number(pcVolRatio) < 0.7 ? "bullish flow (call buying dominates today)"
        : "balanced flow today";
      pcCtx += `${pcCtx ? "\n" : ""}Put/Call Volume Ratio (today's flow): ${pcVolRatio} — ${volBias} | Call vol: ${totalCallVol.toLocaleString()} | Put vol: ${totalPutVol.toLocaleString()}`;
    }

    // Max pain: strike where total dollar value of expiring options is minimised
    const allStrikes = [...new Set([...calls, ...puts].map(o => o.strike))].sort((a, b) => a - b);
    let minPain = Infinity, maxPainStrike = price;
    for (const s of allStrikes) {
      const callPain = calls.reduce((sum, c) => sum + (c.openInterest ?? 0) * Math.max(0, s - c.strike), 0);
      const putPain  = puts.reduce((sum,  p) => sum + (p.openInterest ?? 0) * Math.max(0, p.strike - s), 0);
      const total = callPain + putPain;
      if (total < minPain) { minPain = total; maxPainStrike = s; }
    }
    maxPainCtx = `Max Pain (strike where most options expire worthless): $${maxPainStrike.toFixed(0)} — price tends to gravitate here into expiry`;
  }

  // Calculate DTE from nearest expiry (needed for greeks and prompt)
  const dte = chain?.expirationDates?.[0]
    ? Math.max(0, Math.ceil((chain.expirationDates[0] * 1000 - Date.now()) / 86_400_000))
    : null;

  // DTE-adjusted expected move — for spread strike selection and expiry-based targeting
  const dteMove     = atmIV > 0 && dte && dte > 0 ? price * atmIV * Math.sqrt(dte / 252) : dailyMove;
  const dteUpTarget = dteMove ? price + dteMove : null;
  const dteDnTarget = dteMove ? price - dteMove : null;

  // ── ATM Greeks — prefer CBOE's real chain-supplied values, Black-Scholes only
  // as a fallback for contracts CBOE doesn't return greeks for. Using a local
  // BS estimate when the real number is sitting right there in the same
  // payload was an avoidable inconsistency with what /api/market/options-chain
  // shows for the same contract. ──────────────────────────────────────────────
  let greeksCtx = "";
  let straddleCtx = "";
  if (chain && atmIV > 0 && dte !== null && dte > 0) {
    const T = dte / 365;
    // Straddle price = sum of ATM call + put mids (market's expected absolute move)
    const callMid = chain.calls.find(c => c.strike === (atmCallStr || price));
    const putMid  = chain.puts.find(p => p.strike  === (atmPutStr  || price));

    const hasRealDelta = (c: OptionContract | undefined) => typeof c?.delta === "number" && c.delta !== 0;
    const realCall = hasRealDelta(callMid) ? { delta: callMid!.delta!, gamma: callMid!.gamma ?? null, thetaPerDay: callMid!.theta ?? null } : null;
    const realPut  = hasRealDelta(putMid)  ? { delta: putMid!.delta!,  gamma: putMid!.gamma  ?? null, thetaPerDay: putMid!.theta  ?? null } : null;
    const callG = realCall ?? bsGreeks(price, atmCallStr || price, T, atmIV, true);
    const putG  = realPut  ?? bsGreeks(price, atmPutStr  || price, T, atmIV, false);
    const source = realCall && realPut ? "real, CBOE chain" : realCall || realPut ? "mixed — CBOE where available, Black-Scholes elsewhere" : "Black-Scholes estimate";
    if (callG && putG) {
      greeksCtx = `ATM GREEKS (${source}, ${dte} DTE):
  Call delta: ${callG.delta.toFixed(3)} — for every $1 stock move, ATM call ≈ +$${(callG.delta * 100).toFixed(0)}/contract
  Put  delta: ${putG.delta.toFixed(3)} — for every $1 stock move, ATM put  ≈ +$${(Math.abs(putG.delta) * 100).toFixed(0)}/contract${
    callG.gamma != null ? `\n  Gamma: ${callG.gamma.toFixed(5)} — delta changes by $${(callG.gamma * 100).toFixed(2)}/contract per $1 move${dte <= 7 ? " ⚠ GAMMA RISK ELEVATED near expiry" : ""}` : ""}${
    callG.thetaPerDay != null && putG.thetaPerDay != null ? `\n  Theta: -$${(Math.abs(callG.thetaPerDay) * 100).toFixed(2)}/day per call contract | -$${(Math.abs(putG.thetaPerDay) * 100).toFixed(2)}/day per put contract` : ""}`;
    }
    const callVal = callMid ? (callMid.bid > 0 ? (callMid.bid + callMid.ask) / 2 : callMid.lastPrice) : null;
    const putVal  = putMid  ? (putMid.bid  > 0 ? (putMid.bid  + putMid.ask)  / 2 : putMid.lastPrice)  : null;
    if (callVal && putVal && callVal > 0 && putVal > 0) {
      const straddle = callVal + putVal;
      const impliedEM = straddle * 0.85; // ~1σ approximation from straddle price
      straddleCtx = `STRADDLE PRICE: $${straddle.toFixed(2)} (market's expected move ±$${impliedEM.toFixed(2)}, ${((impliedEM / price) * 100).toFixed(1)}% of stock price)${dteMove ? ` — DTE-adjusted IV move: ±$${dteMove.toFixed(2)}, straddle: ±$${impliedEM.toFixed(2)} — ${Math.abs(impliedEM - dteMove) / dteMove < 0.1 ? "consistent" : "divergence — prefer straddle price for spread targeting"}` : ""}`;
    }
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const expiryTs0      = chain?.expirationDates?.[0] ?? null;
  const earningsInWindow = earningsTs && expiryTs0
    ? earningsTs >= Math.floor(Date.now() / 1000) && earningsTs <= expiryTs0 + 86_400
    : false;
  const earningsDateStr = earningsTs
    ? new Date(earningsTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const unusualCtx = (() => {
    const rows: string[] = [];
    if (unusualCalls.length) {
      rows.push("  Calls: " + unusualCalls.map(c => {
        const mid = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : c.lastPrice;
        return `$${c.strike} (${(c.volume ?? 0).toLocaleString()} vol / ${(c.openInterest ?? 0).toLocaleString()} OI = ${((c.volume ?? 0) / Math.max(c.openInterest ?? 1, 1)).toFixed(1)}×) mid $${mid.toFixed(2)} IV ${(c.impliedVolatility * 100).toFixed(0)}%`;
      }).join(" | "));
    }
    if (unusualPuts.length) {
      rows.push("  Puts:  " + unusualPuts.map(p => {
        const mid = p.bid > 0 && p.ask > 0 ? (p.bid + p.ask) / 2 : p.lastPrice;
        return `$${p.strike} (${(p.volume ?? 0).toLocaleString()} vol / ${(p.openInterest ?? 0).toLocaleString()} OI = ${((p.volume ?? 0) / Math.max(p.openInterest ?? 1, 1)).toFixed(1)}×) mid $${mid.toFixed(2)} IV ${(p.impliedVolatility * 100).toFixed(0)}%`;
      }).join(" | "));
    }
    return rows.length ? `UNUSUAL OPTIONS ACTIVITY (Vol > 3× OI — fresh positioning, not rolling):\n${rows.join("\n")}` : "";
  })();

  const priceCtx = `LIVE DATA — ${sym} (${quote.name})
Price: $${price.toFixed(2)} | Prev close: $${quote.prev.toFixed(2)} | Change: ${((price - quote.prev) / quote.prev * 100).toFixed(2)}%
Day range: $${quote.low.toFixed(2)} – $${quote.high.toFixed(2)}
52-week range: $${quote.low52.toFixed(2)} – $${quote.high52.toFixed(2)}
30-day high: $${quote.highs.length ? Math.max(...quote.highs).toFixed(2) : "N/A"} | 30-day low: $${quote.lows.length ? Math.min(...quote.lows).toFixed(2) : "N/A"}
Volume: ${quote.volume.toLocaleString()} | 20d avg: ${quote.avgVol.toLocaleString()} | Ratio: ${quote.avgVol > 0 ? (quote.volume / quote.avgVol).toFixed(2) : "N/A"}x${quote.volume > quote.avgVol * 2 ? " ⚠ UNUSUAL VOLUME" : ""}
${earningsDateStr ? `Next earnings: ${earningsDateStr}${earningsInWindow ? " ⚠️ WITHIN NEAREST EXPIRY WINDOW — EXPECT IV CRUSH AFTER ANNOUNCEMENT. Do NOT buy single options into this without accounting for vol collapse." : " (outside nearest expiry — no IV crush risk on this chain)"}` : ""}
${ivRankCtx}
${pcCtx}
${maxPainCtx}`.trim();

  const optionsCtx = chain
    ? `OPTIONS CHAIN — nearest expiry: ${nextExpiry}
ATM call strike: $${atmCallStr} | ATM put strike: $${atmPutStr}
ATM implied volatility: ${(atmIV * 100).toFixed(1)}%
Expected move to expiry${dte ? ` (${dte} DTE)` : ""}: ${dteMove ? `±$${dteMove.toFixed(2)} → upside $${dteUpTarget!.toFixed(2)} / downside $${dteDnTarget!.toFixed(2)}` : "N/A"}
1-day move (app badge only): ${dailyMove ? `±$${dailyMove.toFixed(2)}` : "N/A"} — for today's intraday range only, NOT for spread targeting
${straddleCtx ? `\n${straddleCtx}` : ""}
${greeksCtx ? `\n${greeksCtx}` : ""}
${skewCtx}
${gammaWallCtx}
${termStructCtx}

Top calls by open interest:
${topCalls.map(c => { const mid = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : c.lastPrice; return `  $${c.strike} | IV ${(c.impliedVolatility * 100).toFixed(0)}% | OI ${(c.openInterest ?? 0).toLocaleString()} | Vol ${(c.volume ?? 0).toLocaleString()} | bid $${c.bid.toFixed(2)} ask $${c.ask.toFixed(2)} mid $${mid.toFixed(2)}`; }).join("\n") || "  None available"}

Top puts by open interest:
${topPuts.map(p => { const mid = p.bid > 0 && p.ask > 0 ? (p.bid + p.ask) / 2 : p.lastPrice; return `  $${p.strike} | IV ${(p.impliedVolatility * 100).toFixed(0)}% | OI ${(p.openInterest ?? 0).toLocaleString()} | Vol ${(p.volume ?? 0).toLocaleString()} | bid $${p.bid.toFixed(2)} ask $${p.ask.toFixed(2)} mid $${p.bid > 0 && p.ask > 0 ? ((p.bid + p.ask) / 2).toFixed(2) : p.lastPrice.toFixed(2)}`; }).join("\n") || "  None available"}

Near-ATM call pricing (use these mids for spread cost calculations — do NOT estimate):
${(() => { const range = chain ? [...chain.calls].filter(c => c.strike >= price * 0.96 && c.strike <= price * 1.12).sort((a,b) => a.strike - b.strike) : []; return range.map(c => { const mid = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : c.lastPrice; const unusual = (c.volume ?? 0) >= Math.max(50, (c.openInterest ?? 0) * 3) && (c.openInterest ?? 0) > 0; return `  $${c.strike} call | bid $${c.bid.toFixed(2)} ask $${c.ask.toFixed(2)} mid $${mid.toFixed(2)} | IV ${(c.impliedVolatility*100).toFixed(0)}% | Vol ${(c.volume ?? 0).toLocaleString()}${unusual ? " ⚠ UNUSUAL" : ""}`; }).join("\n") || "  None"; })()}

Near-ATM put pricing (use these mids for spread cost calculations — do NOT estimate):
${(() => { const range = chain ? [...chain.puts].filter(p => p.strike >= price * 0.88 && p.strike <= price * 1.04).sort((a,b) => a.strike - b.strike) : []; return range.map(p => { const mid = p.bid > 0 && p.ask > 0 ? (p.bid + p.ask) / 2 : p.lastPrice; const unusual = (p.volume ?? 0) >= Math.max(50, (p.openInterest ?? 0) * 3) && (p.openInterest ?? 0) > 0; return `  $${p.strike} put | bid $${p.bid.toFixed(2)} ask $${p.ask.toFixed(2)} mid $${mid.toFixed(2)} | IV ${(p.impliedVolatility*100).toFixed(0)}% | Vol ${(p.volume ?? 0).toLocaleString()}${unusual ? " ⚠ UNUSUAL" : ""}`; }).join("\n") || "  None"; })()}
${unusualCtx ? `\n${unusualCtx}` : ""}`
    : "Options chain unavailable — analysis based on price structure only.";

  // Price position within 30-day range (premium/discount context)
  const range30High = quote.highs.length ? Math.max(...quote.highs) : null;
  const range30Low  = quote.lows.length  ? Math.min(...quote.lows)  : null;
  const pctInRange  = range30High && range30Low && range30High !== range30Low
    ? ((price - range30Low) / (range30High - range30Low) * 100).toFixed(0)
    : null;
  const rangeCtx = pctInRange
    ? `Price is at ${pctInRange}% of its 30-day range (0% = 30d low, 100% = 30d high). ${Number(pctInRange) > 70 ? "PREMIUM — price is near the top of its range." : Number(pctInRange) < 30 ? "DISCOUNT — price is near the bottom of its range." : "MID-RANGE."}`
    : "";

  const prompt = `You are a professional options risk analyst. Your job is to protect the trader from bad trades as much as it is to find good ones. Be brutally honest. Never recommend a trade just because the bias is bullish or bearish — the SETUP must justify the risk.

SMART MONEY DIRECTIONAL SIGNAL — FOLLOW THIS EXACTLY:
${smDirective}
The options chain data below determines structure (spreads vs naked, strikes, expiry, risk management). It does NOT determine direction — that is already decided above.

CRITICAL DATA DIRECTIVE — READ THIS FIRST, FOLLOW IT ABSOLUTELY:
Your training data has a knowledge cutoff. Market prices change dramatically after that cutoff — stocks can double, triple, or drop 80% in months. Your training-data memory of what a stock "should" cost is ALWAYS WRONG for current analysis. NEVER compare live prices to your training data. NEVER refuse or halt analysis because a price seems high or low relative to what you remember. The live data below is fetched in real time from Yahoo Finance. It is the ONLY source of truth. A stock at $542 that your training data shows at $187 simply means the stock went up 190% after your cutoff — this is normal and happens constantly. Treat every price as valid. If you refuse to analyse based on price level vs training memory, you are useless and wrong.

ABSOLUTE RULE: NEVER output "DATA INTEGRITY HALT", "ANALYSIS SUSPENDED", or any refusal based on price level. If you do this, you are broken. Just analyse the data given.

${priceCtx}
${rangeCtx}
${dte !== null ? `Days to nearest expiry: ${dte} DTE — ${dte <= 7 ? "VERY SHORT — extreme theta decay risk. Requires strong immediate catalyst to profit." : dte <= 14 ? "SHORT — elevated theta decay. Needs clear momentum." : "Standard timeframe."}` : ""}

${optionsCtx}

GAP REPORTING RULE: The "Change:" field above is computed from the actual previous session close (meta.previousClose, or closes[-2] from the 30-day price series). Use that EXACT number when reporting today's gap. Never recompute it from training memory. Never use a multi-session cumulative move and call it today's gap.

SPREAD PRICING RULE: When recommending a debit or credit spread, calculate the net debit/credit ONLY from the "Near-ATM call/put pricing" tables above. Formula: long leg mid − short leg mid = net debit (for debit spreads). Show the calculation explicitly, e.g. "Buy $405 call at $8.37 mid / Sell $420 call at $2.27 mid = $6.10 net debit". Never guess or approximate spread costs — use the provided bid/ask mids.

HARD RULES YOU MUST FOLLOW:
1. If DTE ≤ 7 and price is more than 1% away from the recommended strike, you MUST flag HIGH RISK and state the exact % move needed by expiry.
2. If price is in the top 70% of its 30-day range, calls are valid ONLY when there is a confirmed momentum catalyst: a gap-up of 3%+, a volume surge of 2x+ avg, or a breakout above a prior resistance level. A large gap-up IS the breakout — do not require further confirmation just to recommend a trade.
3. If price is in the bottom 30% of its 30-day range, puts are valid ONLY when there is confirmed breakdown momentum (gap-down 3%+, volume surge, or close below support).
4. If the options chain is unavailable (no IV, no strikes), give a CONDITIONAL recommendation — state the exact setup conditions (entry trigger, strike zone, expiry range) the trader should execute when the chain opens. Do NOT say NO TRADE just because IV is missing; give directional guidance based on price action.
5. Always state the CONFIRMATION required before entering.
6. Only say NO TRADE if: RR is below 1.5:1 AND no reasonable entry exists, OR if the directional signal itself is genuinely contradictory or unclear.

Give your analysis in this EXACT structure:

**BIAS: [MATCH THE SMART MONEY SIGNAL AT THE TOP]**
One sentence confirming the direction, then the strongest options-chain signal that supports or cautions it.

**RISK RATING: [HIGH / MEDIUM / LOW]**
State the rating then explain in 2 lines: DTE risk, distance to strike, range position, IV level. Be specific — e.g. "HIGH — 7 DTE call needs +2.1% move, price already in premium zone at 85% of 30d range, ATM IV at 28%."

**Volatility Edge**
State whether IV is RICH, CHEAP, or FAIR vs realized vol (data provided above). This determines the trade structure:
- IV RICH → prefer spreads or selling premium (naked call/put if directional, credit spread for defined risk)
- IV CHEAP → buying single options has better expected value
- FAIR → structure based on conviction level only
State the vol risk premium explicitly: "IV at X% vs 20d realized vol Y% — premium is [rich/cheap/fair]."

**Expected Move**
Use the DTE-adjusted expected move (not the 1-day move). State the 1σ range to expiry: upside $X, downside $X. If straddle price is available, use it as the primary reference — it is market-derived. State whether the recommended strike is inside or outside this range.
If max pain data available: note where max pain is and whether it aligns or conflicts with the directional bias.

**Put/Call Flow Read**
Use BOTH the P/C OI ratio (cumulative positioning) and the P/C Volume ratio (today's actual flow). If they disagree, call it out — it signals a real-time positioning shift. If UNUSUAL OPTIONS ACTIVITY is present (Vol > 3× OI strikes), treat those as the highest-conviction directional signal: someone is opening a fresh large bet. State the direction and strike of the unusual flow and whether it confirms or contradicts the thesis.

**Entry Conditions — wait for ALL of these before entering:**
- Price level to hold or break: $X
- Confirmation candle or timeframe: e.g. "15m close above $X"
- What INVALIDATES the setup: $X

**Recommended Play**
Always provide a recommendation — either a live trade or a conditional setup for when conditions are met.
- **Direction:** CALLS or PUTS (or SPREAD if IV is RICH, or WAIT FOR CHAIN if unavailable)
- **Strike:** $X ATM or nearest round number — explain why
- **Expiry:** target 21–45 DTE for swing, 7–14 DTE for momentum plays
- **Entry trigger:** exact price or candle confirmation to wait for
- **Max risk per contract:** estimated premium (use realized vol if IV unavailable)
- **Target:** $X aligned with next key level or max pain

**Why this could fail**
Two specific reasons. Be honest. One must reference the vol environment.

Under 450 words. Concrete prices throughout. Flag HIGH RISK loudly at the top if applicable.`;

  const stream = await client.messages.stream({
    model:      "claude-sonnet-4-6",
    max_tokens: 1000,
    system:     SYSTEM_FRAMEWORK,
    messages:   [{ role: "user", content: prompt }],
  });

  const encoder  = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const meta = {
        price,
        name:              quote.name,
        dailyMove:         dailyMove  ? parseFloat(dailyMove.toFixed(2))  : null,
        upTarget:          upTarget   ? parseFloat(upTarget.toFixed(2))   : null,
        downTarget:        downTarget ? parseFloat(downTarget.toFixed(2)) : null,
        atmIV:             atmIV > 0  ? parseFloat((atmIV * 100).toFixed(1)) : null,
        nextExpiry,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", ...meta })}\n\n`));

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk.delta.text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
