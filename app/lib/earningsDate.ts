// Next earnings date per symbol, from free sources only.
//
// This existed as a single Yahoo quoteSummary call. Measured against production
// across three cold instances, Yahoo answered 1 of 9 requests from the
// deployment's address and was shut out entirely in the last two — so a feature
// resting on it alone is mostly absent, and silently so: every failure path
// returned null, which renders as "no earnings soon" rather than "unknown".
//
// That distinction matters more here than anywhere else in the app. An earnings
// date is a pre-trade safety check; a missing one reads as all-clear. The point
// of this file is that a blank should mean "no earnings within the window",
// not "we could not reach anyone".
//
// Three sources, in order of how much they can be relied on:
//
//   1. Finnhub /calendar/earnings — per symbol, full 90-day window, one call.
//      Proven reachable from production; whether this particular endpoint is on
//      the free plan is not certain, and a 403 falls through like any other no.
//   2. Nasdaq's public earnings calendar — no key, answered in ~1.1s in every
//      production sample. Indexed by DATE rather than symbol, so it is swept
//      over the next two trading weeks and covers every requested symbol in one
//      pass. Bounded, cached for an hour, and only consulted for symbols the
//      first source missed.
//   3. Yahoo quoteSummary — the original source, kept last rather than dropped.
//      An 11% success rate is still better than nothing once it is third.
//
// The sweep's shorter horizon is a deliberate trade and worth being explicit
// about: it can only see two weeks out, where the other two see ninety days. It
// is a backstop for the imminent dates — the ones a pre-trade check actually
// turns on — not a full replacement.

import { etTradingDate, nyseCalendar } from "./marketTime";
import { finnhubJson, isFinnhubEligible, type FinnhubStats } from "./finnhubFetch";
import { yahooFetch, type YahooStats } from "./yahooFetch";

/** Dates beyond this are not shown, matching the behaviour this replaces. */
export const EARNINGS_HORIZON_DAYS = 90;

/** How far the Nasdaq fallback sweep looks, in trading days. */
const SWEEP_TRADING_DAYS = 10;

export type EarningsSource = "finnhub" | "nasdaq" | "yahoo";

