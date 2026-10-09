"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PaywallGuard from "../components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import UserDataSection from "../components/fieldnotes/UserDataSection";
import { useOptionsList } from "../components/fieldnotes/useOptionsList";
import { stateOf } from "../components/fieldnotes/uiState";
import type { DisplayAnalysis } from "../lib/optionsAnalysis/display";

// Options, in plain words. One sentence says whether there's anything worth
// looking at; ideas (if any) come next; the full list of checked stocks is
// folded away. Analysis rules are unchanged (app/lib/optionsAnalysis).

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";
const fmt = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function IdeaCard({ a, onOpen }: { a: DisplayAnalysis; onOpen: (s: string) => void }) {
  const dir = a.output?.canonical_direction;
  return (
    <li>
      <button type="button" onClick={() => onOpen(a.symbol)} className={`${card} w-full text-left p-5 hover:border-[var(--mx-line-strong)] transition-colors`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[18px]">{a.symbol}</p>
          <p className="tabular-nums text-[var(--mx-text-2)]">{fmt(a.price)}</p>
        </div>
        <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">
          {dir === "BULLISH" ? "An idea if you think it will go up." : dir === "BEARISH" ? "An idea if you think it will go down." : "An idea that doesn’t depend on direction."}
        </p>
        <p className="mt-3 text-[13.5px]">See the plan, the most you could lose, and when to get out →</p>
      </button>
    </li>
  );
}

function Overview() {
  const router = useRouter();
  const { state, refresh, reload } = useOptionsList();
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [supplySignal, setSupplySignal] = useState(0);

  useEffect(() => {
    // Arriving from a research page's "Analyze your own data" action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#your-data") setSupplySignal(n => n + 1);
  }, []);

  const data = state.kind === "ready" ? state.data : null;
  const rows = useMemo(() => data?.analyses ?? [], [data]);
  const ideas = rows.filter(a => stateOf(a) === "validated");
  const scan = data?.scan ?? null;
  const marketOpen = data?.session.status === "OPEN";
  const reasons = data?.reasons ?? [];
  const top = reasons[0] ? [reasons[0].reason, reasons[0].count] as const : null;
  const n = (x: number) => x.toLocaleString("en-US");

  // Keep the progress line moving while the background scan runs.
  useEffect(() => {
    if (!scan?.running) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 20_000);
    return () => window.clearInterval(id);
  }, [scan?.running, reload]);

  const openSymbol = (s: string) => router.push(`/options/${encodeURIComponent(s)}`);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = query.trim().toUpperCase();
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(s)) { setQueryError("Enter a US ticker, like AAPL."); return; }
    setQueryError(null);
    openSymbol(s);
  }

  const headline = !data ? null
    : ideas.length > 0 ? `${ideas.length} option ${ideas.length === 1 ? "idea" : "ideas"} passed every check.`
    : "No option ideas right now.";
  const why = !data || ideas.length > 0 ? null
    : !marketOpen ? "The market is closed, so prices aren’t fresh enough to check safely. We’ll look again after it opens at 9:30 AM ET."
    : `None of the stocks we’ve checked passed all our safety checks${top ? ` (most often: ${top[0].toLowerCase()})` : ""}. That’s normal — waiting is often the right call.`;
  const progress = !scan ? null
    : scan.finished ? `We checked all ${n(scan.total)} US stocks and funds that have options.`
    : !scan.running && scan.checked === 0 ? `When the market opens, we check all ${n(scan.total)} US stocks and funds that have options.`
    : `Checked ${n(scan.thin + scan.checked + scan.unavailable)} of ${n(scan.total)} US stocks and funds with options so far${scan.running ? " — still going" : ""}.`;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Options</h1>
          <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[60ch]">
            We check every US stock and fund that has options for trades that pass strict safety rules. Practice only — never real money.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={state.kind !== "ready" || state.refreshing}
          className="h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] disabled:opacity-40">
          {state.kind === "ready" && state.refreshing ? "Checking…" : "Check again"}
        </button>
      </header>

      {/* The answer */}
      <section className={`${card} p-5 sm:p-6`} aria-live="polite">
        {state.kind === "loading" && <div className="space-y-3 animate-pulse"><div className="h-7 w-64 rounded bg-[var(--mx-raised)]" /><div className="h-4 w-3/4 rounded bg-[var(--mx-raised)]" /></div>}
        {state.kind === "error" && (
          <>
            <p className="text-[20px]">We couldn’t load the options check.</p>
            <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">{state.message}</p>
            <button type="button" onClick={() => location.reload()} className="mt-4 h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px]">Try again</button>
          </>
        )}
        {data && (
          <>
            <p className="text-[24px] sm:text-[28px] leading-tight tracking-[-0.02em]" style={{ fontWeight: 450 }}>{headline}</p>
            {why && <p className="mt-2 text-[15px] leading-relaxed text-[var(--mx-text-2)] max-w-[64ch]">{why}</p>}
            {progress && (
              <div className="mt-4">
                <p className="text-[13px] text-[var(--mx-text-3)]">{progress}</p>
                {scan && !scan.finished && scan.total > 0 && (
                  <div className="mt-2 h-1 max-w-sm rounded-full bg-[var(--mx-raised-2)] overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-[var(--mx-text)] transition-[width] duration-700" style={{ width: `${Math.min(100, ((scan.thin + scan.checked + scan.unavailable) / scan.total) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
            {state.kind === "ready" && state.message && <p className="mt-2 text-[13px] text-[var(--mx-text-3)]">{state.message}</p>}
          </>
        )}
      </section>

      {ideas.length > 0 && (
        <section aria-labelledby="ideas-h" className="space-y-3">
          <h2 id="ideas-h" className="text-[18px]">Ideas to practise</h2>
          <ul className="grid sm:grid-cols-2 gap-3">{ideas.map(a => <IdeaCard key={a.symbol} a={a} onOpen={openSymbol} />)}</ul>
        </section>
      )}

      {/* Look up one stock */}
      <form onSubmit={submit} className={`${card} p-5`} role="search" aria-label="Check a stock">
        <label htmlFor="opt-sym" className="block text-[15px]">Check a stock</label>
        <p className="mt-0.5 text-[13px] text-[var(--mx-text-3)]">See what we found for any US stock, in plain words.</p>
        <div className="mt-3 flex gap-2">
          <input id="opt-sym" value={query} onChange={e => setQuery(e.target.value.toUpperCase())} placeholder="AAPL" autoComplete="off" spellCheck={false}
            aria-invalid={!!queryError} aria-describedby={queryError ? "opt-sym-err" : undefined}
            className="flex-1 min-w-0 h-11 rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-canvas)] px-3 text-[15px] tabular-nums focus:outline-none focus:border-[var(--mx-control)]" />
          <button type="submit" className="h-11 px-5 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">Check</button>
        </div>
        {queryError && <p id="opt-sym-err" className="mt-2 text-[13px] text-[var(--mx-down)]">{queryError}</p>}
      </form>

      {/* Why the rest didn't pass */}
      {reasons.length > 0 && (
        <details className={`${card} group`}>
          <summary className="cursor-pointer list-none flex items-center justify-between p-5 text-[15px]">
            <span>Why the others didn’t pass</span>
            <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
          </summary>
          <ul className="border-t border-[var(--mx-line)] divide-y divide-[var(--mx-line)]">
            {reasons.map(r => (
              <li key={r.reason} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-[14px] text-[var(--mx-text-2)]">{r.reason}</span>
                <span className="text-[14px] text-[var(--mx-text-3)] shrink-0">{n(r.count)} {r.count === 1 ? "stock" : "stocks"}</span>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-[12.5px] text-[var(--mx-text-3)]">Want the details for one company? Use “Check a stock” above.</p>
        </details>
      )}

      <p className="text-[12.5px] leading-relaxed text-[var(--mx-text-3)]">
        For learning only — not financial advice. Options can lose all the money put into them. Prices come from free public sources and can be delayed.
        {" "}<Link href="/journal#analysis-notebook" className="underline">Your saved checks</Link>
      </p>

      {/* Advanced: check your own price data (linked from research pages) */}
      <div className="fn"><UserDataSection openSignal={supplySignal} /></div>
    </div>
  );
}

export default function OptionsPage() {
  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[var(--mx-text)]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
            <div className="max-w-3xl mx-auto w-full">
              <Overview />
            </div>
          </main>
        </div>
      </div>
    </PaywallGuard>
  );
}
