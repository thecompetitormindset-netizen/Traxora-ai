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
// this is the key used to key one options-engine run per trading day.
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
