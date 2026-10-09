"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Panel from "../components/Panel";
import Link from "next/link";

type EarningsEvent = {
  symbol:   string;
  name:     string;
  estimate: number | null;
  currency: string;
};

type CalendarDay = {
  date:    string;
  weekday: string;
  label:   string;
  events:  EarningsEvent[];
};

type CalendarData = {
  week:   string;
  monday: string;
  days:   CalendarDay[];
  unavailable?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addWeek(monday: string, n: number): string {
  const d = new Date(monday + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().split("T")[0];
}

function isToday(date: string): boolean {
  return date === new Date().toISOString().split("T")[0];
}

// ── Earnings event card ───────────────────────────────────────────────────────

function EventCard({ ev }: { ev: EarningsEvent }) {
  return (
    <Panel padding="sm">
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-xs font-black text-[var(--text-primary)] leading-tight">{ev.symbol}</span>
        {ev.estimate !== null && (
          <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded shrink-0">
            Est ${ev.estimate.toFixed(2)}
          </span>
        )}
      </div>
      <p className="text-[10px] text-[var(--text-secondary)] leading-snug mb-2 truncate">{ev.name}</p>
      <Link
        href={`/analysis?symbol=${encodeURIComponent(ev.symbol + ".US")}`}
        className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        Analyse →
      </Link>
    </Panel>
  );
}

// ── Day column ────────────────────────────────────────────────────────────────

function DayColumn({ day, today }: { day: CalendarDay; today: boolean }) {
  return (
    <div className={`flex-1 min-w-0 rounded-2xl border p-3 ${
      today
        ? "border-emerald-500/30 bg-emerald-500/[0.04]"
        : "border-[var(--border)] bg-[var(--bg-surface)]"
    }`}>
      {/* Day header */}
      <div className="mb-3">
        <p className={`text-[9px] font-black uppercase tracking-widest ${today ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}>
          {day.weekday.slice(0, 3)}
          {today && <span className="ml-1 text-[7px] px-1 py-px rounded bg-emerald-500/20 text-emerald-400 normal-case tracking-normal font-bold">Today</span>}
        </p>
        <p className={`text-sm font-black mt-0.5 ${today ? "text-emerald-300" : "text-[var(--text-primary)]"}`}>{day.label}</p>
        {day.events.length > 0 && (
          <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{day.events.length} report{day.events.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Events */}
      <div className="space-y-2">
        {day.events.length === 0 ? (
          <p className="text-[10px] text-[var(--text-muted)] text-center py-4">No reports</p>
        ) : (
          day.events.map(ev => <EventCard key={ev.symbol} ev={ev} />)
        )}
      </div>
    </div>
  );
}

// ── Skeleton column ───────────────────────────────────────────────────────────

function SkeletonColumn() {
  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 animate-pulse">
      <div className="h-3 bg-[var(--border)] rounded w-8 mb-1" />
      <div className="h-4 bg-[var(--border)] rounded w-14 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]" />
        ))}
      </div>
    </div>
  );
}

// ── Main content (needs Suspense because of useSearchParams) ──────────────────

function EarningsContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [data,    setData]    = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const fromParam = searchParams.get("from") ?? "";

  const load = useCallback(async (from: string) => {
    setLoading(true);
    setError("");
    try {
      const params = from ? `?from=${encodeURIComponent(from)}` : "";
      const res    = await fetch(`/api/market/earnings-calendar${params}`, { cache: "no-store" });
      const json   = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `Error ${res.status}`);
      const cal = json as CalendarData;
      setData({ ...cal, days: Array.isArray(cal.days) ? cal.days : [] });
      if (cal.unavailable) setError("The earnings calendar is unavailable right now. Try again later.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(fromParam);
  }, [fromParam, load]);

  function navigate(weeks: number) {
    const base = data?.monday ?? fromParam;
    if (!base) { load(""); return; }
    const next = addWeek(base, weeks);
    router.push(`/earnings?from=${next}`);
  }

  const today = new Date().toISOString().split("T")[0];
  const totalEvents = data?.days.reduce((s, d) => s + d.events.length, 0) ?? 0;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-7xl mx-auto w-full">

          {/* ── Header ── */}
          <div className="mt-3 mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gradient-green">Earnings Calendar</h1>
              {data && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {data.week} · {totalEvents} report{totalEvents !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigate(-1)}
                disabled={loading}
                className="px-3 py-2 rounded-xl border border-[var(--border)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40">
                ← Prev
              </button>
              <button type="button" onClick={() => router.push("/earnings")}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40">
                This Week
              </button>
              <button type="button" onClick={() => navigate(1)}
                disabled={loading}
                className="px-3 py-2 rounded-xl border border-[var(--border)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          {/* ── Calendar grid ── */}
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 300 }}>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonColumn key={i} />)
              : data?.days.map(day => (
                  <DayColumn key={day.date} day={day} today={isToday(day.date)} />
                ))
            }
          </div>

          {/* ── Summary strip (non-loading) ── */}
          {!loading && data && totalEvents > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {data.days.map(day => (
                <div key={day.date} className={`rounded-xl border px-3 py-2 text-center ${
                  isToday(day.date) ? "border-emerald-500/30 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--bg-surface)]"
                }`}>
                  <p className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest">{day.weekday.slice(0, 3)}</p>
                  <p className={`text-lg font-black font-mono ${day.events.length > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                    {day.events.length}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
            Data from Alpha Vantage · EPS estimates may differ from actual · Not financial advice
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function EarningsPage() {
  return (
    <PaywallGuard>
      <Suspense fallback={
        <div className="flex min-h-screen text-[#F1F5F9] items-center justify-center">
          <div className="text-[#4B5675] text-sm animate-pulse">Loading calendar…</div>
        </div>
      }>
        <EarningsContent />
      </Suspense>
    </PaywallGuard>
  );
}
