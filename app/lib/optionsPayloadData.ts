// Pure data-plumbing for the options probability engine's input payload.
// Nothing here calls an LLM — this is exactly the "numbers you already computed"
// layer the engine's system prompt is designed to treat as ground truth.

// ── ATR / realized vol ──────────────────────────────────────────────────────────

export function calcATR14(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Close-to-close realized vol, annualized decimal (0.35 = 35%) — same formula
// already used in pro-analysis/deep-analysis, ported here so this route doesn't
// depend on importing from an unrelated AI route.
export function calcRealizedVol20(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const sl = closes.slice(-period - 1);
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  return Math.sqrt(variance * 252);
}

// ── Earnings / event flags ──────────────────────────────────────────────────────

// A symbol with no known near-term earnings date maps to this sentinel, not
// `null` — the engine's own §1 rule disqualifies any candidate with a null
// required field, and "no earnings in the next 3 months" is a materially
// different fact than "we don't know its earnings date."
export const NO_EARNINGS_SENTINEL = 999;

export function deriveEventFlags(earningsInDays: number): string[] {
  return earningsInDays < NO_EARNINGS_SENTINEL ? ["earnings"] : [];
}

// ── Confidence: categorical → float ─────────────────────────────────────────────

// smartMoneyScore() only returns "High"|"Medium"|"Low" — the engine's confidence
// gate (>=0.60) needs a float. This mapping is the deterministic, non-LLM
// translation; Low is never sent as a candidate since 0.45 can't clear 0.60 anyway.
export const CONFIDENCE_MAP: Record<"High" | "Medium", number> = { High: 0.75, Medium: 0.62 };

// ── Signal components — descriptive narration, never a direction decision ──────

export type SignalComponent = { name: string; direction: "long" | "short" | "neutral"; weight: number; note: string };

// Narrates the same inputs smartMoneyScore() already weighs (see the scoring
// breakdown comment in smartMoney.ts: trend ~4/11, today ~2/11, volume ~2/11,
// 52w ~1/11, EMA ~1/11 of the max score) — this function never decides
// direction itself, it only describes what the real scorer already used.
export function deriveSignalComponents(input: {
  trend5dPct: number | null;
  changePercent: number;
  volRatio: number | null;
  yearPct: number | null;
  emaAlignment: "bullish" | "bearish" | "neutral" | null;
}): SignalComponent[] {
  const components: SignalComponent[] = [];

  if (input.trend5dPct !== null) {
    const dir = input.trend5dPct > 0.3 ? "long" : input.trend5dPct < -0.3 ? "short" : "neutral";
    components.push({
      name: "5-day trend", direction: dir, weight: 0.36,
      note: `${input.trend5dPct >= 0 ? "+" : ""}${input.trend5dPct.toFixed(2)}% over 5 sessions`,
    });
  }

  {
    const dir = input.changePercent > 0.8 ? "long" : input.changePercent < -0.8 ? "short" : "neutral";
    components.push({
      name: "today's move", direction: dir, weight: 0.18,
      note: `${input.changePercent >= 0 ? "+" : ""}${input.changePercent.toFixed(2)}% today`,
    });
  }

  if (input.volRatio !== null) {
    const active = input.volRatio >= 1.4;
    const dir = active ? (input.changePercent >= 0 ? "long" : "short") : "neutral";
    components.push({
      name: "volume", direction: dir, weight: 0.18,
      note: `${input.volRatio.toFixed(2)}x average volume`,
    });
  }

  if (input.yearPct !== null) {
    const dir = input.yearPct > 85 ? "long" : input.yearPct < 15 ? "short" : "neutral";
    components.push({
      name: "52-week position", direction: dir, weight: 0.09,
      note: `${input.yearPct.toFixed(0)}% of 52-week range`,
    });
  }

  if (input.emaAlignment) {
    const dir = input.emaAlignment === "bullish" ? "long" : input.emaAlignment === "bearish" ? "short" : "neutral";
    components.push({
      name: "EMA structure", direction: dir, weight: 0.09,
      note: `price/EMA20/EMA50 stack is ${input.emaAlignment}`,
    });
  }

  return components;
}

// ── Options chain slice ─────────────────────────────────────────────────────────

export type ChainContract = {
  type: "call" | "put";
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  oi: number;
  volume: number;
  iv: number;      // decimal, 0.35 = 35%
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

const CHAIN_DTE_MIN = 3;
const CHAIN_DTE_MAX = 75;
const CHAIN_DELTA_MIN = 0.15;
const CHAIN_DELTA_MAX = 0.85;
const CHAIN_MAX_CONTRACTS = 16; // token-budget guess — recheck real payload size on first run

// Widens the single-ATM-strike extraction options-scan/route.ts does today into
// a real multi-strike, multi-expiry slice with full greeks, so the engine can
// apply its own delta-based strike selection (§5) instead of being handed one
// pre-picked contract. Independent of options-scan/route.ts — does not modify
// or call into it.
export async function fetchOptionsChainSlice(symbol: string): Promise<{ spot: number; chain: ChainContract[] } | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.cboe.com/",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json())?.data;
    if (!data?.current_price || !Array.isArray(data.options)) return null;

    const spot = data.current_price as number;
    const symLen = symbol.length;
    const today = new Date().toISOString().split("T")[0];
    const nowMs = Date.now();

    function parseOpt(name: string): { expiry: string; type: "C" | "P"; strike: number } | null {
      const body = name.slice(symLen);
      const m = /^(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(body);
      if (!m) return null;
      return { expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4] as "C" | "P", strike: parseInt(m[5], 10) / 1000 };
    }

    const num = (raw: Record<string, unknown>, key: string): number | null => {
      const v = raw[key];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };

    const chain: ChainContract[] = [];
    for (const opt of data.options as Record<string, unknown>[]) {
      const p = parseOpt(opt.option as string);
      if (!p || p.expiry <= today) continue;
      const expiryTs = new Date(p.expiry + "T20:00:00Z").getTime();
      const dte = Math.max(1, Math.ceil((expiryTs - nowMs) / 86_400_000));
      if (dte < CHAIN_DTE_MIN || dte > CHAIN_DTE_MAX) continue;

      const bid = num(opt, "bid") ?? 0;
      const ask = num(opt, "ask") ?? 0;
      const delta = num(opt, "delta");
      const iv = num(opt, "iv");
      if (bid <= 0 || ask <= 0 || delta === null || iv === null) continue;
      if (Math.abs(delta) < CHAIN_DELTA_MIN || Math.abs(delta) > CHAIN_DELTA_MAX) continue;

      chain.push({
        type: p.type === "C" ? "call" : "put",
        strike: p.strike,
        expiry: p.expiry,
        dte,
        bid, ask, mid: parseFloat(((bid + ask) / 2).toFixed(4)),
        oi: num(opt, "open_interest") ?? 0,
        volume: num(opt, "volume") ?? 0,
        iv,
        delta,
        gamma: num(opt, "gamma") ?? 0,
        theta: num(opt, "theta") ?? 0,
        vega: num(opt, "vega") ?? 0,
      });
    }

    // Cap by open interest — keeps the payload bounded to real, liquid contracts
    // rather than every far-OTM strike CBOE happens to list.
    chain.sort((a, b) => b.oi - a.oi);
    return { spot, chain: chain.slice(0, CHAIN_MAX_CONTRACTS) };
  } catch { return null; }
}
