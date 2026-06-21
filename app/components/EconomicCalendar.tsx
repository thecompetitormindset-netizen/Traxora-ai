"use client";

// Hardcoded upcoming macro events through Dec 2026.
// These are known far in advance — no API needed.

type EventType = "FOMC" | "CPI" | "NFP" | "PCE" | "GDP" | "RETAIL";

type MacroEvent = {
  date:  string; // YYYY-MM-DD
  type:  EventType;
  label: string;
  note?: string;
};

const EVENTS: MacroEvent[] = [
  // ── June 2026 ─────────────────────────────────────────────────────────────
  { date: "2026-06-26", type: "PCE",    label: "PCE Price Index",        note: "May 2026" },
  // ── July 2026 ─────────────────────────────────────────────────────────────
  { date: "2026-07-10", type: "NFP",    label: "Jobs Report (NFP)",      note: "June 2026" },
  { date: "2026-07-15", type: "CPI",    label: "CPI Release",            note: "June 2026" },
  { date: "2026-07-16", type: "RETAIL", label: "Retail Sales",           note: "June 2026" },
  { date: "2026-07-29", type: "FOMC",   label: "FOMC Decision",          note: "Rate announcement" },
  { date: "2026-07-30", type: "GDP",    label: "GDP Advance (Q2)",       note: "First estimate" },
  { date: "2026-07-31", type: "PCE",    label: "PCE Price Index",        note: "June 2026" },
  // ── August 2026 ───────────────────────────────────────────────────────────
  { date: "2026-08-07", type: "NFP",    label: "Jobs Report (NFP)",      note: "July 2026" },
  { date: "2026-08-12", type: "CPI",    label: "CPI Release",            note: "July 2026" },
  { date: "2026-08-14", type: "RETAIL", label: "Retail Sales",           note: "July 2026" },
  { date: "2026-08-29", type: "PCE",    label: "PCE Price Index",        note: "July 2026" },
  // ── September 2026 ────────────────────────────────────────────────────────
  { date: "2026-09-04", type: "NFP",    label: "Jobs Report (NFP)",      note: "Aug 2026" },
  { date: "2026-09-11", type: "CPI",    label: "CPI Release",            note: "Aug 2026" },
  { date: "2026-09-12", type: "RETAIL", label: "Retail Sales",           note: "Aug 2026" },
  { date: "2026-09-16", type: "FOMC",   label: "FOMC Decision",          note: "Rate announcement" },
  { date: "2026-09-26", type: "PCE",    label: "PCE Price Index",        note: "Aug 2026" },
  // ── October 2026 ──────────────────────────────────────────────────────────
  { date: "2026-10-02", type: "NFP",    label: "Jobs Report (NFP)",      note: "Sep 2026" },
  { date: "2026-10-15", type: "CPI",    label: "CPI Release",            note: "Sep 2026" },
  { date: "2026-10-16", type: "RETAIL", label: "Retail Sales",           note: "Sep 2026" },
  { date: "2026-10-29", type: "FOMC",   label: "FOMC Decision",          note: "Rate announcement" },
  { date: "2026-10-29", type: "GDP",    label: "GDP Advance (Q3)",       note: "First estimate" },
  { date: "2026-10-30", type: "PCE",    label: "PCE Price Index",        note: "Sep 2026" },
  // ── November 2026 ─────────────────────────────────────────────────────────
  { date: "2026-11-06", type: "NFP",    label: "Jobs Report (NFP)",      note: "Oct 2026" },
  { date: "2026-11-13", type: "CPI",    label: "CPI Release",            note: "Oct 2026" },
  { date: "2026-11-14", type: "RETAIL", label: "Retail Sales",           note: "Oct 2026" },
  { date: "2026-11-25", type: "PCE",    label: "PCE Price Index",        note: "Oct 2026" },
  // ── December 2026 ─────────────────────────────────────────────────────────
  { date: "2026-12-04", type: "NFP",    label: "Jobs Report (NFP)",      note: "Nov 2026" },
  { date: "2026-12-10", type: "FOMC",   label: "FOMC Decision",          note: "Rate announcement" },
  { date: "2026-12-11", type: "CPI",    label: "CPI Release",            note: "Nov 2026" },
  { date: "2026-12-16", type: "RETAIL", label: "Retail Sales",           note: "Nov 2026" },
  { date: "2026-12-23", type: "PCE",    label: "PCE Price Index",        note: "Nov 2026" },
];

