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

// ── NYSE trading calendar (v4.1 options analysis) ──────────────────────────────
// Holidays and 1:00 PM ET early closes. Coverage is explicit: any date after
// CALENDAR_VERIFIED_THROUGH returns UNKNOWN rather than guessing, so the
// options analysis fails closed (G3) instead of trading through an unlisted
// holiday. Extend both lists from the published NYSE schedule each year.
export const CALENDAR_VERIFIED_THROUGH = "2026-12-31";

const NYSE_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]);
const NYSE_EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24"]);

export type SessionStatus = {
  status: "OPEN" | "CLOSED" | "UNKNOWN";
  calendar: "NYSE";
  early_close: boolean;
  detail: string;
};

export function nyseSessionStatus(d: Date = new Date()): SessionStatus {
  const date = etTradingDate(d);
  const base = { calendar: "NYSE" as const, early_close: false };
  if (date > CALENDAR_VERIFIED_THROUGH) {
    return { ...base, status: "UNKNOWN", detail: `Trading calendar not verified past ${CALENDAR_VERIFIED_THROUGH}` };
  }
  if (isWeekend(d))               return { ...base, status: "CLOSED", detail: "Weekend" };
  if (NYSE_HOLIDAYS.has(date))    return { ...base, status: "CLOSED", detail: "NYSE holiday" };
  const early = NYSE_EARLY_CLOSES.has(date);
  const closeMins = early ? 780 : 960;
  const { mins } = etParts(d);
  if (mins < 570)        return { ...base, early_close: early, status: "CLOSED", detail: "Before regular session" };
  if (mins >= closeMins) return { ...base, early_close: early, status: "CLOSED", detail: "After regular session" };
  return { ...base, early_close: early, status: "OPEN", detail: early ? "Regular session (early close 13:00 ET)" : "Regular session" };
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
