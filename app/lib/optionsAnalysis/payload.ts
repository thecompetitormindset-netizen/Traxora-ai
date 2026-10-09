// Builds the v4.1 analysis input from public data. Parsing is pure and kept
// separate from fetching so it can be tested on recorded responses.
//
// Source honesty, per the policy:
// - CBOE's delayed-quotes JSON has one snapshot timestamp and per-contract
//   last_trade_time, but no time for each bid/ask. CBOE publishes these
//   quotes 15 minutes delayed, so each contract's quote time is taken as the
//   snapshot time minus that delay (decided 2026-10-09: practice-only ideas
//   on delayed prices, labelled as such). The freshness gate then applies its
//   normal age limits to that time. No snapshot → no quote time → UNKNOWN.
// - Missing values stay null. Nothing is coerced to zero.

import { AnalysisInput, SCHEMA_VERSION, type InputContract, type InputExpiry, type InputLevel, type InputSignal } from "./schema";
import { OPTIONS_RULES, PAPER_TRADING_ONLY, type OptionsRules } from "./rules";
import { legFreshness } from "./strategies";
import { etNaiveToIso, etTradingDate, nyseSessionStatus } from "../marketTime";

const CBOE_SOURCE = "CBOE delayed quotes (public snapshot)";
/** CBOE's published delay for its public quotes. */
export const CBOE_DELAY_SECONDS = 15 * 60;
const MAX_EXPIRIES = 6;
const STRIKE_WINDOW = 0.25;        // keep strikes within ±25% of spot
const IV_RANK_MIN_OBSERVATIONS = 60;
const EARNINGS_HORIZON_DAYS = 88;  // Alpha Vantage horizon=3month, less a margin for cache age

const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => { const n = finite(v); return n === null ? null : Math.round(n); };

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate + "T00:00:00Z") - Date.parse(fromDate + "T00:00:00Z")) / 86_400_000);
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── CBOE chain ──────────────────────────────────────────────────────────────────

export type ParsedChain = {
  price: number | null;
  priceTimestamp: string | null;
  snapshotTimestamp: string | null;
  iv30: number | null;              // percent, as CBOE reports it
  securityType: string | null;
  contracts: Omit<InputContract, "freshness">[];
};