const TYPE_STYLE: Record<EventType, { badge: string; dot: string; label: string }> = {
  FOMC:   { badge: "bg-violet-500/15 text-violet-400 border-violet-500/25",  dot: "bg-violet-500",  label: "FOMC"   },
  CPI:    { badge: "bg-blue-500/15 text-blue-400 border-blue-500/25",        dot: "bg-blue-500",    label: "CPI"    },
  NFP:    { badge: "bg-amber-500/15 text-amber-400 border-amber-500/25",     dot: "bg-amber-500",   label: "NFP"    },
  PCE:    { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",dot: "bg-emerald-500",label: "PCE"    },
  GDP:    { badge: "bg-sky-500/15 text-sky-400 border-sky-500/25",           dot: "bg-sky-500",     label: "GDP"    },
  RETAIL: { badge: "bg-orange-500/15 text-orange-400 border-orange-500/25",  dot: "bg-orange-500",  label: "Sales"  },
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function EconomicCalendar() {
  const today = new Date().toISOString().split("T")[0];

  // Filter: today and future only, max ~3 months (15 events)
  const upcoming = EVENTS
    .filter(e => e.date >= today)
    .slice(0, 16);

  // Group by month
  const byMonth = new Map<string, MacroEvent[]>();
  for (const ev of upcoming) {
    const mon = monthLabel(ev.date);
    if (!byMonth.has(mon)) byMonth.set(mon, []);
    byMonth.get(mon)!.push(ev);
  }

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-[#4B5675]">
        Upcoming macro events that move markets — FOMC, CPI, Jobs, PCE, GDP
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TYPE_STYLE) as [EventType, typeof TYPE_STYLE[EventType]][]).map(([, s]) => (
          <span key={s.label} className={`flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-md border ${s.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Events by month */}
      {[...byMonth.entries()].map(([mon, events]) => (
        <div key={mon}>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675] mb-2 pb-1 border-b border-[#1A1838]">
            {mon}
          </p>
          <div className="space-y-2">
            {events.map((ev, i) => {
              const days    = daysUntil(ev.date);
              const isToday = days === 0;
              const past    = days < 0;
              const style   = TYPE_STYLE[ev.type];

              return (
                <div
                  key={`${ev.date}-${i}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    isToday
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : past
                        ? "border-[#1A1838] bg-transparent opacity-40"
                        : days <= 7
                          ? "border-amber-500/20 bg-amber-500/[0.03]"
                          : "border-[#252345] bg-[#13112A]"
                  }`}
                >
                  {/* Date column */}
                  <div className="shrink-0 w-20 text-center">
                    <p className={`text-[10px] font-black ${isToday ? "text-emerald-400" : "text-[#CBD5E1]"}`}>
                      {fmtDate(ev.date)}
                    </p>
                    {isToday ? (
                      <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-px rounded-full">Today</span>
                    ) : !past ? (
                      <p className="text-[9px] text-[#4B5675] font-mono">
                        {days === 1 ? "Tomorrow" : `in ${days}d`}
                      </p>
                    ) : null}
                  </div>

                  {/* Type badge */}
                  <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md border ${style.badge}`}>
                    {style.label}
                  </span>

                  {/* Label */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold ${past ? "text-[#4B5675]" : "text-[#F1F5F9]"}`}>{ev.label}</p>
                    {ev.note && <p className="text-[9px] text-[#4B5675]">{ev.note}</p>}
                  </div>

                  {/* High-impact marker for FOMC */}
                  {ev.type === "FOMC" && !past && (
                    <span className="shrink-0 text-[8px] font-black text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">HIGH</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-center text-[10px] text-[#333368]">
        Dates are estimates — always verify before trading · Not financial advice
      </p>
    </div>
  );
}
