"use client";

import type { ListState } from "./fieldnotes/useOptionsList";
import { stateOf } from "./fieldnotes/uiState";
import HeroMetric from "./overview/HeroMetric";
import WhyBreakdown, { type WhyRow } from "./overview/WhyBreakdown";
import NeedsYou, { type NeedsYouItem } from "./overview/NeedsYou";

// The top of Overview: one sentence that answers "does anything need me?", then
// the three cards the reference design leads with — the headline number, the
// decomposition that explains it, and the short list of things worth acting on.
//
// Everything shown is derived from data the page already has. Where the engine
// has not reported a figure the row is omitted rather than shown as zero, so an
// empty card means "no data", never "nothing happened".

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

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export default function OverviewHeader({ options, watchCount, watchSignals, paperOpen, paperValue, refreshIn, actions }: Props) {
  const data = options.kind === "ready" ? options.data : null;
  const states = (data?.analyses ?? []).map(stateOf);
  const validated = states.filter(s => s === "validated").length;
  const open = data?.session.status === "OPEN";

  const scan = data?.scan ?? null;
  const scanning = !!scan?.running;
  const checked = scan?.checked ?? null;
  const universe = scan?.total ?? null;

  // ── Hero: the one number the rest of the block explains ─────────────────────
  const heroCaption = data
    ? validated > 0
      ? `Contract, source, liquidity and pricing checks all passed. Fills and results remain uncertain, and these are for paper trading only.`
      : scanning
        ? `Still working through the market. Ideas appear here as names clear every check.`
        : `No structure cleared every check today. That is a normal outcome, not a failure.`
    : options.kind === "error"
      ? `The analysis could not be loaded.`
      : `Checking the market…`;

  const support = [
    checked !== null && universe !== null
      ? { k: "Names checked", v: checked.toLocaleString("en-US"), s: `of ${universe.toLocaleString("en-US")}` }
      : null,
    { k: "Watchlist", v: String(watchCount), s: watchSignals > 0 ? `${watchSignals} strong ${plural(watchSignals, "signal")}` : "nothing standing out" },
    {
      k: "Practice trades",
      v: String(paperOpen),
      s: paperValue !== null ? `$${Math.round(paperValue).toLocaleString("en-US")} pretend money` : "open",
    },
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
    paperOpen > 0 ? {
      id: "paper",
      badge: String(paperOpen),
      tone: "mute",
      title: `${paperOpen} practice ${plural(paperOpen, "trade")} still open`,
      reason: "Close them out to see how the read actually worked.",
      href: "/paper",
    } : null,
  ];
  const needs = needsAll.filter((x): x is NeedsYouItem => x !== null);

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
        <HeroMetric
          label="Ideas that passed every check"
          value={data ? String(validated) : "—"}
          quiet={!data || validated === 0}
          chip={
            scanning ? { text: "still scanning", tone: "wait" }
            : data ? { text: open ? "market open" : "market closed", tone: "mute" }
            : undefined
          }
          caption={heroCaption}
          support={support}
          href={validated > 0 ? "/options" : undefined}
        />

        <WhyBreakdown
          title={validated > 0 ? "Why the rest did not pass" : "Why nothing passed"}
          subtitle={checked !== null ? `Across ${checked.toLocaleString("en-US")} ${plural(checked, "name")} checked today` : undefined}
          rows={whyRows}
          total={whyTotal}
          footnote={whyFootnote || undefined}
          emptyText={scanning ? "Still checking — reasons appear as names finish." : "No reasons reported yet."}
        />

        <NeedsYou items={needs} />
      </div>
    </header>
  );
}
