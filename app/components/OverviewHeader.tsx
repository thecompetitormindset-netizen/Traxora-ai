"use client";

import type { ListState } from "./fieldnotes/useOptionsList";
import { stateOf } from "./fieldnotes/uiState";
import HeroMetric from "./overview/HeroMetric";
import WhyBreakdown, { type WhyRow } from "./overview/WhyBreakdown";
import NeedsYou, { type NeedsYouItem } from "./overview/NeedsYou";
import SinceYouLastLooked from "./overview/SinceYouLastLooked";
import { useRecentSessions } from "./overview/useRecentSessions";
import { humanDuration, nextMarketOpen } from "../lib/marketTime";

// The top of Overview: the headline number, what explains it, and the short
// list of things worth acting on.
//
// The headline adapts to the session, because one metric cannot answer both
// questions. While the market is open the useful number is what the engine
// found today. It is shut about four fifths of the week, and a count of the
// engine's output is zero for all of it — so out of hours the headline becomes
// the figure that is actually the reader's own and never stops being true:
// their practice record. The card beside it swaps the same way, from "why
// today's names did not pass" to "what you missed".
//
// Everything shown is derived from data the page already has. Where a figure
// has not been reported the row is omitted rather than shown as zero, so an
// empty card means "no data", never "nothing happened".

export type PaperSummary = {
  accountValue: number;
  realizedPL: number;
  openCount: number;
  closedCount: number;
  winRate: number | null;
  startingCapital: number;
};

type Props = {
  options: ListState;
  watchCount: number;
  watchSignals: number;       // BUY/SELL with high confidence
  paper: PaperSummary;
  refreshIn: number;
  actions?: React.ReactNode;  // alerts controls, rendered quietly on the right
};

const etDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const etOpenDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" });
const etOpenTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

