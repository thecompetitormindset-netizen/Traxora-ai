"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import type { EarningsDay, EarningsRow, EarningsWeek } from "../api/market/earnings-week/route";

// Company results calendar, in plain words. One day at a time, biggest
// companies first. Data: /api/market/earnings-week (Nasdaq).

const BIG = 10e9; // "well-known companies" = worth $10 billion or more

const dayName = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayLong = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const shortDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;

function size(n: number | null) {
  if (!n) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)} trillion company`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)} billion company`;
  return `$${(n / 1e6).toFixed(0)} million company`;
}

function Expectation({ r }: { r: EarningsRow }) {
  if (r.forecast == null) return <span className="text-[var(--mx-text-3)]">No forecast available</span>;
  let compare: React.ReactNode = null;
  if (r.lastYear != null) {
    const diff = r.forecast - r.lastYear;
    compare = (
      <span className={diff > 0 ? "text-[var(--mx-up)]" : diff < 0 ? "text-[var(--mx-down)]" : "text-[var(--mx-text-3)]"}>
        {" "}· {diff > 0 ? "more than" : diff < 0 ? "less than" : "same as"} last year ({usd(r.lastYear)})
      </span>
    );
  }
  return <span className="text-[var(--mx-text-2)]">Expected profit: {usd(r.forecast)} a share{compare}</span>;
}

function Row({ r }: { r: EarningsRow }) {
  return (
    <li className="px-4 sm:px-5 py-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[15px] truncate">
          {r.name} <span className="font-mono text-[13px] text-[var(--mx-text-3)]">{r.symbol}</span>
        </p>
        <p className="mt-1 text-[13.5px]"><Expectation r={r} /></p>
        <p className="mt-1 text-[12.5px] text-[var(--mx-text-3)]">
          {r.when === "before" ? "Before the market opens" : r.when === "after" ? "After the market closes" : "Time not announced"}
          {size(r.marketCap) ? ` · ${size(r.marketCap)}` : ""}
        </p>
      </div>
      <Link href={`/company/${encodeURIComponent(r.symbol)}`} className="shrink-0 h-8 px-3 inline-flex items-center rounded-full border border-[var(--mx-line)] text-[12.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] hover:border-[var(--mx-line-strong)]">
        View
      </Link>
    </li>
  );
}

function EarningsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const from = params.get("from") ?? "";
  const [week, setWeek] = useState<EarningsWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(async (f: string) => {
    setLoading(true); setFailed(false);
    try {
      const r = await fetch(`/api/market/earnings-week${f ? `?from=${f}` : ""}`, { cache: "no-store" });
      const j = await r.json() as EarningsWeek;
      setWeek(j);
      if (!j.days.some(d => d.rows.length)) setFailed(j.days.every(d => d.rows.length === 0));
    } catch { setFailed(true); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on week change
  useEffect(() => { setPicked(null); setAll(false); load(from); }, [from, load]);

  // Default day: today if it's in this week and has results, else the first day with results.
  const today = todayISO();
  const days: EarningsDay[] = week?.days ?? [];
  const fallback = days.find(d => d.date === today && d.rows.length)?.date ?? days.find(d => d.date >= today && d.rows.length)?.date ?? days.find(d => d.rows.length)?.date ?? days[0]?.date ?? null;
  const active = picked ?? fallback;
  const current = days.find(d => d.date === active);
  const big = current?.rows.filter(r => (r.marketCap ?? 0) >= BIG) ?? [];
  const shown = all || big.length === 0 ? current?.rows ?? [] : big;
  const go = (n: number) => week && router.push(`/earnings?from=${addDays(week.monday, n * 7)}`);

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            <header>
              <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Company results</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--mx-text-2)] max-w-[60ch]">
                Every three months, companies tell everyone how much money they made. Their stock often jumps or drops a lot on that day — so it’s good to know when it’s coming.
              </p>
            </header>

            {/* Week + days */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px]">{week ? `Week of ${shortDate(week.monday)}` : " "}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => go(-1)} disabled={!week || loading} className="h-9 px-3.5 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] disabled:opacity-40">← Earlier</button>
                  {from && <button type="button" onClick={() => router.push("/earnings")} className="h-9 px-3.5 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">This week</button>}
                  <button type="button" onClick={() => go(1)} disabled={!week || loading} className="h-9 px-3.5 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] disabled:opacity-40">Next →</button>
                </div>
              </div>
              <div role="tablist" aria-label="Day" className="grid grid-cols-5 gap-2">
                {(loading ? Array.from({ length: 5 }, () => null) : days).map((d, i) => d ? (
                  <button key={d.date} type="button" role="tab" aria-selected={d.date === active} onClick={() => { setPicked(d.date); setAll(false); }}
                    className={`rounded-[12px] border px-2 py-2.5 text-center transition-colors ${d.date === active ? "border-[var(--mx-text)] bg-[var(--mx-text)] text-[var(--mx-canvas)]" : "border-[var(--mx-line)] hover:border-[var(--mx-line-strong)]"}`}>
                    <span className="block text-[13px]">{d.date === today ? "Today" : dayName(d.date)}</span>
                    <span className={`block text-[12px] ${d.date === active ? "opacity-70" : "text-[var(--mx-text-3)]"}`}>{d.rows.length} {d.rows.length === 1 ? "report" : "reports"}</span>
                  </button>
                ) : <div key={i} className="h-[58px] rounded-[12px] bg-[var(--mx-raised)] animate-pulse" />)}
              </div>
            </section>

            {/* List */}
            <section className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]" aria-live="polite">
              {loading ? (
                <div className="p-5 space-y-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 rounded bg-[var(--mx-raised)] animate-pulse" />)}</div>
              ) : failed ? (
                <p className="p-6 text-[14px] text-[var(--mx-text-2)]">We couldn’t load the calendar right now. Please try again in a few minutes.</p>
              ) : !current || current.rows.length === 0 ? (
                <p className="p-6 text-[14px] text-[var(--mx-text-2)]">No companies report on {current ? dayLong(current.date) : "this day"}.</p>
              ) : (
                <>
                  <div className="px-4 sm:px-5 py-3 border-b border-[var(--mx-line)] flex items-center justify-between gap-3">
                    <p className="text-[14px]">{dayLong(current.date)}</p>
                    {big.length > 0 && big.length < current.rows.length && (
                      <button type="button" onClick={() => setAll(a => !a)} className="text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">
                        {all ? "Show well-known companies" : `Show all ${current.rows.length}`}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-[var(--mx-line)]">{shown.map(r => <Row key={r.symbol} r={r} />)}</ul>
                </>
              )}
            </section>

            <p className="text-[12.5px] text-[var(--mx-text-3)]">
              “Expected profit” is the average forecast from analysts. Companies can beat or miss it, and the stock can move either way. Source: Nasdaq. For learning — not financial advice.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function EarningsPage() {
  return (
    <PaywallGuard>
      <Suspense>
        <EarningsContent />
      </Suspense>
    </PaywallGuard>
  );
}