export type EarningsHit = {
  /** ET calendar date, `YYYY-MM-DD`. */
  date: string;
  source: EarningsSource;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` as a UTC midnight instant, for exact whole-day arithmetic. */
function isoToUtc(iso: string): number | null {
  if (!ISO.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  return Number.isFinite(t) ? t : null;
}

const utcToIso = (t: number): string => new Date(t).toISOString().slice(0, 10);

/**
 * Whole days from `today` to `date`, both ET calendar dates. Negative is past.
 * Both sides are parsed at UTC midnight so this is exact — no DST drift and no
 * fractional-day rounding, which is what makes "earns tomorrow" trustworthy.
 */
export function daysUntil(date: string, today: string): number | null {
  const a = isoToUtc(date);
  const b = isoToUtc(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86_400_000);
}

/**
 * The badge text, or null when the date is in the past or past the horizon.
 * Wording is unchanged from the route this replaces, so the UI is untouched.
 */
export function earningsLabel(date: string, today: string): string | null {
  const days = daysUntil(date, today);
  if (days === null || days < 0 || days > EARNINGS_HORIZON_DAYS) return null;
  if (days === 0) return "Earns today";
  if (days === 1) return "Earns tomorrow";
  if (days <= 7) return `Earns in ${days}d`;
  const t = isoToUtc(date)!;
  // Rendered from the UTC-midnight instant in UTC, so the printed day matches
  // the ET date string rather than shifting a day in a western timezone.
  return `Earns ${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** The earliest date that is today or later and inside the horizon. */
export function pickNextEarningsDate(dates: string[], today: string): string | null {
  const future = dates
    .filter(d => ISO.test(d))
    .map(d => ({ d, n: daysUntil(d, today) }))
    .filter((x): x is { d: string; n: number } => x.n !== null && x.n >= 0 && x.n <= EARNINGS_HORIZON_DAYS)
    .sort((a, b) => a.n - b.n);
  return future[0]?.d ?? null;
}

/**
 * The next `count` NYSE trading days starting from `today` inclusive, skipping
 * weekends and holidays off the derived calendar — so the sweep never spends a
 * request on a date nobody reports on.
 */
export function nextTradingDays(count: number, today: string): string[] {
  const start = isoToUtc(today);
  if (start === null) return [];
  const out: string[] = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const t = start + i * 86_400_000;
    const day = new Date(t).getUTCDay();
    if (day === 0 || day === 6) continue;
    const iso = utcToIso(t);
    if (nyseCalendar(new Date(t).getUTCFullYear()).holidays.has(iso)) continue;
    out.push(iso);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

type FinnhubCalendar = { earningsCalendar?: Array<{ date?: string; symbol?: string }> };

/** Finnhub, per symbol, across the whole horizon in one call. */
async function fromFinnhub(
  symbol: string,
  today: string,
  stats?: FinnhubStats,
): Promise<string | null> {
  if (!isFinnhubEligible(symbol)) return null;

  const to = utcToIso(isoToUtc(today)! + EARNINGS_HORIZON_DAYS * 86_400_000);
  const res = await finnhubJson<FinnhubCalendar>(
    `calendar/earnings?from=${today}&to=${to}&symbol=${encodeURIComponent(symbol)}`,
    { timeoutMs: 6_000, budgetMs: 8_000, stats, label: `earnings ${symbol}` },
  );
  if (res.kind !== "ok") return null;

  const rows = Array.isArray(res.data?.earningsCalendar) ? res.data.earningsCalendar : [];
  const dates = rows
    .filter(r => !r.symbol || r.symbol.toUpperCase() === symbol.toUpperCase())
    .map(r => r.date)
    .filter((d): d is string => typeof d === "string");

  // An empty calendar is a real answer — this company is not due to report
  // inside the window — so a 200 counts as ok either way. finnhubJson leaves
  // the ok/miss call to the caller precisely because only here is that known.
  if (stats) stats.ok++;

  return pickNextEarningsDate(dates, today);
}

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** One day of Nasdaq's calendar, cached for an hour — these dates don't move intraday. */
const dayCache = new Map<string, { at: number; symbols: Set<string> }>();
const DAY_TTL = 60 * 60_000;
const DAY_MAX_KEYS = 40;

/**
 * Empties the day cache. Exists for tests: the cache is module state with an
 * hour's life, so without this one test's mocked calendar answers the next
 * test's sweep and the suite passes or fails on ordering.
 */
export function __clearEarningsDayCache(): void {
  dayCache.clear();
}

async function nasdaqDay(date: string): Promise<Set<string>> {
  const hit = dayCache.get(date);
  if (hit && Date.now() - hit.at < DAY_TTL) return hit.symbols;

  const symbols = new Set<string>();
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      cache: "no-store",
      headers: {
        "User-Agent": NASDAQ_UA,
        Accept: "application/json",
        Origin: "https://www.nasdaq.com",
        Referer: "https://www.nasdaq.com/",
      },
      signal: AbortSignal.timeout(9_000),
    });
    if (r.ok) {
      const j = await r.json() as { data?: { rows?: Array<{ symbol?: string }> | null } };
      for (const row of j.data?.rows ?? []) {
        if (row.symbol) symbols.add(row.symbol.trim().toUpperCase());
      }
    }
  } catch {
    // An unreachable day contributes nothing; the other days still count.
  }

  // Only cache a day that returned something. An empty set is far more likely
  // to be a failed request than a trading day on which nobody reports.
  if (symbols.size > 0) {
    if (dayCache.size >= DAY_MAX_KEYS) dayCache.delete(dayCache.keys().next().value as string);
    dayCache.set(date, { at: Date.now(), symbols });
  }
  return symbols;
}