export function parseCboeChain(json: unknown, symbol: string, asOf: string, rules: OptionsRules = OPTIONS_RULES): ParsedChain | null {
  const root = json as { timestamp?: unknown; data?: Record<string, unknown> } | null;
  const data = root?.data;
  if (!data || !Array.isArray(data.options)) return null;

  const price = finite(data.current_price);
  // Top-level snapshot time is UTC without a zone marker ("2026-10-08 21:53:42").
  const snap = typeof root?.timestamp === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(root.timestamp)
    ? new Date(root.timestamp.replace(" ", "T") + "Z").toISOString() : null;
  const securityType = typeof data.security_type === "string" ? data.security_type : null;
  const specKnown = securityType === "stock" || securityType === "etf";
  const today = etTradingDate(new Date(asOf));

  // Every bid/ask in the snapshot is as of (snapshot − published delay).
  const quoteTime = snap ? new Date(Date.parse(snap) - CBOE_DELAY_SECONDS * 1000).toISOString() : null;

  const contracts: Omit<InputContract, "freshness">[] = [];
  const expiries = new Set<string>();
  for (const opt of data.options as Record<string, unknown>[]) {
    const name = typeof opt.option === "string" ? opt.option : "";
    if (!name.startsWith(symbol)) continue;
    // Standard OCC body only; adjusted roots (e.g. AAPL1…) don't match and are skipped.
    const m = /^(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(name.slice(symbol.length));
    if (!m) continue;
    const expiry = `20${m[1]}-${m[2]}-${m[3]}`;
    const dte = daysBetween(today, expiry);
    if (dte < rules.min_swing_dte || dte > rules.max_swing_dte) continue;
    const strike = parseInt(m[5], 10) / 1000;
    if (price !== null && Math.abs(strike - price) / price > STRIKE_WINDOW) continue;
    if (!expiries.has(expiry) && expiries.size >= MAX_EXPIRIES) continue;
    expiries.add(expiry);

    contracts.push({
      contract_id: name,
      type: m[4] === "C" ? "CALL" : "PUT",
      strike,
      expiry,
      dte,
      spec: specKnown
        ? { multiplier: 100, deliverable: `100 shares of ${symbol}`, exercise_style: "AMERICAN", settlement: "PHYSICAL", standard: true }
        : null,
      bid: finite(opt.bid),
      ask: finite(opt.ask),
      quote_timestamp: quoteTime,
      last_trade_timestamp: etNaiveToIso(typeof opt.last_trade_time === "string" ? opt.last_trade_time : null),
      iv: finite(opt.iv),
      delta: finite(opt.delta),
      open_interest: int(opt.open_interest),
      volume: int(opt.volume),
    });
  }

  return {
    price,
    priceTimestamp: etNaiveToIso(typeof data.last_trade_time === "string" ? data.last_trade_time : null),
    snapshotTimestamp: snap,
    iv30: finite(data.iv30),
    securityType,
    contracts,
  };
}

// ── Daily bars ──────────────────────────────────────────────────────────────────

export type DailyBar = { date: string; open: number; high: number; low: number; close: number; volume: number | null };

/** Yahoo v8 chart → bars aligned by timestamp; a bar with any missing OHLC value is dropped whole. */
export function parseYahooBars(json: unknown): DailyBar[] | null {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    { timestamp?: number[]; indicators?: { quote?: Record<string, (number | null)[]>[] } } | undefined;
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!ts || !q) return null;
  const bars: DailyBar[] = [];
  ts.forEach((t, i) => {
    const [open, high, low, close] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]].map(finite);
    if (open === null || high === null || low === null || close === null) return;
    bars.push({ date: etTradingDate(new Date(t * 1000)), open, high, low, close, volume: finite(q.volume?.[i]) });
  });
  return bars;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// ── Levels (numeric, from completed sessions only) ──────────────────────────────

export function deriveLevels(bars: DailyBar[], price: number, today: string): {
  support: InputLevel[] | null; resistance: InputLevel[] | null; liquidity_targets: InputLevel[] | null;
} {
  const done = bars.filter(b => b.date < today).slice(-60);
  if (done.length < 20) return { support: null, resistance: null, liquidity_targets: null };

  // Swing pivots: a bar whose low (high) is below (above) the two bars on each side.
  const lows: InputLevel[] = [], highs: InputLevel[] = [];
  for (let i = 2; i < done.length - 2; i++) {
    const w = done.slice(i - 2, i + 3);
    if (w.every((b, j) => j === 2 || b.low > done[i].low)) lows.push({ price: round2(done[i].low), label: `Swing low ${done[i].date}` });
    if (w.every((b, j) => j === 2 || b.high < done[i].high)) highs.push({ price: round2(done[i].high), label: `Swing high ${done[i].date}` });
  }
  const support = lows.filter(l => l.price < price).sort((a, b) => b.price - a.price).slice(0, 3);
  const resistance = highs.filter(l => l.price > price).sort((a, b) => a.price - b.price).slice(0, 3);
  const last20 = done.slice(-20);
  const hi20 = round2(Math.max(...last20.map(b => b.high)));
  const lo20 = round2(Math.min(...last20.map(b => b.low)));
  return {
    support,
    resistance,
    liquidity_targets: [
      { price: hi20, label: "20-session high (resting buy-side liquidity)" },
      { price: lo20, label: "20-session low (resting sell-side liquidity)" },
    ],
  };
}

// ── Signals ─────────────────────────────────────────────────────────────────────

