"use client";

import { useMemo } from "react";
import { etTradingDate } from "../../lib/marketTime";
import { tradingDaysElapsed } from "../../lib/tradingDays";
import { useDailyPicks, type HistoryPick, type Pick } from "./useDailyPicks";

// The day's picks, and what the previous ones turned out to be worth.
//
// Two things this screen must not do, both of which it would do by default.
//
// It must not render an absence as a fact. An empty list is either "the job has
// not run yet" or "it ran and nothing cleared the bar" — the second is a real
// answer and the first is not, and a bare "no picks today" says neither. The
// route distinguishes them; so does this.
//
// And it must not show a record that does not exist. A fresh install has graded
// nothing, and a hit rate of null drawn as "0%" is a claim about how these
// calls have performed, made out of having no information at all.

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/** A date as "29 Oct", or the raw string if it is not one. */
function dayLabel(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const WAY = { BUY: "up", SELL: "down" } as const;

/**
 * What a graded pick was worth to the person who took it.
 *
 * returnPct is the move in the underlying, so a short that worked is negative.
 * Printing it unchanged next to "the call was right" would contradict itself on
 * screen, so the number shown is the move in the direction called.
 */
function inFavour(p: Pick): number | null {
  if (!p.outcome) return null;
  return p.direction === "BUY" ? p.outcome.returnPct : -p.outcome.returnPct;
}

function Outcome({ p }: { p: Pick }) {
  const gain = inFavour(p);
  if (p.outcome === null || gain === null) return null;

  const tone = p.outcome.correct ? "var(--mx-up)" : "var(--mx-down)";
  return (
    <p className="mt-3 text-[14px]" style={{ color: tone }}>
      <span className="tabular-nums">{signed(gain)}</span>{" "}
      <span className="text-[var(--mx-text-2)]">
        in the direction called — {money(p.entryPrice)} → {money(p.outcome.price)} by {dayLabel(p.outcome.date)}.{" "}
        {p.outcome.correct ? "The call was right." : "The call was wrong."}
      </span>
    </p>
  );
}

/** How far through its horizon an ungraded pick is, counted in sessions. */
function Progress({ p }: { p: Pick }) {
  const elapsed = useMemo(() => tradingDaysElapsed(p.asOf, etTradingDate()), [p.asOf]);

  // Null rather than 0 when the date cannot be read: saying "0 of 14" about a
  // pick taken weeks ago would be worse than saying nothing.
  if (elapsed === null) {
    return (
      <p className="mt-3 text-[13px] text-[var(--mx-text-3)]">
        Still running. Graded after {p.horizonDays} trading days.
      </p>
    );
  }

  const left = Math.max(0, p.horizonDays - elapsed);

  // "Trading day 0 of 14" is true and reads like a stall. A pick taken today
  // has not had a session yet, which is worth saying in those words.
  const label =
    left === 0
      ? `${p.horizonDays} trading days are up — this is graded on the next scheduled run.`
      : elapsed === 0
        ? `Taken today, so no session has passed yet. Graded after ${p.horizonDays} trading days.`
        : `Trading day ${Math.min(elapsed, p.horizonDays)} of ${p.horizonDays} — ${left} to go before it is graded.`;

  return <p className="mt-3 text-[13px] text-[var(--mx-text-3)]">{label}</p>;
}

function PickCard({ p }: { p: Pick }) {
  return (
    <li className={`${card} p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        {/* The space is deliberate: without it the rank and the ticker run
            together as "1CNXC" when the card is copied or read aloud. */}
        <p className="text-[18px]">
          <span className="text-[var(--mx-text-3)] tabular-nums mr-1.5">{p.rank}</span>{" "}
          {p.symbol}
        </p>
        <p className="tabular-nums text-[var(--mx-text-2)] text-[15px]">{money(p.entryPrice)}</p>
      </div>

      <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">
        Called <strong className="font-normal text-[var(--mx-text)]">{WAY[p.direction]}</strong> on{" "}
        {dayLabel(p.asOf)}, held {p.horizonDays} trading days.
      </p>

      {p.why.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {p.why.map(w => (
            <li key={w} className="text-[13.5px] leading-relaxed text-[var(--mx-text-2)] flex gap-2">
              <span aria-hidden="true" className="text-[var(--mx-text-3)]">·</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {p.outcome ? <Outcome p={p} /> : <Progress p={p} />}
    </li>
  );
}

/**
 * The realised record.
 *
 * Shown only once something has been graded. Before that the honest line is
 * that nothing has finished yet — not a hit rate of zero, which would be a
 * statement about performance rather than about having no data.
 */
function RecordStrip({ record, horizonDays }: { record: { count: number; hitRate: number | null; avgReturn: number | null } | null; horizonDays: number }) {
  if (!record || record.count === 0 || record.hitRate === null) {
    return (
      <p className="text-[13px] text-[var(--mx-text-3)] leading-relaxed">
        No pick has finished its {horizonDays} trading days yet, so there is no record to show. It appears
        here as calls are graded — including the ones that were wrong.
      </p>
    );
  }

  const avg = record.avgReturn;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <span className="text-[13px] text-[var(--mx-text-3)]">
        <span className="tabular-nums text-[15px] text-[var(--mx-text)]">{record.count}</span> graded
      </span>
      <span className="text-[13px] text-[var(--mx-text-3)]">
        <span className="tabular-nums text-[15px] text-[var(--mx-text)]">{record.hitRate}%</span> went the right way
      </span>
      {avg !== null && (
        <span className="text-[13px] text-[var(--mx-text-3)]">
          <span
            className="tabular-nums text-[15px]"
            style={{ color: avg > 0 ? "var(--mx-up)" : avg < 0 ? "var(--mx-down)" : "var(--mx-text)" }}
          >
            {signed(avg)}
          </span>{" "}
          average, in the direction called
        </span>
      )}
    </div>
  );
}

function HistoryRows({ history }: { history: HistoryPick[] }) {
  const today = etTradingDate();

  return (
    <ul className="border-t border-[var(--mx-line)] divide-y divide-[var(--mx-line)]">
      {history.map(h => {
        const gain = inFavour(h);
        const elapsed = h.outcome ? null : tradingDaysElapsed(h.asOf, today);

        return (
          <li key={`${h.runDate}-${h.symbol}`} className="flex items-baseline justify-between gap-3 px-5 py-3">
            <span className="min-w-0">
              <span className="text-[14px]">{h.symbol}</span>
              <span className="ml-2 text-[13px] text-[var(--mx-text-3)]">
                {WAY[h.direction]} · {dayLabel(h.runDate)}
              </span>
            </span>

            {h.outcome && gain !== null ? (
              <span
                className="tabular-nums text-[14px] shrink-0"
                style={{ color: h.outcome.correct ? "var(--mx-up)" : "var(--mx-down)" }}
              >
                {signed(gain)}
              </span>
            ) : (
              <span className="text-[13px] text-[var(--mx-text-3)] shrink-0">
                {/* "0 trading days to go" describes a pick that is waiting on
                    the grader, not one with no time left. Say which. */}
                {elapsed === null
                  ? "still running"
                  : h.horizonDays - elapsed <= 0
                    ? "due to be graded"
                    : `${h.horizonDays - elapsed} trading days to go`}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function DailyPicks() {
  const { state, reload } = useDailyPicks();

  if (state.kind === "loading") {
    return (
      <section className={`${card} p-5 sm:p-6`} aria-busy="true">
        <div className="space-y-3 animate-pulse">
          <div className="h-6 w-56 rounded bg-[var(--mx-raised)]" />
          <div className="h-4 w-3/4 rounded bg-[var(--mx-raised)]" />
        </div>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-[20px]">We couldn’t load today’s picks.</h2>
        <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">{state.message}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-4 h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]"
        >
          Try again
        </button>
      </section>
    );
  }

  const { data } = state;
  const horizon = data.picks[0]?.horizonDays ?? 14;
  const history = data.history ?? [];
  // Only claim completeness when the route's count agrees it is complete.
  const truncated = typeof data.historyTotal === "number" && data.historyTotal > history.length;

  // Not configured at all — local development without secrets. Distinct from
  // having no picks, and saying "no picks today" here would be inventing an
  // answer out of a missing connection.
  if (!data.available) {
    return (
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-[20px]">Daily picks aren’t switched on here.</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--mx-text-2)] max-w-[60ch]">
          {data.hint ?? "This install has no database connection, so there is nothing stored to show."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="picks-h" className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 id="picks-h" className="text-[20px]">Today’s picks</h2>
          <p className="mt-1 text-[13px] text-[var(--mx-text-3)] max-w-[62ch] leading-relaxed">
            At most three, chosen before the open and fixed for the day. Everyone sees the same ones, and
            they don’t change while you’re looking at them.
          </p>
        </div>
        {data.asOfDate && (
          <p className="text-[13px] text-[var(--mx-text-3)] tabular-nums">
            {data.stale ? `Showing ${dayLabel(data.asOfDate)} — the latest day with picks` : dayLabel(data.asOfDate)}
          </p>
        )}
      </div>

      {state.message && <p className="text-[13px] text-[var(--mx-text-3)]">{state.message}</p>}

      {data.picks.length > 0 ? (
        <ul className="space-y-3">
          {data.picks.map(p => <PickCard key={p.symbol} p={p} />)}
        </ul>
      ) : (
        <div className={`${card} p-5 sm:p-6`} aria-live="polite">
          {/* Which empty this is. The route tells us; passing that on is the
              difference between "wait" and "something is wrong". */}
          <p className="text-[18px]">
            {data.emptyReason === "no_run_yet"
              ? "Today’s picks haven’t been worked out yet."
              : /* No "today" here: this card can be showing an earlier day. */
                "Nothing cleared the bar."}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--mx-text-2)] max-w-[62ch]">
            {data.emptyReason === "no_run_yet"
              ? (data.hint ?? "The scheduled run happens before the market opens. Check back then.")
              : "Every candidate was either too thinly backtested to trust or no better than doing nothing. A day with no pick is a real answer, and padding the list would defeat the point of having one."}
          </p>
        </div>
      )}

      <div className={`${card} p-5`}>
        <p className="text-[15px]">How these calls have done</p>
        <p className="mt-0.5 mb-3 text-[12.5px] text-[var(--mx-text-3)]">
          Graded on the underlying after {horizon} trading days — not on an option’s premium, which would
          need data no free source gives.
        </p>
        <RecordStrip record={data.record} horizonDays={horizon} />
      </div>

      {history.length > 0 && (
        <details className={`${card} group`}>
          <summary className="cursor-pointer list-none flex items-center justify-between p-5 text-[15px]">
            <span>Past picks, and what they were worth</span>
            <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
          </summary>
          <HistoryRows history={history} />
          {/* This list is a WINDOW, not the archive — the route caps it. Saying
              "every pick ever shown" was true the day it was written and would
              quietly stop being true a few weeks later, which is precisely the
              kind of claim this screen exists to avoid making. */}
          <p className="px-5 py-4 text-[12.5px] leading-relaxed text-[var(--mx-text-3)]">
            {truncated
              ? `The ${history.length} most recent of ${data.historyTotal} picks, graded or still running. `
              : "Every pick so far, graded or still running. "}
            The losers are here too — a record that only kept its winners would not be a record.
          </p>
        </details>
      )}

      <p className="text-[12.5px] leading-relaxed text-[var(--mx-text-3)]">
        For learning only — not financial advice. These are directional calls on the stock, scored against
        how similar setups have actually turned out, and some of them will be wrong.
      </p>
    </section>
  );
}
