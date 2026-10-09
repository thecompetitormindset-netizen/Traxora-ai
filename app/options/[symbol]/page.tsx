"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import PaywallGuard from "../../components/PaywallGuard";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import ResearchView from "../../components/fieldnotes/ResearchView";
import { StateBadge, PaperNotice } from "../../components/fieldnotes/primitives";
import { plainReason, stateOf } from "../../components/fieldnotes/uiState";
import type { ResearchResponse } from "../../api/market/options-engine/route";
import type { ResearchDetail } from "../../lib/optionsAnalysis/display";

const STRATEGY_WORDS: Record<string, string> = {
  LONG_CALL: "Buy a call — makes money if the price goes up",
  LONG_PUT: "Buy a put — makes money if the price goes down",
  BULL_CALL_SPREAD: "Call spread — makes money if the price goes up, and the cost is capped",
  BEAR_PUT_SPREAD: "Put spread — makes money if the price goes down, and the cost is capped",
  BULL_PUT_SPREAD: "Sell a put spread — earns money if the price stays up",
  BEAR_CALL_SPREAD: "Sell a call spread — earns money if the price stays down",
  IRON_CONDOR: "Iron condor — earns money if the price stays in a range",
};
const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The plain answer shown first; the full analysis sits below it, folded. */
function SimpleAnswer({ d }: { d: ResearchDetail }) {
  const a = d.display;
  const open = d.session?.status === "OPEN";
  const ok = stateOf(a) === "validated";
  const reason = plainReason(a, open);
  const out = a.output;
  const dir = out?.canonical_direction;
  const code = out?.no_trade_reason?.code;
  const next = ok ? null
    : reason === "Market is closed" ? "Check back after the market opens at 9:30 AM ET."
    : code === "G4_EVENT" ? "Look again after the company’s news is out."
    : "Check again later — prices and options change during the day.";
  const p = a.pricing;
  const strategy = out?.proposed_structure?.strategy;
  return (
    <section className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 sm:p-6 text-[var(--mx-text)]" aria-labelledby="answer-h">
      <p className="text-[13px] text-[var(--mx-text-3)]">Our answer</p>
      <h2 id="answer-h" className="mt-1 text-[24px] sm:text-[28px] leading-tight tracking-[-0.02em]" style={{ fontWeight: 450 }}>
        {ok ? `${a.symbol} passed every check.` : `No option idea for ${a.symbol} right now.`}
      </h2>
      {!ok && <p className="mt-2 text-[15px] text-[var(--mx-text-2)]">Why: {reason.charAt(0).toLowerCase() + reason.slice(1)}. {next}</p>}
      {dir && (
        <p className="mt-2 text-[14px] text-[var(--mx-text-3)]">
          Price trend: {dir === "BULLISH" ? "leaning up" : dir === "BEARISH" ? "leaning down" : "no clear direction"}.
        </p>
      )}
      {ok && (
        <dl className="mt-5 grid sm:grid-cols-3 gap-3">
          {strategy && (
            <div className="sm:col-span-3 rounded-[10px] border border-[var(--mx-line)] p-3.5">
              <dt className="text-[13px] text-[var(--mx-text-3)]">The idea</dt>
              <dd className="mt-1 text-[15px]">{STRATEGY_WORDS[strategy] ?? strategy}</dd>
            </div>
          )}
          {p && (
            <>
              <div className="rounded-[10px] border border-[var(--mx-line)] p-3.5">
                <dt className="text-[13px] text-[var(--mx-text-3)]">Most you could lose</dt>
                <dd className="mt-1 text-[17px] tabular-nums text-[var(--mx-down)]">{usd(p.max_loss)}</dd>
                <dd className="text-[12px] text-[var(--mx-text-3)]">per contract</dd>
              </div>
              <div className="rounded-[10px] border border-[var(--mx-line)] p-3.5">
                <dt className="text-[13px] text-[var(--mx-text-3)]">Most you could make</dt>
                <dd className="mt-1 text-[17px] tabular-nums text-[var(--mx-up)]">{p.max_gain == null ? "No fixed limit" : usd(p.max_gain)}</dd>
                <dd className="text-[12px] text-[var(--mx-text-3)]">per contract</dd>
              </div>
              <div className="rounded-[10px] border border-[var(--mx-line)] p-3.5">
                <dt className="text-[13px] text-[var(--mx-text-3)]">You start making money at</dt>
                <dd className="mt-1 text-[17px] tabular-nums">{p.breakevens.length ? p.breakevens.map(usd).join(" / ") : "—"}</dd>
                <dd className="text-[12px] text-[var(--mx-text-3)]">stock price at expiry</dd>
              </div>
            </>
          )}
        </dl>
      )}
      <p className="mt-4 text-[12.5px] text-[var(--mx-text-3)]">Practice only — options can lose all the money put into them.</p>
    </section>
  );
}

type Load =
  | { kind: "analyzing" }
  | { kind: "ready"; data: ResearchResponse }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

