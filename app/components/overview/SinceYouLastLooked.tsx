"use client";

import Link from "next/link";
import type { RecentSession } from "./useRecentSessions";

// What the market did while nobody was watching.
//
// This slot shows "why nothing passed" during the session, when that is the
// live question. Out of hours the useful question is instead "did I miss
// anything", which the stored runs can answer — each past day's ideas were
// already persisted, they were simply never read back.

const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function labelFor(runDate: string): string {
  const d = new Date(`${runDate}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? runDate : dayLabel.format(d);
}

export default function SinceYouLastLooked({
  sessions,
  loading,
  available,
}: {
  sessions: RecentSession[];
  loading: boolean;
  available: boolean;
}) {
  const totalIdeas = sessions.reduce((s, x) => s + x.ideas, 0);

  return (
    <section className="h-full rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 lg:p-6">
      <h2 className="text-[15px] text-[var(--mx-text)]">Recent sessions</h2>
      <p className="mt-1 text-[12px] text-[var(--mx-text-3)]">
        {loading ? "Looking back…"
          : sessions.length === 0 ? "No earlier sessions on record"
          : `${totalIdeas} ${totalIdeas === 1 ? "idea" : "ideas"} across the last ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}
      </p>

      {!loading && sessions.length === 0 ? (
        <p className="mt-5 text-[13px] text-[var(--mx-text-3)]">
          {available
            ? "Nothing has been checked before today yet. Past sessions appear here once the scan has run on an earlier day."
            : "Past sessions are not available right now."}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {sessions.map(s => (
            <li key={s.run_date} className="flex items-baseline justify-between gap-4">
              <span className="text-[13px] text-[var(--mx-text-2)]">{labelFor(s.run_date)}</span>
              <span className="flex items-baseline gap-2 shrink-0">
                <span className={`text-[13px] tabular-nums ${s.ideas > 0 ? "text-[var(--mx-text)]" : "text-[var(--mx-text-3)]"}`}>
                  {s.ideas === 0 ? "no ideas" : `${s.ideas} ${s.ideas === 1 ? "idea" : "ideas"}`}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--mx-text-3)]">
                  {s.checked.toLocaleString("en-US")} checked
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalIdeas > 0 && (
        <p className="mt-5 pt-4 border-t border-[var(--mx-line)] text-[12px] leading-snug text-[var(--mx-text-3)]">
          Ideas expire with their quotes, so past ones are a record of what the checks found, not something still open.{" "}
          <Link href="/options" className="text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Open options →</Link>
        </p>
      )}
    </section>
  );
}