export function deriveSignals(bars: DailyBar[], price: number, today: string, extra: { smartMoney?: "BUY" | "SELL" | "HOLD" | null }): InputSignal[] {
  const closes = bars.filter(b => b.date < today).map(b => b.close);
  const signals: InputSignal[] = [];
  const pct = (from: number) => ((price - from) / from) * 100;

  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  if (e20 !== null && e50 !== null) {
    const dir = price > e20 && e20 > e50 ? "BULLISH" : price < e20 && e20 < e50 ? "BEARISH" : "NEUTRAL";
    signals.push({
      name: "EMA_STACK", kind: "STRUCTURE", direction: dir, source: "Daily closes",
      reading: dir === "NEUTRAL" ? "Price, EMA20 and EMA50 are not stacked" : `Price, EMA20 and EMA50 stacked ${dir === "BULLISH" ? "upward" : "downward"}`,
    });
  }
  if (closes.length >= 5) {
    const c = pct(closes[closes.length - 5]);
    signals.push({
      name: "TREND_5D", kind: "STRUCTURE", source: "Daily closes",
      direction: c > 1 ? "BULLISH" : c < -1 ? "BEARISH" : "NEUTRAL",
      reading: `Price vs close 5 sessions ago: ${c >= 0 ? "+" : ""}${c.toFixed(1)}%`,
    });
  }
  if (closes.length >= 20) {
    const c = pct(closes[closes.length - 20]);
    signals.push({
      name: "TREND_20D", kind: "STRUCTURE", source: "Daily closes",
      direction: c > 3 ? "BULLISH" : c < -3 ? "BEARISH" : "NEUTRAL",
      reading: `Price vs close 20 sessions ago: ${c >= 0 ? "+" : ""}${c.toFixed(1)}%`,
    });
  }
  if (extra.smartMoney) {
    signals.push({
      name: "SMART_MONEY_SCORE", kind: "MODEL", source: "Traxora smartMoneyScore",
      direction: extra.smartMoney === "BUY" ? "BULLISH" : extra.smartMoney === "SELL" ? "BEARISH" : null,
      reading: `Score signal ${extra.smartMoney}`,
    });
  }
  const done = bars.filter(b => b.date < today);
  const lastVol = done.at(-1)?.volume ?? null;
  const vols = done.slice(-21, -1).map(b => b.volume).filter((v): v is number => v !== null);
  if (vols.length >= 10 && lastVol !== null) {
    const avg = vols.reduce((s, v) => s + v, 0) / vols.length;
    signals.push({
      name: "VOLUME_ACTIVITY", kind: "ACTIVITY", direction: null, source: "Daily volume",
      reading: `Last completed session volume is ${(lastVol / avg).toFixed(2)}x its 20-session average (activity, not direction)`,
    });
  }
  return signals;
}

// ── Volatility & expected move ──────────────────────────────────────────────────

/** Close-to-close realized vol over the last `period` returns, annualized decimal (0.35 = 35%). */
export function calcRealizedVol20(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const sl = closes.slice(-period - 1);
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  return Math.sqrt(variance * 252);
}

export function ivRank(history: number[], current: number | null): number | null {
  if (current === null || history.length < IV_RANK_MIN_OBSERVATIONS) return null;
  const lo = Math.min(...history, current), hi = Math.max(...history, current);
  return hi > lo ? round2(((current - lo) / (hi - lo)) * 100) : null;
}

export function expectedMoveFor(contracts: Omit<InputContract, "freshness">[], expiry: string, spot: number): InputExpiry["expected_move"] {
  const valid = (c: Omit<InputContract, "freshness">) => c.bid !== null && c.ask !== null && c.bid > 0 && c.ask >= c.bid;
  const k = [...new Set(contracts.filter(c => c.expiry === expiry).map(c => c.strike))]
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
  const call = contracts.find(c => c.expiry === expiry && c.strike === k && c.type === "CALL");
  const put = contracts.find(c => c.expiry === expiry && c.strike === k && c.type === "PUT");
  if (k === undefined || !call || !put || !valid(call) || !valid(put)) return null;
  const amount = round2((call.bid! + call.ask!) / 2 + (put.bid! + put.ask!) / 2);
  return {
    expiry, amount, lower: round2(spot - amount), upper: round2(spot + amount),
    method: `ATM straddle mid at strike ${k} (CBOE delayed snapshot; estimate)`,
  };
}

