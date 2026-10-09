"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PaywallGuard from "../components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { FnIcon, Notice, PaperNotice, StateBadge } from "../components/fieldnotes/primitives";
import UserDataSection from "../components/fieldnotes/UserDataSection";
import ProductTour, { type TourStep } from "../components/ProductTour";
import { useOptionsList } from "../components/fieldnotes/useOptionsList";
import { STATE_HELP, STATE_LABEL, shortReason, stateOf, type UiState } from "../components/fieldnotes/uiState";
import { fmtEt, fmtLevel, fmtSignedPct } from "../components/fieldnotes/format";
import type { DisplayAnalysis } from "../lib/optionsAnalysis/display";

const GROUP_ORDER: UiState[] = ["validated", "expired", "no_trade", "unavailable", "error"];

const OPTIONS_TOUR_KEY = "traxora_options_tour_v1";
const OPTIONS_TOUR: TourStep[] = [
  { selector: '[data-tour="opt-session"]', title: "Freshness first", desc: "Market session, analysis time and how current the data is. Free public data is delayed, and this line says so." },
  { selector: '[data-tour="opt-search"]', title: "Research any symbol", desc: "Open a full research page: thesis, chart with levels, every option leg, estimated max loss and the exit plan." },
  { selector: '[data-tour="opt-filters"]', title: "Grouped by outcome", desc: "Validated estimates, expired results, no-trades and unavailable data are kept apart. A completed no-trade is a real result, not an error." },
  { selector: '[data-tour="opt-table"]', title: "Every symbol, one row", desc: "Price, change, source time, state and the reason in plain words. Select a row to see the full evidence." },
  { selector: '#your-data', title: "Bring your own data", desc: "Have quotes with their times? Paste them here and the same checks run on them. Your data isn’t stored or shared." },
];

function Row({ a, onOpen }: { a: DisplayAnalysis; onOpen: (s: string) => void }) {
  const state = stateOf(a);
  return (
    <tr data-link="" onClick={() => onOpen(a.symbol)}>
      <th scope="row" style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--fn-rule)" }}>
        <Link href={`/options/${encodeURIComponent(a.symbol)}`} className="fn-num" style={{ fontWeight: 700, color: "var(--fn-text)" }} onClick={e => e.stopPropagation()}>
          {a.symbol}
        </Link>
      </th>
      <td className="fn-r">{fmtLevel(a.price)}</td>
      <td className={`fn-r ${a.change_pct === null ? "" : a.change_pct >= 0 ? "fn-pos" : "fn-neg"}`}>{fmtSignedPct(a.change_pct)}</td>
      <td className="fn-numcell">{fmtEt(a.price_timestamp)}<div className="fn-meta">{a.price_timestamp_kind === "QUOTE" ? "quote" : "last trade"}, delayed</div></td>
      <td><StateBadge state={state} /></td>
      <td className="fn-text-2" style={{ minWidth: 180 }}>{shortReason(a)}</td>
    </tr>
  );
}

