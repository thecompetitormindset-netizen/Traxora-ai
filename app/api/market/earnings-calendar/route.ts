export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { auth } from "@/auth";

export type EarningsEvent = {
  symbol:   string;
  name:     string;
  estimate: number | null;  // EPS estimate in USD
  currency: string;
};

export type CalendarDay = {
  date:    string;   // YYYY-MM-DD
  weekday: string;   // "Monday" etc.
  label:   string;   // "Jun 23"
  events:  EarningsEvent[];
};

// ── Module-level 1-hour cache ────────────────────────────────────────────────
// Alpha Vantage free tier: 25 calls/day. Cache all raw CSV to avoid waste.
let avCache: { csv: string; ts: number } | null = null;
const AV_TTL = 60 * 60 * 1000; // 1 hour

// Exported so the options engine can reuse the same 1-hour-cached fetch instead
// of burning separate Alpha Vantage free-tier quota (25 calls/day, shared).
export async function fetchAVCalendar(): Promise<string> {
  if (avCache && Date.now() - avCache.ts < AV_TTL) return avCache.csv;

  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY not set");

  const res = await fetch(
    `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${key}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Alpha Vantage error ${res.status}`);
  const csv = await res.text();
  avCache = { csv, ts: Date.now() };
  return csv;
}

export type RawEvent = EarningsEvent & { reportDate: string };

export function parseCSV(csv: string): RawEvent[] {
  const lines = csv.trim().split("\n").slice(1); // skip header
  const events: RawEvent[] = [];
  for (const line of lines) {
    const cols = line.split(",").map(c => c.trim());
    if (cols.length < 4) continue;
    const [symbol, name, reportDate, , estimate, currency] = cols;
    if (!symbol || !reportDate) continue;
    events.push({
      symbol,
      name:     name ?? symbol,
      reportDate,
      estimate: estimate && estimate !== "" ? parseFloat(estimate) : null,
      currency: currency ?? "USD",
    });
  }
  return events;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function weekdayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function shortLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url      = new URL(req.url);
  const fromParam = url.searchParams.get("from"); // YYYY-MM-DD (Monday)

  // Compute the Monday for the requested week (or current week)
  let monday: Date;
  if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    monday = new Date(fromParam + "T12:00:00Z");
  } else {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  }

  // Build Mon–Fri date strings
  const weekDates = [0, 1, 2, 3, 4].map(i => isoDate(addDays(monday, i)));

  try {
    const csv    = await fetchAVCalendar();
    const events = parseCSV(csv);

    // Group events by date, keeping only Mon–Fri of this week
    const grouped = new Map<string, EarningsEvent[]>();
    for (const d of weekDates) grouped.set(d, []);

    for (const ev of events) {
      if (grouped.has(ev.reportDate)) {
        grouped.get(ev.reportDate)!.push({
          symbol:   ev.symbol,
          name:     ev.name,
          estimate: ev.estimate,
          currency: ev.currency,
        });
      }
    }

    // Sort each day's events alphabetically
    const days: CalendarDay[] = weekDates.map(date => ({
      date,
      weekday: weekdayLabel(date),
      label:   shortLabel(date),
      events:  (grouped.get(date) ?? []).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }));

    // Friendly week range header
    const weekLabel = `${shortLabel(weekDates[0])} – ${shortLabel(weekDates[4])}`;

    return Response.json({ week: weekLabel, monday: isoDate(monday), days });
  } catch {
    return Response.json({ week: "", monday: "", days: {} });
  }
}
