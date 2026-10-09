export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { viewer } from "@/app/lib/viewer";

// Company results ("earnings") for one Monday–Friday week, from Nasdaq's public
// earnings calendar (no API key). Used by the /earnings page. Biggest
// companies first, since those are the names most people know.

export type EarningsRow = {
  symbol: string;
  name: string;
  when: "before" | "after" | "unknown";   // before the market opens / after it closes
  forecast: number | null;                // analysts' expected profit per share
  lastYear: number | null;                // profit per share in the same quarter last year
  analysts: number | null;
  marketCap: number | null;
};
export type EarningsDay = { date: string; rows: EarningsRow[] };
export type EarningsWeek = { monday: string; days: EarningsDay[]; source: string };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const cache = new Map<string, { at: number; data: EarningsDay }>();
const TTL = 60 * 60_000;

const num = (s?: string): number | null => {
  if (!s || s === "N/A") return null;
  const neg = /^\(.*\)$/.test(s.trim());
  const n = parseFloat(s.replace(/[$,()\s]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};

type NasdaqRow = { symbol?: string; name?: string; time?: string; epsForecast?: string; lastYearEPS?: string; noOfEsts?: string; marketCap?: string };

async function day(date: string): Promise<EarningsDay> {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let rows: EarningsRow[] = [];
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) {
      const j = await r.json() as { data?: { rows?: NasdaqRow[] | null } };
      rows = (j.data?.rows ?? []).filter(x => x.symbol).map(x => ({
        symbol: x.symbol!.trim(),
        name: (x.name ?? x.symbol!).trim(),
        when: x.time === "time-pre-market" ? "before" : x.time === "time-after-hours" ? "after" : "unknown",
        forecast: num(x.epsForecast),
        lastYear: num(x.lastYearEPS),
        analysts: num(x.noOfEsts),
        marketCap: num(x.marketCap),
      }));
      rows.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    }
  } catch { /* leave empty; the page says so */ }
  const data = { date, rows };
  if (rows.length) cache.set(date, { at: Date.now(), data });
  return data;
}

function mondayOf(d: Date): Date {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = m.getUTCDay();
  m.setUTCDate(m.getUTCDate() + (wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd)); // weekend → next Monday
  return m;
}

export async function GET(req: Request) {
  await viewer();
  const from = new URL(req.url).searchParams.get("from");
  const base = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(from + "T12:00:00Z") : new Date();
  const mon = mondayOf(base);
  const dates = Array.from({ length: 5 }, (_, i) => new Date(mon.getTime() + i * 86400_000).toISOString().slice(0, 10));
  const days = await Promise.all(dates.map(day));
  return Response.json({ monday: dates[0], days, source: "Nasdaq" } satisfies EarningsWeek);
}
