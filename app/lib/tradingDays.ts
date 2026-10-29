// Counting trading sessions between two dates.
//
// A pick is graded after a fixed number of SESSIONS, not calendar days, and the
// gap between those two is large enough to mislead: fourteen sessions is nearly
// three weeks, and lands further out again across Thanksgiving or Christmas.
//
// So a page showing "day 9 of 14" must count the same way the grader does.
// Counting calendar days and calling them sessions would put a pick's progress
// ahead of where it is and have it appear overdue days before it was — a small
// number that quietly says the wrong thing, which is the failure this codebase
// keeps finding.

import { nyseCalendar } from "./marketTime";

const DAY_MS = 86_400_000;

/** A safety stop. Nothing here spans more than a couple of years of sessions. */
const MAX_DAYS_SCANNED = 800;

const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A plain YYYY-MM-DD, parsed as UTC midnight so no local offset shifts the day. */
function parseISO(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** Whether a date is a session: a weekday the NYSE calendar does not close. */
export function isTradingDay(iso: string): boolean {
  const t = parseISO(iso);
  if (t === null) return false;
  const d = new Date(t);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !nyseCalendar(d.getUTCFullYear()).holidays.has(iso);
}

/**
 * Sessions strictly after `fromISO`, up to and including `toISO`.
 *
 * The entry day itself is not counted, which matches the grader: a pick taken
 * at Monday's close has had no session yet, and its first is Tuesday.
 *
 * Returns null for a date it cannot read or a range running backwards, rather
 * than 0 — a caller showing "0 of 14 sessions" for a pick entered weeks ago
 * would be stating something false, where a null can be left off the screen.
 */
export function tradingDaysElapsed(fromISO: string, toISO: string): number | null {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  if (from === null || to === null || to < from) return null;

  let count = 0;
  let scanned = 0;
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    if (++scanned > MAX_DAYS_SCANNED) return null;
    if (isTradingDay(isoOf(t))) count++;
  }
  return count;
}