/** Mean IV of contracts within 3% of spot — the measure options_iv_history accumulates. */
export function atmIvOf(contracts: { strike: number; iv: number | null }[] | null, price: number | null): number | null {
  if (!contracts || price === null) return null;
  const near = contracts.filter(c => c.iv !== null && Math.abs(c.strike - price) / price < 0.03);
  return near.length ? near.reduce((s, c) => s + c.iv!, 0) / near.length : null;
}

// ── Earnings coverage ───────────────────────────────────────────────────────────

export type EarningsCalendar = { fetchedOk: true; events: { symbol: string; reportDate: string }[] } | { fetchedOk: false };

export function eventCoverageFor(cal: EarningsCalendar, symbol: string, expiry: string, today: string): InputExpiry["event_coverage"] {
  if (!cal.fetchedOk) return { status: "UNKNOWN", covered_through: null, events: [] };
  const coveredThrough = addDays(today, EARNINGS_HORIZON_DAYS);
  const events = cal.events
    .filter(e => e.symbol === symbol && e.reportDate >= today && e.reportDate <= expiry)
    .map(e => ({ type: "EARNINGS" as const, date: e.reportDate, name: `${symbol} earnings` }));
  return expiry <= coveredThrough
    ? { status: "VERIFIED", covered_through: coveredThrough, events }
    : { status: "UNKNOWN", covered_through: coveredThrough, events };
}

/** Alpha Vantage answers rate limits with a 200 and a JSON note — only a real CSV header counts as fetched. */
export function parseEarningsCsv(csv: string): EarningsCalendar {
  const [header, ...lines] = csv.trim().split("\n");
  if (!header?.toLowerCase().startsWith("symbol,name,reportdate")) return { fetchedOk: false };
  return {
    fetchedOk: true,
    events: lines.map(l => l.split(",").map(c => c.trim())).filter(c => c[0] && c[2]).map(c => ({ symbol: c[0], reportDate: c[2] })),
  };
}

// ── Assembly ────────────────────────────────────────────────────────────────────

export type BuildArgs = {
  symbol: string;
  asOf: string;
  chainJson: unknown;
  barsJson: unknown;
  earnings: EarningsCalendar;
  ivHistory?: number[];
  smartMoney?: "BUY" | "SELL" | "HOLD" | null;
  userContext?: AnalysisInput["user_context"];
  rules?: OptionsRules;
};