export default function OverviewHeader({ options, watchCount, watchSignals, paper, refreshIn, actions }: Props) {
  const now = new Date();
  const data = options.kind === "ready" ? options.data : null;
  const states = (data?.analyses ?? []).map(stateOf);
  const validated = states.filter(s => s === "validated").length;
  const open = data?.session.status === "OPEN";

  // "Weekend", "NYSE holiday", "Before regular session" — say which, rather than
  // leaving a bare zero to look like a fault.
  const sessionDetail = data
    ? data.session.detail === "Weekend" ? "The market is closed for the weekend."
      : data.session.detail === "NYSE holiday" ? "The market is closed for a holiday."
      : data.session.detail === "Before regular session" ? "It has not opened yet today."
      : data.session.detail === "After regular session" ? "It has closed for today."
      : `The market is closed (${data.session.detail.toLowerCase()}).`
    : "";

  const scan = data?.scan ?? null;
  const scanning = !!scan?.running;
  const checked = scan?.checked ?? null;
  const universe = scan?.total ?? null;

  // ── Hero: the one number the rest of the block explains ─────────────────────
  // A zero outside the session is not the checks rejecting things: no structure
  // is proposed at all while the market is shut, so saying "nothing cleared the
  // checks" would blame the wrong thing for roughly four fifths of the week.
  const heroCaption = data
    ? validated > 0
      ? `Contract, source, liquidity and pricing checks all passed. Fills and results remain uncertain, and these are for paper trading only.`
      : !open
        ? `Ideas are only proposed during the regular session, 9:30–16:00 ET on trading days. ${sessionDetail}`
        : scanning
          ? `Still working through the market. Ideas appear here as names clear every check.`
          : `No structure cleared every check today. That is a normal outcome, not a failure.`
    : options.kind === "error"
      ? `The analysis could not be loaded.`
      : `Checking the market…`;

  const sessionSupport = [
    checked !== null && universe !== null
      ? { k: "Names checked", v: checked.toLocaleString("en-US"), s: `of ${universe.toLocaleString("en-US")}` }
      : null,
    { k: "Watchlist", v: String(watchCount), s: watchSignals > 0 ? `${watchSignals} strong ${plural(watchSignals, "signal")}` : "nothing standing out" },
    {
      k: "Practice trades",
      v: String(paper.openCount),
      s: `$${Math.round(paper.accountValue).toLocaleString("en-US")} pretend money`,
    },
  ].filter((x): x is { k: string; v: string; s: string } => x !== null);

  // ── Out-of-hours headline: the reader's own record ──────────────────────────
  // Return as a percentage of starting capital so the figure means the same
  // thing whatever account size someone set.
  const plPct = paper.startingCapital > 0 ? (paper.realizedPL / paper.startingCapital) * 100 : 0;
  const tradedYet = paper.closedCount > 0 || paper.openCount > 0;
  const openAt = !open ? nextMarketOpen(now) : null;
  const opensIn = openAt ? humanDuration(openAt.getTime() - now.getTime()) : null;
  const opensLabel = openAt
    ? `${etOpenDay.format(openAt)} ${etOpenTime.format(openAt)} ET, in ${opensIn}`
    : null;

  const closedSupport = [
    paper.closedCount > 0 && paper.winRate !== null
      ? { k: "Hit rate", v: `${paper.winRate}%`, s: `${paper.closedCount} closed` }
      : null,
    paper.openCount > 0
      ? { k: "Still open", v: String(paper.openCount), s: "practice trades" }
      : null,
    openAt ? { k: "Market opens", v: opensIn!, s: etOpenDay.format(openAt) } : null,
  ].filter((x): x is { k: string; v: string; s: string } => x !== null);

  // ── Why: the engine's own no-trade reasons, already ranked ──────────────────
  const reasons = data?.reasons ?? [];
  const whyRows: WhyRow[] = reasons.slice(0, 5).map(r => ({ label: r.reason, count: r.count }));
  const whyTotal = reasons.reduce((s, r) => s + r.count, 0);

  const whyFootnote = scan
    ? [
        scan.thin > 0 ? `${scan.thin.toLocaleString("en-US")} ${plural(scan.thin, "name")} were too thinly traded to check.` : null,
        scan.deep > 0 ? `${scan.deep.toLocaleString("en-US")} got a full option-chain review.` : null,
        scan.unavailable > 0 ? `${scan.unavailable.toLocaleString("en-US")} could not be reached.` : null,
      ].filter(Boolean).join(" ")
    : undefined;

  // ── Needs you: ordered by how much it actually matters ──────────────────────
  const needsAll: (NeedsYouItem | null)[] = [
    validated > 0 ? {
      id: "options",
      badge: String(validated),
      tone: "up",
      title: `${validated} options ${plural(validated, "idea")} passed every check`,
      reason: "Paper trading only — read the full check list before acting.",
      href: "/options",
    } : null,
    watchSignals > 0 ? {
      id: "watchlist",
      badge: String(watchSignals),
      tone: "wait",
      title: `${watchSignals} watchlist ${plural(watchSignals, "signal")} with a strong read`,
      reason: "Trend, day range and volume all point the same way.",
      href: "#watchlist",
    } : null,
    paper.openCount > 0 ? {
      id: "paper",
      badge: String(paper.openCount),
      tone: "mute",
      title: `${paper.openCount} practice ${plural(paper.openCount, "trade")} still open`,
      reason: "Close them out to see how the read actually worked.",
      href: "/paper",
    } : null,
  ];
  const needs = needsAll.filter((x): x is NeedsYouItem => x !== null);

  // Past sessions are only worth fetching when the "why" card has stepped
  // aside for them, which is exactly when the market is shut.
  const recent = useRecentSessions(data !== null && !open);

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

      {/* The page title stays a title. What actually happened today is the
          hero number's job, so the two never say the same thing twice. */}
      <h1 data-tour="overview-headline" className="mt-4 text-[32px] lg:text-[44px] leading-[1.06] tracking-[-0.03em] text-[var(--mx-text)]" style={{ fontWeight: 450 }}>
        Overview
      </h1>

      <div data-tour="overview-stats" className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
        {data && !open ? (
          // Out of hours the engine's output is zero by construction, so the
          // headline becomes the one figure that is the reader's own.
          <HeroMetric
            label="Your practice record"
            value={tradedYet ? `${signed(plPct)}%` : "—"}
            quiet={!tradedYet}
            chip={{ text: "market closed", tone: "mute" }}
            caption={
              tradedYet
                ? `${signed(Math.round(paper.realizedPL), 0)} on $${Math.round(paper.startingCapital).toLocaleString("en-US")} of pretend money. ${sessionDetail}${opensLabel ? ` Opens ${opensLabel}.` : ""}`
                : `No practice trades yet — the record fills in once you take one. ${sessionDetail}${opensLabel ? ` The market opens ${opensLabel}.` : ""}`
            }
            support={closedSupport}
            href="/paper"
          />
        ) : (
          <HeroMetric
            label="Ideas that passed every check"
            value={data ? String(validated) : "—"}
            quiet={!data || validated === 0}
            chip={
              scanning ? { text: "still scanning", tone: "wait" }
              : data ? { text: "market open", tone: "mute" }
              : undefined
            }
            caption={heroCaption}
            support={sessionSupport}
            href={validated > 0 ? "/options" : undefined}
          />
        )}

        {data && !open ? (
          <SinceYouLastLooked
            sessions={recent.kind === "ready" ? recent.sessions : []}
            loading={recent.kind === "loading"}
            available={recent.kind === "ready" ? recent.available : true}
          />
        ) : (
          <WhyBreakdown
            title={validated > 0 ? "Why the rest did not pass" : "Why nothing passed"}
            subtitle={checked !== null ? `Across ${checked.toLocaleString("en-US")} ${plural(checked, "name")} checked today` : undefined}
            rows={whyRows}
            total={whyTotal}
            footnote={whyFootnote || undefined}
            emptyText={scanning ? "Still checking — reasons appear as names finish." : "No reasons reported yet."}
          />
        )}

        <NeedsYou
          items={needs}
          emptyText={
            data && !open && opensLabel
              ? `Nothing needs you right now. The market opens ${opensLabel}.`
              : "Nothing needs your attention right now."
          }
        />
      </div>
    </header>
  );
}