function Overview() {
  const router = useRouter();
  const { state, refresh } = useOptionsList();
  const [filter, setFilter] = useState<UiState | "all">("all");
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [supplySignal, setSupplySignal] = useState(0);
  const [tour, setTour] = useState(false);

  // First visit: show the tour once, after the list has loaded.
  useEffect(() => {
    if (state.kind !== "ready") return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(OPTIONS_TOUR_KEY)) setTour(true);
    } catch { /* storage blocked */ }
  }, [state.kind]);
  function endTour() {
    setTour(false);
    try { localStorage.setItem(OPTIONS_TOUR_KEY, "1"); } catch { /* storage blocked */ }
  }

  useEffect(() => {
    // Arriving from a research page's "Analyze your own data" action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#your-data") setSupplySignal(n => n + 1);
  }, []);

  const data = state.kind === "ready" ? state.data : null;
  const groups = useMemo(() => {
    const m = new Map<UiState, DisplayAnalysis[]>();
    for (const a of data?.analyses ?? []) {
      const s = stateOf(a);
      m.set(s, [...(m.get(s) ?? []), a]);
    }
    return m;
  }, [data]);

  const open = (s: string) => router.push(`/options/${encodeURIComponent(s)}`);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = query.trim().toUpperCase();
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(s)) { setQueryError("Enter a US ticker of 1–5 letters, e.g. AAPL."); return; }
    setQueryError(null);
    open(s);
  }

  const total = data?.analyses.length ?? 0;
  const shown = GROUP_ORDER.filter(g => (groups.get(g)?.length ?? 0) > 0 && (filter === "all" || filter === g));

  return (
    <div className="fn fn-page space-y-5">
      <ProductTour steps={OPTIONS_TOUR} active={tour} onFinish={endTour} />
      <header className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="fn-caps">Options</p>
            <h1 className="fn-title">Candidates</h1>
          </div>
          <div className="flex items-center gap-2">
          <button type="button" className="fn-btn fn-btn-quiet" onClick={() => setTour(true)}>Tour</button>
          <button type="button" className="fn-btn" onClick={refresh} disabled={state.kind !== "ready" || state.refreshing}>
            <FnIcon.Refresh /> {state.kind === "ready" && state.refreshing ? "Refreshing…" : "Refresh analysis"}
          </button>
          </div>
        </div>
        {data ? (
          <p data-tour="opt-session" className="fn-text-2" style={{ fontSize: "var(--fn-fs-sm)" }}>
            <span className="fn-src" data-src={data.session.status === "OPEN" ? "fresh" : "historical"} aria-hidden="true" style={{ display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
            NYSE {data.session.status === "OPEN" ? "open" : data.session.status === "CLOSED" ? "closed" : "status unknown"} ({data.session.detail})
            {" · "}analysis as of {fmtEt(data.as_of)}
            {" · "}underlying prices delayed; option quotes from a public snapshot without per-quote times
          </p>
        ) : <div className="fn-skel" style={{ width: "70%", height: 16 }} />}
        {state.kind === "ready" && state.message && <p className="fn-meta" role="status">{state.message}</p>}
      </header>

      <PaperNotice />

      <form data-tour="opt-search" onSubmit={submit} className="fn-surface flex flex-wrap items-end gap-3" role="search" aria-label="Research a symbol">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <label htmlFor="fn-sym" className="fn-label">Research a symbol</label>
          <input
            id="fn-sym" className="fn-input fn-num" style={{ marginTop: 6, textTransform: "uppercase" }}
            value={query} onChange={e => setQuery(e.target.value)} placeholder="AAPL" autoComplete="off" spellCheck={false}
            aria-invalid={!!queryError} aria-describedby={queryError ? "fn-sym-err" : undefined}
          />
          {queryError && <p id="fn-sym-err" className="fn-meta fn-neg" style={{ marginTop: 4 }}>{queryError}</p>}
        </div>
        <button type="submit" className="fn-btn fn-btn-primary"><FnIcon.Search /> Open research</button>
      </form>

      {state.kind === "loading" && (
        <section className="fn-surface space-y-3" aria-busy="true" aria-label="Loading analysis">
          <StateBadge state="analyzing" />
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="fn-skel" style={{ height: 36 }} />)}
        </section>
      )}

      {state.kind === "error" && (
        <section className="fn-surface space-y-3">
          <StateBadge state="error" />
          <p className="fn-h3">The analysis couldn&apos;t be loaded</p>
          <p className="fn-text-2">{state.message}</p>
          <button type="button" className="fn-btn" onClick={() => location.reload()}>Try again</button>
        </section>
      )}

      {data && (
        <>
          <div className="space-y-2">
            <div data-tour="opt-filters" className="flex flex-wrap gap-2" role="group" aria-label="Filter by analysis state">
              <button type="button" className="fn-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span className="fn-num">{total}</span></button>
              {GROUP_ORDER.filter(g => groups.has(g)).map(g => (
                <button key={g} type="button" className="fn-chip" aria-pressed={filter === g} onClick={() => setFilter(g)} title={STATE_HELP[g]}>
                  {STATE_LABEL[g]} <span className="fn-num">{groups.get(g)!.length}</span>
                </button>
              ))}
            </div>
            <p className="fn-meta">Counts describe analysis outcomes. More candidates doesn&apos;t mean better analysis — a completed no-trade is a result.</p>
          </div>

          {!groups.has("validated") && (
            <Notice tone="info" title="No validated estimates right now">
              Every symbol below finished its analysis. Open one to see what&apos;s missing and the next step.
            </Notice>
          )}

          {shown.map((g, gi) => (
            <section key={g} data-tour={gi === 0 ? "opt-table" : undefined} className="fn-surface" style={{ padding: 0 }} aria-labelledby={`grp-${g}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: "14px 16px 6px" }}>
                <h2 id={`grp-${g}`} className="fn-h2">{STATE_LABEL[g]} <span className="fn-meta fn-num">· {groups.get(g)!.length}</span></h2>
                <p className="fn-meta">{STATE_HELP[g]}</p>
              </div>
              <div className="fn-scroll-x" tabIndex={0} role="region" aria-label={`${STATE_LABEL[g]} table`}>
                <table className="fn-ledger">
                  <thead>
                    <tr>
                      <th scope="col">Symbol</th><th scope="col" className="fn-r">Price</th><th scope="col" className="fn-r">Change</th>
                      <th scope="col">Source time</th><th scope="col">State</th><th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>{groups.get(g)!.map(a => <Row key={a.symbol} a={a} onOpen={open} />)}</tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      <UserDataSection openSignal={supplySignal} />

      <nav aria-label="Related" className="flex flex-wrap gap-x-5 gap-y-2 fn-meta">
        <Link href="/journal#analysis-notebook" className="underline">Saved analyses in your journal</Link>
        <Link href="/paper" className="underline">Paper portfolio</Link>
        <Link href="/intelligence?section=options" className="underline">Options &amp; futures screener</Link>
      </nav>
    </div>
  );
}

export default function OptionsPage() {
  return (
    <PaywallGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36">
          <Topbar />
          <div className="max-w-6xl mx-auto w-full">
            <Overview />
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
