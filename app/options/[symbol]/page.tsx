"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import PaywallGuard from "../../components/PaywallGuard";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import ResearchView from "../../components/fieldnotes/ResearchView";
import { StateBadge, PaperNotice } from "../../components/fieldnotes/primitives";
import type { ResearchResponse } from "../../api/market/options-engine/route";

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
        <Link href="/options" className="underline">Candidates</Link> <span aria-hidden="true">/</span> <span className="fn-num">{symbol}</span>
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
            <p className="fn-h3">{load.kind === "unavailable" ? "Data unavailable" : "Something went wrong"}</p>
            <p className="fn-text-2">{load.message}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="fn-btn" onClick={() => location.reload()}>Try again</button>
              <Link href="/options#your-data" className="fn-btn">Analyze your own data</Link>
              <Link href="/options" className="fn-btn fn-btn-quiet">Back to candidates</Link>
            </div>
          </section>
          <PaperNotice />
        </>
      )}

      {load.kind === "ready" && (
        <>
          <ResearchView
            detail={load.data.detail}
            actions={{
              onRefresh: refresh,
              refreshing,
              refreshMessage: message,
              onSupply: () => { window.location.href = "/options#your-data"; },
            }}
          />
          <PaperNotice />
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
          <div className="max-w-[1320px] mx-auto w-full">
            <Research key={sym} symbol={sym} />
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
