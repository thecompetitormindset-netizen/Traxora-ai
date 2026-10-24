// Single source of truth for ET market-time math — DST-aware "is it a trading day,
// what session are we in" logic that was previously duplicated inline in
// dashboard/page.tsx, intelligence/page.tsx, and pro-analysis/route.ts.

function etOffsetHours(d: Date): -4 | -5 {
  const y = d.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(y, 2, 1));
  const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - marchFirst.getUTCDay()) % 7) + 7, 7));
  const novFirst = new Date(Date.UTC(y, 10, 1));
  const dstEnd = new Date(Date.UTC(y, 10, 1 + ((7 - novFirst.getUTCDay()) % 7), 6));
  return d >= dstStart && d < dstEnd ? -4 : -5;
}

function etParts(d: Date): { y: number; m: number; day: number; mins: number; weekday: number } {
  const off = etOffsetHours(d);
  const shifted = new Date(d.getTime() + off * 3_600_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    mins: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

// "2026-08-19" in Eastern Time, regardless of what UTC date it currently is —
// this is the key the options analysis persists one row per symbol under.
export function etTradingDate(d: Date = new Date()): string {
  const { y, m, day } = etParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWeekend(d: Date = new Date()): boolean {
  const { weekday } = etParts(d);
  return weekday === 0 || weekday === 6;
}

// NYSE regular session 9:30–16:00 ET. Doesn't account for market holidays —
// same limitation the three call sites this replaces already had.
export function isMarketOpen(d: Date = new Date()): boolean {
  if (isWeekend(d)) return false;
  const { mins } = etParts(d);
  return mins >= 570 && mins < 960;
}

export type MarketSession = "pre" | "open" | "midday" | "power_hour" | "post";

export function marketSession(d: Date = new Date()): MarketSession {
  if (isWeekend(d)) return "post";
  const { mins } = etParts(d);
  if (mins < 570) return "pre";           // before 9:30
  if (mins < 630) return "open";          // 9:30–10:30
  if (mins < 900) return "midday";        // 10:30–15:00
  if (mins < 960) return "power_hour";    // 15:00–16:00
  return "post";                          // after 16:00
}

// ── NYSE trading calendar ──────────────────────────────────────────────────────
// Derived from the Exchange's published rules rather than listed per year, so
// the calendar does not expire. Previously both lists covered a single year and
// every later date returned UNKNOWN, which made the options analysis fail closed
// (G3_SESSION) for every symbol from 1 January onwards.
//
// What is derivable: the nine scheduled holidays and the three 1:00 PM ET early
// closes, all of which follow fixed rules. What is not: unscheduled closures for
// national mourning or emergencies, which have no rule and are listed below.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Day of week for a calendar date, 0 = Sunday. */
const dowOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

const isWeekdayDow = (w: number) => w >= 1 && w <= 5;

/** Day-of-month of the nth given weekday, e.g. the 3rd Monday of January. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  return 1 + ((weekday - dowOf(y, m, 1) + 7) % 7) + (n - 1) * 7;
}

/** Day-of-month of the last given weekday in a month. */
function lastWeekday(y: number, m: number, weekday: number): number {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days - ((dowOf(y, m, days) - weekday + 7) % 7);
}

/** Easter Sunday by the Gregorian computus. Good Friday is two days earlier. */
function easterSunday(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return { m: month, d: ((h + l - 7 * m + 114) % 31) + 1 };
}

function shiftDays(y: number, m: number, d: number, by: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Where a fixed-date holiday is actually observed.
 *
 * A holiday on Saturday moves back to the Friday and one on Sunday forward to
 * the Monday — except that the Exchange stays open on the last trading day of
 * the year, so a New Year's Day falling on Saturday is simply not observed.
 */
function observedDate(y: number, m: number, d: number): string | null {
  const w = dowOf(y, m, d);
  if (w === 6) return m === 1 && d === 1 ? null : shiftDays(y, m, d, -1);
  if (w === 0) return shiftDays(y, m, d, +1);
  return iso(y, m, d);
}

/**
 * Closures with no rule behind them: days of mourning and emergencies. These
 * cannot be derived, so a new one has to be added here when it is announced.
 * A missing entry makes the day look open; the freshness gates still reject the
 * stale quotes that would come back from a closed market.
 */
const NYSE_AD_HOC_CLOSURES = new Set([
  "2012-10-29", "2012-10-30", // Hurricane Sandy
  "2018-12-05",               // National day of mourning — George H. W. Bush
  "2025-01-09",               // National day of mourning — Jimmy Carter
]);

/** Juneteenth became an Exchange holiday in 2022; MLK Day in 1998. */
const JUNETEENTH_FROM = 2022;
const MLK_FROM = 1998;

function buildCalendar(y: number): { holidays: Set<string>; earlyCloses: Set<string> } {
  const holidays = new Set<string>();
  const add = (date: string | null) => { if (date) holidays.add(date); };

  add(observedDate(y, 1, 1));                                   // New Year's Day
  if (y >= MLK_FROM) add(iso(y, 1, nthWeekday(y, 1, 1, 3)));    // MLK Day — 3rd Monday
  add(iso(y, 2, nthWeekday(y, 2, 1, 3)));                       // Washington's Birthday — 3rd Monday
  const easter = easterSunday(y);                               // Good Friday
  add(shiftDays(y, easter.m, easter.d, -2));
  add(iso(y, 5, lastWeekday(y, 5, 1)));                         // Memorial Day — last Monday
  if (y >= JUNETEENTH_FROM) add(observedDate(y, 6, 19));        // Juneteenth
  add(observedDate(y, 7, 4));                                   // Independence Day
  add(iso(y, 9, nthWeekday(y, 9, 1, 1)));                       // Labor Day — 1st Monday
  const thanksgiving = nthWeekday(y, 11, 4, 4);                 // 4th Thursday
  add(iso(y, 11, thanksgiving));
  add(observedDate(y, 12, 25));                                 // Christmas

  // 1:00 PM ET early closes. The day before a fixed-date holiday is only a half
  // day when both it and the holiday itself fall on weekdays — otherwise the
  // observance rules above have already moved things around.
  const earlyCloses = new Set<string>();
  earlyCloses.add(iso(y, 11, thanksgiving + 1));                // Friday after Thanksgiving
  if (isWeekdayDow(dowOf(y, 7, 3)) && isWeekdayDow(dowOf(y, 7, 4))) earlyCloses.add(iso(y, 7, 3));
  if (isWeekdayDow(dowOf(y, 12, 24)) && isWeekdayDow(dowOf(y, 12, 25))) earlyCloses.add(iso(y, 12, 24));

  return { holidays, earlyCloses };
}

const calendarCache = new Map<number, ReturnType<typeof buildCalendar>>();

export function nyseCalendar(year: number) {
  let cal = calendarCache.get(year);
  if (!cal) { cal = buildCalendar(year); calendarCache.set(year, cal); }
  return cal;
}

/** Every scheduled NYSE holiday in a year, as ET date strings, ascending. */
export function nyseHolidays(year: number): string[] {
  return [...nyseCalendar(year).holidays].sort();
}

/** Every 1:00 PM ET early close in a year, ascending. */
export function nyseEarlyCloses(year: number): string[] {
  return [...nyseCalendar(year).earlyCloses].sort();
}

export type SessionStatus = {
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  calendar: "NYSE";
  early_close: boolean;
  detail: string;
};

export function nyseSessionStatus(d: Date = new Date()): SessionStatus {
  const date = etTradingDate(d);
  const { y, mins } = etParts(d);
  const base = { calendar: "NYSE" as const, early_close: false };
  // "UNKNOWN" stays in the type: stored analyses from before the calendar was
  // computed can still carry it, and the schema validates those rows.
  if (isWeekend(d))                       return { ...base, status: "CLOSED", detail: "Weekend" };
  if (NYSE_AD_HOC_CLOSURES.has(date))     return { ...base, status: "CLOSED", detail: "Unscheduled NYSE closure" };
  const cal = nyseCalendar(y);
  if (cal.holidays.has(date))             return { ...base, status: "CLOSED", detail: "NYSE holiday" };
  const early = cal.earlyCloses.has(date);
  const closeMins = early ? 780 : 960;
  if (mins < 570)        return { ...base, early_close: early, status: "CLOSED", detail: "Before regular session" };
  if (mins >= closeMins) return { ...base, early_close: early, status: "CLOSED", detail: "After regular session" };
  return { ...base, early_close: early, status: "OPEN", detail: early ? "Regular session (early close 13:00 ET)" : "Regular session" };
}

/**
 * The next instant the regular session opens, or null if the market is already
 * open. Walks forward a day at a time over the derived calendar, which only
 * works now that the calendar has no expiry — the old lists ran out and every
 * date past them was UNKNOWN.
 */
export function nextMarketOpen(from: Date = new Date()): Date | null {
  if (nyseSessionStatus(from).status === "OPEN") return null;

  // 9:30 ET on a given ET calendar date, as a UTC instant.
  const openAt = (y: number, m: number, d: number): Date => {
    const naive = Date.UTC(y, m - 1, d, 9, 30);
    // The offset depends on the date itself; probing at the naive instant is
    // exact outside the overnight DST switch, which is never a session start.
    return new Date(naive - etOffsetHours(new Date(naive)) * 3_600_000);
  };

  const { y, m, day } = etParts(from);
  // A fortnight is more than enough to clear any holiday run.
  for (let i = 0; i < 14; i++) {
    const probe = new Date(Date.UTC(y, m - 1, day + i));
    const candidate = openAt(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
    if (candidate > from && nyseSessionStatus(candidate).status === "OPEN") return candidate;
  }
  return null;
}

/** "2d 21h", "6h 40m", "in under a minute" — coarse on purpose. */
export function humanDuration(ms: number): string {
  if (ms <= 60_000) return "under a minute";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

// "2026-10-08T15:59:59" (Eastern wall-clock, no zone — how CBOE reports
// last_trade_time) → UTC ISO string. Returns null for anything unparseable.
export function etNaiveToIso(naive: string | null | undefined): string | null {
  if (!naive) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(naive);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  // Offset depends on the ET date itself; probing at the naive instant is
  // exact except inside the 1-hour DST transition window (overnight, no trading).
  const off = etOffsetHours(new Date(asUtc));
  return new Date(asUtc - off * 3_600_000).toISOString();
}
