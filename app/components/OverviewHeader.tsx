"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ListState } from "./fieldnotes/useOptionsList";
import { stateOf } from "./fieldnotes/uiState";
import { loadNotebook } from "../lib/analysisNotebook";
import { getJournal } from "./AutoJournal";

// The top of Overview: one sentence that answers "does anything need me?",
// then four numbers that link to where the detail lives. Everything shown is
// derived from data the page already has — nothing is invented to fill space.

type Props = {
  options: ListState;
  watchCount: number;
  watchSignals: number;       // BUY/SELL with high confidence
  paperOpen: number;
  paperValue: number | null;
  refreshIn: number;
  actions?: React.ReactNode;  // alerts controls, rendered quietly on the right
};

const etDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

export default function OverviewHeader({ options, watchCount, watchSignals, paperOpen, paperValue, refreshIn, actions }: Props) {
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadNotebook().length + getJournal().length);
  }, []);

  const data = options.kind === "ready" ? options.data : null;
  const states = (data?.analyses ?? []).map(stateOf);
  const validated = states.filter(s => s === "validated").length;
  const analyzed = states.length;
  const open = data?.session.status === "OPEN";

  const headline = validated > 0
    ? `${validated} options candidate${validated === 1 ? "" : "s"} passed every check.`
    : watchSignals > 0
      ? `${watchSignals} watchlist signal${watchSignals === 1 ? "" : "s"} worth a look.`
      : "Nothing needs your attention right now.";

  const lede = [
    data ? `${analyzed} options analyses finished${validated ? `, ${validated} validated` : " with no qualifying candidate"}.` : "Options analysis is loading.",
    `${watchCount} symbol${watchCount === 1 ? "" : "s"} on your watchlist${watchSignals ? `, ${watchSignals} with a strong signal` : ""}.`,
    data && !open ? "The next regular session opens at 9:30 ET." : null,
  ].filter(Boolean).join(" ");

  const stats = [
    { k: "Options", v: data ? String(validated) : "—", s: data ? `validated · ${analyzed - validated} no trade` : "loading", href: "/options" },
    { k: "Watchlist", v: String(watchCount), s: `${watchSignals} strong signal${watchSignals === 1 ? "" : "s"}`, href: "#watchlist" },
    { k: "Paper portfolio", v: String(paperOpen), s: paperValue !== null ? `open · $${Math.round(paperValue).toLocaleString("en-US")} simulated` : "open positions", href: "/paper" },
    { k: "Journal", v: saved === null ? "—" : String(saved), s: "saved entries", href: "/journal" },
  ];

  return (
    <header className="mb-8 lg:mb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="mx-label flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${open ? "bg-[var(--mx-up)]" : "bg-[var(--mx-text-3)]"}`} />
            {data ? `NYSE ${open ? "open" : "closed"}` : "NYSE"}
          </span>
          <span>{etDate.format(new Date())}</span>
          <span>Delayed data</span>
          <span>Refresh in {refreshIn}s</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      </div>

      <h1 data-tour="overview-headline" className="mt-4 text-[32px] lg:text-[44px] leading-[1.06] tracking-[-0.03em] text-[var(--mx-text)] max-w-[20ch]" style={{ fontWeight: 450 }}>
        {headline}
      </h1>
      <p className="mt-3 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">{lede}</p>

      <dl data-tour="overview-stats" className="mt-8 grid grid-cols-2 lg:grid-cols-4 rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] overflow-hidden" aria-label="Summary">
        {stats.map((x, i) => (
          <Link
            key={x.k}
            href={x.href}
            className={`block p-4 lg:p-5 hover:bg-[var(--mx-raised)] transition-colors border-[var(--mx-line)] ${i % 2 === 0 ? "border-r" : "lg:border-r"} ${i < 2 ? "border-b lg:border-b-0" : ""} ${i === 3 ? "lg:border-r-0" : ""}`}
          >
            <dt className="mx-label">{x.k}</dt>
            <dd className="mt-2.5 text-[28px] leading-none tracking-[-0.02em] font-mono text-[var(--mx-text)]">{x.v}</dd>
            <dd className="mt-1.5 text-[13px] text-[var(--mx-text-3)]">{x.s}</dd>
          </Link>
        ))}
      </dl>
    </header>
  );
}