/**
 * Sweep the next two trading weeks and return the first date each wanted symbol
 * appears on. Days are walked in order and the sweep stops once every symbol is
 * placed, so a common case costs far fewer than the full ten requests.
 */
async function fromNasdaqSweep(wanted: string[], today: string, deadline: number): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (wanted.length === 0) return found;

  const upper = new Map(wanted.map(s => [s.toUpperCase(), s]));

  for (const date of nextTradingDays(SWEEP_TRADING_DAYS, today)) {
    if (Date.now() >= deadline || upper.size === 0) break;
    const symbols = await nasdaqDay(date);
    for (const [u, original] of [...upper]) {
      if (symbols.has(u)) {
        found.set(original, date);
        upper.delete(u);
      }
    }
  }
  return found;
}

type YahooCalendar = {
  quoteSummary?: {
    result?: Array<{ calendarEvents?: { earnings?: { earningsDate?: Array<{ raw?: number }> } } }>;
  };
};

/** The original source, now last. */
async function fromYahoo(symbol: string, today: string, stats?: YahooStats): Promise<string | null> {
  const res = await yahooFetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`,
    { timeoutMs: 5_000, budgetMs: 7_000, label: `earnings ${symbol}`, stats },
  );
  if (!res) return null;

  let json: YahooCalendar;
  try { json = await res.json() as YahooCalendar; }
  catch { return null; }

  const raw = json?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
  const dates = raw
    .map(e => e?.raw)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0)
    // Yahoo gives a unix instant; convert through ET so the calendar date
    // matches what the other two sources report.
    .map(t => etTradingDate(new Date(t * 1000)));

  return pickNextEarningsDate(dates, today);
}

// ---------------------------------------------------------------------------

export type ResolveOptions = {
  today?: string;
  /** Overall ceiling. Keep it under the route's maxDuration. */
  budgetMs?: number;
  finnhubStats?: FinnhubStats;
  yahooStats?: YahooStats;
};

/**
 * Next earnings date for each symbol, or null where no source knew one.
 *
 * Never throws. A symbol missing from every source maps to null, which the
 * caller renders as no badge — the same as today, but now only after three
 * sources have been asked rather than one.
 */
export async function resolveEarningsDates(
  symbols: string[],
  opts: ResolveOptions = {},
): Promise<Record<string, EarningsHit | null>> {
  const {
    today = etTradingDate(),
    budgetMs = 20_000,
    finnhubStats,
    yahooStats,
  } = opts;

  const deadline = Date.now() + budgetMs;
  const out: Record<string, EarningsHit | null> = {};
  for (const s of symbols) out[s] = null;
  if (symbols.length === 0) return out;

  // 1. Finnhub, per symbol and in parallel.
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const date = await fromFinnhub(symbol, today, finnhubStats);
      if (date) out[symbol] = { date, source: "finnhub" };
    } catch { /* leave null for the next stage */ }
  }));

  // 2. One Nasdaq sweep for whatever is still unknown. Symbols Finnhub
  //    positively placed are not re-asked; symbols it had no answer for are,
  //    because "no answer" and "nothing scheduled" are indistinguishable here.
  const unresolved = symbols.filter(s => out[s] === null);
  if (unresolved.length > 0 && Date.now() < deadline) {
    try {
      const swept = await fromNasdaqSweep(unresolved, today, deadline);
      for (const [symbol, date] of swept) out[symbol] = { date, source: "nasdaq" };
    } catch { /* leave null for the next stage */ }
  }

  // 3. Yahoo for the remainder, which is the only source that can still see
  //    past the sweep's two-week horizon.
  const stillUnknown = symbols.filter(s => out[s] === null);
  if (stillUnknown.length > 0 && Date.now() < deadline) {
    await Promise.all(stillUnknown.map(async (symbol) => {
      try {
        const date = await fromYahoo(symbol, today, yahooStats);
        if (date) out[symbol] = { date, source: "yahoo" };
      } catch { /* stays null */ }
    }));
  }

  return out;
}