export function buildAnalysisInput(a: BuildArgs): AnalysisInput {
  const rules = a.rules ?? OPTIONS_RULES;
  const today = etTradingDate(new Date(a.asOf));
  const chain = parseCboeChain(a.chainJson, a.symbol, a.asOf, rules);
  const bars = parseYahooBars(a.barsJson);
  const price = chain?.price ?? null;

  const contracts: InputContract[] | null = chain
    ? chain.contracts.map(c => ({ ...c, freshness: legFreshness(c, a.asOf, rules) }))
    : null;

  const expiryList = chain ? [...new Set(chain.contracts.map(c => c.expiry))].sort() : [];
  const expiries: InputExpiry[] | null = chain && price !== null
    ? expiryList.map(expiry => ({
      expiry,
      dte: daysBetween(today, expiry),
      expected_move: expectedMoveFor(chain.contracts, expiry, price),
      event_coverage: eventCoverageFor(a.earnings, a.symbol, expiry, today),
    }))
    : null;

  const uAge = chain?.priceTimestamp ? (Date.parse(a.asOf) - Date.parse(chain.priceTimestamp)) / 1000 : null;
  const uMax = rules.freshness.max_underlying_age_seconds;

  const rank = ivRank(a.ivHistory ?? [], atmIvOf(chain?.contracts ?? null, price));
  const hv = bars ? calcRealizedVol20(bars.filter(b => b.date < today).map(b => b.close)) : null;

  const input: AnalysisInput = {
    schema_version: SCHEMA_VERSION,
    symbol: a.symbol,
    as_of: a.asOf,
    paper_trading_only: PAPER_TRADING_ONLY,
    session: nyseSessionStatus(new Date(a.asOf)),
    underlying: {
      price,
      price_timestamp: chain?.priceTimestamp ?? null,
      price_timestamp_kind: chain?.priceTimestamp ? "LAST_TRADE" : null,
      source: CBOE_SOURCE,
      freshness: {
        status: uAge === null ? "UNKNOWN" : uAge < -rules.freshness.clock_tolerance_seconds ? "UNKNOWN" : uAge <= uMax ? "FRESH" : "STALE",
        age_seconds: uAge,
        max_age_seconds: uMax,
        basis: "Underlying last-trade timestamp vs analysis time",
      },
    },
    bars: bars ? bars.slice(-60) : null,
    levels: bars && price !== null ? deriveLevels(bars, price, today) : { support: null, resistance: null, liquidity_targets: null },
    signals: bars && price !== null ? deriveSignals(bars, price, today, { smartMoney: a.smartMoney }) : [],
    volatility: {
      iv_rank: rank,
      iv_rank_basis: rank === null ? null : `ATM IV vs ${a.ivHistory!.length} stored daily observations`,
      iv30: chain?.iv30 ?? null,
      hv20: hv === null ? null : round2(hv * 100),
    },
    expiries,
    contracts,
    rules,
    risk_classification: null,
    user_context: a.userContext ?? null,
    sources: [
      { name: CBOE_SOURCE, snapshot_timestamp: chain?.snapshotTimestamp ?? null, note: "15-minute delayed; each bid/ask time is taken as snapshot time minus the 15-minute delay" },
      { name: "Yahoo Finance daily bars", snapshot_timestamp: null, note: "Levels and structure use completed sessions only" },
      { name: "Alpha Vantage earnings calendar", snapshot_timestamp: null, note: a.earnings.fetchedOk ? "3-month horizon" : "Unavailable for this run" },
    ],
  };
  // Fail loudly in development if the builder ever drifts from the contract.
  return AnalysisInput.parse(input);
}

// ── Fetch wrapper ───────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// CBOE's public quote CDN blocks bursts (429 for a few minutes). Space its
// requests out per server instance and back off when it pushes back. The
// whole-universe scan reads `cboeBlocked` to stop early instead of piling on.
const CBOE_GAP_MS = 450;
let cboeNext = 0;
let cboeStrikes = 0;
export function cboeBlocked(): boolean { return cboeStrikes >= 3; }
export function resetCboe() { cboeStrikes = 0; cboeNext = Date.now(); }
async function cboeTurn() {
  const now = Date.now();
  const wait = Math.max(0, cboeNext - now);
  cboeNext = Math.max(now, cboeNext) + CBOE_GAP_MS;
  if (wait) await new Promise(r => setTimeout(r, wait));
}

export async function fetchAnalysisSources(symbol: string): Promise<{ chainJson: unknown; barsJson: unknown }> {
  // One polite retry when a provider says "slow down" (429) — the whole-universe
  // scan makes thousands of these calls.
  const get = async (url: string, headers: Record<string, string>) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
        if (res.status === 429 && attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }
    return null;
  };
  const cboe = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await cboeTurn();
      try {
        const res = await fetch(`https://cdn-api.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`,
          { cache: "no-store", headers: { "User-Agent": UA, Referer: "https://www.cboe.com/", Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (res.status === 429) {
          cboeStrikes++;
          cboeNext = Date.now() + 10_000; // everyone waits 10s
          continue;
        }
        cboeStrikes = 0;
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }
    return null;
  };
  const [chainJson, barsJson] = await Promise.all([
    cboe(),
    get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`,
      { "User-Agent": "Mozilla/5.0" }),
  ]);
  return { chainJson, barsJson };
}
