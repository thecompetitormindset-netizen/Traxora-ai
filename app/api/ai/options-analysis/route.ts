import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";
import { checkRateLimit } from "@/app/lib/rateLimit";

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

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=30d`;
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
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    const name   = (meta.shortName ?? symbol) as string;

    const closes: number[] = res?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    const highs:  number[] = res?.indicators?.quote?.[0]?.high?.filter(Boolean)  ?? [];
    const lows:   number[] = res?.indicators?.quote?.[0]?.low?.filter(Boolean)   ?? [];

    return { symbol, name, price, prev, high, low, high52, low52, closes, highs, lows };
  } catch { return null; }
}

// Yahoo Finance requires a crumb + session cookie for their options endpoint.
// Without it, requests from cloud IPs (Vercel, etc.) return 401 or empty results.
let _yahooCredCache: { cookie: string; crumb: string; expiry: number } | null = null;

async function getYahooCreds(): Promise<{ cookie: string; crumb: string } | null> {
  if (_yahooCredCache && Date.now() < _yahooCredCache.expiry) {
    return _yahooCredCache;
  }
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    // Step 1: land on finance.yahoo.com to get session cookies
    const pageRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": ua, "Accept": "text/html,*/*", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const setCookie = pageRes.headers.get("set-cookie") ?? "";
    // Collect all cookie name=value pairs (Yahoo sets several)
    const cookiePairs = [...setCookie.matchAll(/([A-Za-z0-9_-]+=(?:[^;,"\s]|"[^"]*")+)/g)]
      .map(m => m[1])
      .filter(p => !p.startsWith("expires=") && !p.startsWith("path=") && !p.startsWith("domain=") && !p.startsWith("SameSite=") && !p.startsWith("Secure"));
    const cookie = cookiePairs.join("; ");
    if (!cookie) return null;

    // Step 2: exchange session cookie for a crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": ua, "Cookie": cookie },
      signal: AbortSignal.timeout(6000),
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 4 || crumb.includes("<")) return null;

    _yahooCredCache = { cookie, crumb, expiry: Date.now() + 5 * 60 * 1000 };
    return _yahooCredCache;
  } catch { return null; }
}

async function fetchOptionsChain(symbol: string) {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const baseHeaders = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
  };

  async function tryFetch(url: string, extra: Record<string, string> = {}) {
    try {
      const r = await fetch(url, {
        cache: "no-store", headers: { ...baseHeaders, ...extra },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) return null;
      const d      = await r.json();
      const result = d?.optionChain?.result?.[0];
      if (!result) return null;
      const expirationDates = (result.expirationDates as number[]) ?? [];
      const options         = result.options?.[0];
      const calls           = (options?.calls ?? []) as OptionContract[];
      const puts            = (options?.puts  ?? []) as OptionContract[];
      if (calls.length === 0 && puts.length === 0) return null;
      return { expirationDates, calls, puts };
    } catch { return null; }
  }

  // Attempt 1: crumb-authenticated request (most reliable from server)
  const creds = await getYahooCreds();
  if (creds) {
    const result = await tryFetch(
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(creds.crumb)}`,
      { "Cookie": creds.cookie },
    );
    if (result) return result;
  }

  // Attempt 2: unauthenticated query1 (works on some IPs)
  const r1 = await tryFetch(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
  if (r1) return r1;

  // Attempt 3: query2 fallback
  return await tryFetch(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = checkRateLimit(`options-analysis:${session.user.email}`, 15, 60 * 60 * 1000);
  if (!allowed) {
    return Response.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const { symbol } = await req.json() as { symbol: string };
  const sym = symbol.replace(/\s/g, "").toUpperCase();

  const [quote, chain] = await Promise.all([fetchQuote(sym), fetchOptionsChain(sym)]);

  if (!quote) {
    return Response.json({ error: `Could not fetch data for ${sym}. Check the ticker and try again.` }, { status: 400 });
  }

  const price = quote.price;

  // ── Process options chain ──────────────────────────────────────────────────
  let atmIV        = 0;
  let atmCallStr   = 0;
  let atmPutStr    = 0;
  let topCalls: OptionContract[] = [];
  let topPuts:  OptionContract[] = [];
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

    // ── Term structure: compare nearest vs next expiry IV (if available) ─────
    if ((chain.expirationDates?.length ?? 0) >= 2) {
      termStructCtx = `TERM STRUCTURE: ${chain.expirationDates!.length} expiries available. Nearest expiry IV reflects short-term event risk; rolling to the next expiry reduces theta burn but costs more premium.`;
    }
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

  // ── Black-Scholes ATM Greeks ──────────────────────────────────────────────
  let greeksCtx = "";
  let straddleCtx = "";
  if (chain && atmIV > 0 && dte !== null && dte > 0) {
    const T = dte / 365;
    const callG = bsGreeks(price, atmCallStr || price, T, atmIV, true);
    const putG  = bsGreeks(price, atmPutStr  || price, T, atmIV, false);
    if (callG && putG) {
      greeksCtx = `ATM GREEKS (Black-Scholes, ${dte} DTE):
  Call delta: ${callG.delta.toFixed(3)} — for every $1 stock move, ATM call ≈ +$${(callG.delta * 100).toFixed(0)}/contract
  Put  delta: ${putG.delta.toFixed(3)} — for every $1 stock move, ATM put  ≈ +$${(Math.abs(putG.delta) * 100).toFixed(0)}/contract
  Gamma: ${callG.gamma.toFixed(5)} — delta changes by $${(callG.gamma * 100).toFixed(2)}/contract per $1 move${dte <= 7 ? " ⚠ GAMMA RISK ELEVATED near expiry" : ""}
  Theta: -$${(Math.abs(callG.thetaPerDay) * 100).toFixed(2)}/day per call contract | -$${(Math.abs(putG.thetaPerDay) * 100).toFixed(2)}/day per put contract`;
    }
    // Straddle price = sum of ATM call + put mids (market's expected absolute move)
    const callMid = chain.calls.find(c => c.strike === (atmCallStr || price));
    const putMid  = chain.puts.find(p => p.strike  === (atmPutStr  || price));
    const callVal = callMid ? (callMid.bid > 0 ? (callMid.bid + callMid.ask) / 2 : callMid.lastPrice) : null;
    const putVal  = putMid  ? (putMid.bid  > 0 ? (putMid.bid  + putMid.ask)  / 2 : putMid.lastPrice)  : null;
    if (callVal && putVal && callVal > 0 && putVal > 0) {
      const straddle = callVal + putVal;
      const impliedEM = straddle * 0.85; // ~1σ approximation from straddle price
      straddleCtx = `STRADDLE PRICE: $${straddle.toFixed(2)} (market's expected move = ±$${impliedEM.toFixed(2)}, ${((impliedEM / price) * 100).toFixed(1)}% of stock price)${dailyMove ? ` — IV formula says ±$${dailyMove.toFixed(2)}, straddle says ±$${impliedEM.toFixed(2)} — ${Math.abs(impliedEM - dailyMove) / dailyMove < 0.1 ? "consistent" : "divergence: use straddle price as primary"}` : ""}`;
    }
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const priceCtx = `LIVE DATA — ${sym} (${quote.name})
Price: $${price.toFixed(2)} | Prev close: $${quote.prev.toFixed(2)} | Change: ${((price - quote.prev) / quote.prev * 100).toFixed(2)}%
Day range: $${quote.low.toFixed(2)} – $${quote.high.toFixed(2)}
52-week range: $${quote.low52.toFixed(2)} – $${quote.high52.toFixed(2)}
30-day high: $${quote.highs.length ? Math.max(...quote.highs).toFixed(2) : "N/A"} | 30-day low: $${quote.lows.length ? Math.min(...quote.lows).toFixed(2) : "N/A"}
${ivRankCtx}
${pcCtx}
${maxPainCtx}`.trim();

  const optionsCtx = chain
    ? `OPTIONS CHAIN — nearest expiry: ${nextExpiry}
ATM call strike: $${atmCallStr} | ATM put strike: $${atmPutStr}
ATM implied volatility: ${(atmIV * 100).toFixed(1)}%
Expected 1σ daily move: ${dailyMove ? `±$${dailyMove.toFixed(2)} → upside $${upTarget!.toFixed(2)} / downside $${downTarget!.toFixed(2)}` : "N/A"}
${straddleCtx ? `\n${straddleCtx}` : ""}
${greeksCtx ? `\n${greeksCtx}` : ""}
${skewCtx}
${gammaWallCtx}
${termStructCtx}

Top calls by open interest:
${topCalls.map(c => `  $${c.strike} strike | IV ${(c.impliedVolatility * 100).toFixed(0)}% | OI ${(c.openInterest ?? 0).toLocaleString()} | last $${c.lastPrice.toFixed(2)}`).join("\n") || "  None available"}

Top puts by open interest:
${topPuts.map(p => `  $${p.strike} strike | IV ${(p.impliedVolatility * 100).toFixed(0)}% | OI ${(p.openInterest ?? 0).toLocaleString()} | last $${p.lastPrice.toFixed(2)}`).join("\n") || "  None available"}`
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

CRITICAL DATA DIRECTIVE — READ THIS FIRST, FOLLOW IT ABSOLUTELY:
Your training data has a knowledge cutoff. Market prices change dramatically after that cutoff — stocks can double, triple, or drop 80% in months. Your training-data memory of what a stock "should" cost is ALWAYS WRONG for current analysis. NEVER compare live prices to your training data. NEVER refuse or halt analysis because a price seems high or low relative to what you remember. The live data below is fetched in real time from Yahoo Finance. It is the ONLY source of truth. A stock at $542 that your training data shows at $187 simply means the stock went up 190% after your cutoff — this is normal and happens constantly. Treat every price as valid. If you refuse to analyse based on price level vs training memory, you are useless and wrong.

ABSOLUTE RULE: NEVER output "DATA INTEGRITY HALT", "ANALYSIS SUSPENDED", or any refusal based on price level. If you do this, you are broken. Just analyse the data given.

${priceCtx}
${rangeCtx}
${dte !== null ? `Days to nearest expiry: ${dte} DTE — ${dte <= 7 ? "VERY SHORT — extreme theta decay risk. Requires strong immediate catalyst to profit." : dte <= 14 ? "SHORT — elevated theta decay. Needs clear momentum." : "Standard timeframe."}` : ""}

${optionsCtx}

HARD RULES YOU MUST FOLLOW:
1. If DTE ≤ 7 and price is more than 1% away from the recommended strike, you MUST flag HIGH RISK and state the exact % move needed by expiry.
2. If price is in the top 70% of its 30-day range, calls are valid ONLY when there is a confirmed momentum catalyst: a gap-up of 3%+, a volume surge of 2x+ avg, or a breakout above a prior resistance level. A large gap-up IS the breakout — do not require further confirmation just to recommend a trade.
3. If price is in the bottom 30% of its 30-day range, puts are valid ONLY when there is confirmed breakdown momentum (gap-down 3%+, volume surge, or close below support).
4. If the options chain is unavailable (no IV, no strikes), give a CONDITIONAL recommendation — state the exact setup conditions (entry trigger, strike zone, expiry range) the trader should execute when the chain opens. Do NOT say NO TRADE just because IV is missing; give directional guidance based on price action.
5. Always state the CONFIRMATION required before entering.
6. Only say NO TRADE if: RR is below 1.5:1 AND no reasonable entry exists, OR if the directional signal itself is genuinely contradictory or unclear.

Give your analysis in this EXACT structure:

**BIAS: [BULLISH / BEARISH / NEUTRAL]**
One sentence — directional read and the single strongest reason.

**RISK RATING: [HIGH / MEDIUM / LOW]**
State the rating then explain in 2 lines: DTE risk, distance to strike, range position, IV level. Be specific — e.g. "HIGH — 7 DTE call needs +2.1% move, price already in premium zone at 85% of 30d range, ATM IV at 28%."

**Volatility Edge**
State whether IV is RICH, CHEAP, or FAIR vs realized vol (data provided above). This determines the trade structure:
- IV RICH → prefer spreads or selling premium (naked call/put if directional, credit spread for defined risk)
- IV CHEAP → buying single options has better expected value
- FAIR → structure based on conviction level only
State the vol risk premium explicitly: "IV at X% vs 20d realized vol Y% — premium is [rich/cheap/fair]."

**Expected Move**
The 1σ range from IV: upside $X, downside $X. State whether the recommended strike is inside or outside this range.
If max pain data available: note where max pain is and whether it aligns or conflicts with the directional bias.

**Put/Call Flow Read**
Use the P/C OI ratio to confirm or challenge the directional thesis. A high P/C ratio with a bullish thesis = smart money may be positioned opposite; flag it.

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