function Research({ symbol }: { symbol: string }) {
  const [load, setLoad] = useState<Load>({ kind: "analyzing" });
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async (method: "GET" | "POST") => {
    const url = `/api/market/options-engine?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, method === "GET" ? { cache: "no-store" } : { method: "POST" });
    const body = await res.json().catch(() => ({})) as ResearchResponse & { error?: string; detail?: unknown; retryAfterSeconds?: number };
    return { res, body };
  }, [symbol]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { res, body } = await fetchDetail("GET");
        if (!live) return;
        if (res.ok) setLoad({ kind: "ready", data: body });
        else if (res.status === 404) setLoad({ kind: "unavailable", message: "Required market data couldn't be retrieved for this symbol. It may not have listed options, or the sources may be unavailable." });
        else if (res.status === 400) setLoad({ kind: "unavailable", message: "That doesn't look like a US ticker. Use 1–5 letters, e.g. AAPL." });
        else setLoad({ kind: "error", message: res.status === 401 ? "Your session has ended. Sign in again." : `The analysis service returned an error (${res.status}).` });
      } catch {
        if (live) setLoad({ kind: "error", message: "Network error. Check your connection and try again." });
      }
    })();
    return () => { live = false; };
  }, [fetchDetail]);

  async function refresh() {
    setRefreshing(true); setMessage(null);
    try {
      const { res, body } = await fetchDetail("POST");
      if (res.ok) { setLoad({ kind: "ready", data: body }); setMessage("Refreshed with the latest available data."); }
      else if (res.status === 429) setMessage(`Refreshed moments ago. Try again in ${body.retryAfterSeconds ?? 60}s.`);
      else setMessage(`Refresh failed (${res.status}). The previous result is still shown.`);
    } catch {
      setMessage("Refresh failed: network error. The previous result is still shown.");
    } finally { setRefreshing(false); }
  }

  return (
    <div className="fn fn-page space-y-4">
      <nav aria-label="Breadcrumb" className="fn-meta">
        <Link href="/options" className="underline">← Options</Link>
      </nav>

      {load.kind === "analyzing" && (
        <div className="fn-research" aria-busy="true" aria-label={`Analyzing ${symbol}`}>
          <div className="fn-a-head space-y-3">
            <p className="fn-caps">Research</p>
            <h1 className="fn-title">{symbol}</h1>
            <div className="fn-skel" style={{ height: 76 }} />
          </div>
          <aside className="fn-a-decision fn-surface space-y-3">
            <StateBadge state="analyzing" />
            <p className="fn-text-2">Reading prices, the option chain and the event calendar, then running the checks.</p>
            <div className="fn-skel" style={{ height: 120 }} />
          </aside>
          <div className="fn-a-thesis fn-skel" style={{ height: 140 }} />
          <div className="fn-a-chart fn-skel" style={{ height: 320 }} />
        </div>
      )}

      {(load.kind === "unavailable" || load.kind === "error") && (
        <>
          <h1 className="fn-title">{symbol}</h1>
          <section className="fn-surface space-y-3" style={{ maxWidth: 640 }}>
            <StateBadge state={load.kind === "unavailable" ? "unavailable" : "error"} />
            <p className="fn-h3">{load.kind === "unavailable" ? "We couldn’t check this stock" : "Something went wrong"}</p>
            <p className="fn-text-2">{load.message}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="fn-btn" onClick={() => location.reload()}>Try again</button>
              <Link href="/options" className="fn-btn fn-btn-quiet">Back to options</Link>
            </div>
          </section>
          <PaperNotice />
        </>
      )}

      {load.kind === "ready" && (
        <>
          <h1 className="fn-title">{symbol}{load.data.detail.display.price != null && <span className="fn-num" style={{ marginLeft: 12, fontSize: "0.6em", color: "var(--fn-text-2)" }}>${load.data.detail.display.price.toFixed(2)}</span>}</h1>
          <SimpleAnswer d={load.data.detail} />
          <details className="fn-surface" style={{ padding: 0 }}>
            <summary className="cursor-pointer list-none flex items-center justify-between" style={{ padding: "16px 20px", fontSize: 15 }}>
              <span>See the full analysis <span className="fn-meta">— chart, checks and data details</span></span>
              <span aria-hidden="true" className="fn-meta" style={{ fontSize: 18 }}>+</span>
            </summary>
            <div style={{ padding: "0 16px 16px" }}>
              <ResearchView
                detail={load.data.detail}
                actions={{
                  onRefresh: refresh,
                  refreshing,
                  refreshMessage: message,
                  onSupply: () => { window.location.href = "/options#your-data"; },
                }}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export default function ResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const sym = decodeURIComponent(symbol).toUpperCase();
  return (
    <PaywallGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36">
          <Topbar />
          <div className="max-w-5xl mx-auto w-full">
            <Research key={sym} symbol={sym} />
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
