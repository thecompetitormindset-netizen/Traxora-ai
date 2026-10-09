"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import type { IPOItem } from "../api/ipo/route";
import type { IPOAnalysis } from "../api/ipo/analyze/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function daysUntil(d: string) {
  const diff = Math.round((new Date(d + "T12:00:00Z").getTime() - Date.now()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0)  return `${Math.abs(diff)}d ago`;
  return `In ${diff}d`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ h = "h-4", w = "w-full" }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} rounded-lg bg-[#252345] animate-pulse`} />;
}


function VerdictBadge({ verdict }: { verdict: IPOAnalysis["verdict"] }) {
  const map = {
    "Strong Buy": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    "Buy":        "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    "Watch":      "bg-amber-500/15  text-amber-400   border-amber-500/25",
    "Avoid":      "bg-rose-500/20   text-rose-400    border-rose-500/35",
  };
  return (
    <span className={`text-xs font-black px-3 py-1 rounded-xl border ${map[verdict]}`}>
      {verdict}
    </span>
  );
}



// ── AI Analysis Panel ─────────────────────────────────────────────────────────

function AIPanel({ ipo }: { ipo: IPOItem }) {
  const [analysis,  setAnalysis]  = useState<IPOAnalysis | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);

  async function fetchAnalysis() {
    setTriggered(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ipo/analyze", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       ipo.name,
          symbol:     ipo.symbol,
          exchange:   ipo.exchange,
          price:      ipo.price,
          totalValue: ipo.totalValue,
          shares:     ipo.shares,
          status:     ipo.status,
          isSpac:     ipo.isSpac,
        }),
      });
      const d = await res.json() as IPOAnalysis & { error?: string };
      if (d.error) { setError(d.error); return; }
      setAnalysis(d);
    } catch { setError("Analysis failed — try again"); }
    finally { setLoading(false); }
  }

  if (!triggered) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); fetchAnalysis(); }}
        className="w-full mt-4 py-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 text-violet-400 text-xs font-bold transition-colors"
      >
        AI Deep Dive — Price Targets & 5-Year Outlook
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-4 space-y-2 border-t border-[#252345] pt-4">
        <Skeleton h="h-4" w="w-1/3" />
        <Skeleton h="h-3" />
        <Skeleton h="h-3" w="w-5/6" />
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[1,2,3].map(i => <Skeleton key={i} h="h-14" />)}
        </div>
        <Skeleton h="h-3" />
        <Skeleton h="h-3" w="w-4/5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-[#252345]">
        <p className="text-xs text-rose-400">{error}</p>
        <button type="button" onClick={(e) => { e.stopPropagation(); fetchAnalysis(); }} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">Retry</button>
      </div>
    );
  }

  if (!analysis) return null;

  const ipoPrice = ipo.ipoPrice ?? (ipo.price ? parseFloat(ipo.price.replace(/[^0-9.]/g, "")) : null);

  return (
    <div className="mt-4 pt-4 border-t border-[#252345] space-y-4" onClick={e => e.stopPropagation()}>

      {/* Sector + Verdict */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[10px] text-[#4B5675] uppercase tracking-widest">Sector · </span>
          <span className="text-[10px] font-bold text-violet-400">{analysis.sector}</span>
          {analysis.similarTo && (
            <span className="text-[10px] text-[#4B5675]"> · Like {analysis.similarTo}</span>
          )}
        </div>
        <VerdictBadge verdict={analysis.verdict} />
      </div>

      {/* Company brief */}
      <p className="text-xs text-[#7B8DB4] leading-relaxed">{analysis.companyBrief}</p>

      {/* Verdict reason */}
      <p className="text-xs text-[#CBD5E1] leading-relaxed border-l-2 border-violet-500/40 pl-3">{analysis.verdictReason}</p>

      {/* 12-Month Price Targets */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#4B5675] mb-2">12-Month Price Targets</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-center">
            <p className="text-[9px] text-rose-400 uppercase tracking-widest font-bold">Bear</p>
            <p className="text-lg font-black font-mono text-rose-400 mt-1">${analysis.priceTargets.bear.toFixed(2)}</p>
            {ipoPrice && (
              <p className="text-[9px] text-[#4B5675] mt-0.5">
                {(((analysis.priceTargets.bear - ipoPrice) / ipoPrice) * 100).toFixed(0)}%
              </p>
            )}
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-[9px] text-amber-400 uppercase tracking-widest font-bold">Base</p>
            <p className="text-lg font-black font-mono text-amber-400 mt-1">${analysis.priceTargets.base.toFixed(2)}</p>
            {ipoPrice && (
              <p className="text-[9px] text-[#4B5675] mt-0.5">
                +{(((analysis.priceTargets.base - ipoPrice) / ipoPrice) * 100).toFixed(0)}%
              </p>
            )}
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
            <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Bull</p>
            <p className="text-lg font-black font-mono text-emerald-400 mt-1">${analysis.priceTargets.bull.toFixed(2)}</p>
            {ipoPrice && (
              <p className="text-[9px] text-[#4B5675] mt-0.5">
                +{(((analysis.priceTargets.bull - ipoPrice) / ipoPrice) * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 5-Year Outlook */}
      <div className="bg-[#0D0B1A]/60 border border-violet-500/15 rounded-xl p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-2">5-Year Outlook</p>
        <p className="text-xs text-[#CBD5E1] leading-relaxed">{analysis.fiveYear}</p>
      </div>

      {/* Investment Thesis */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#4B5675] mb-2">Investment Thesis</p>
        <p className="text-xs text-[#7B8DB4] leading-relaxed">{analysis.thesis}</p>
      </div>

      {/* Catalysts + Risks */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2">Catalysts</p>
          <ul className="space-y-1.5">
            {analysis.catalysts.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 text-[10px] mt-0.5 shrink-0">↑</span>
                <span className="text-[11px] text-[#7B8DB4] leading-snug">{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-2">Risks</p>
          <ul className="space-y-1.5">
            {analysis.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400 text-[10px] mt-0.5 shrink-0">↓</span>
                <span className="text-[11px] text-[#7B8DB4] leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Post to Discord */}
      <button
        type="button"
        onClick={() => {
          const emoji = analysis.verdict === "Strong Buy" ? "🟢" : analysis.verdict === "Buy" ? "🟢" : analysis.verdict === "Watch" ? "🟡" : "🔴";
          const lines: string[] = [];
          lines.push(`**IPO Alert: ${ipo.name}${ipo.symbol ? ` (${ipo.symbol})` : ""}**${ipoPrice ? ` @ $${ipoPrice}` : ""}`);
          lines.push(`${emoji} **${analysis.verdict}** — ${analysis.verdictReason}`);
          lines.push(`Sector: ${analysis.sector} · Similar to ${analysis.similarTo}`);
          lines.push("");
          lines.push(`**12-Month Targets:** $${analysis.priceTargets.bear} · $${analysis.priceTargets.base} · $${analysis.priceTargets.bull}`);
          if (analysis.catalysts.length > 0) { lines.push(""); lines.push("**Catalysts:** " + analysis.catalysts.slice(0, 3).map(c => `• ${c}`).join("  ")); }
          if (analysis.risks.length > 0) { lines.push("**Risks:** " + analysis.risks.slice(0, 2).map(r => `• ${r}`).join("  ")); }
          lines.push(""); lines.push("**traxora.ai**");
          const el = document.getElementById(`ipo-discord-${ipo.name}`);
          navigator.clipboard.writeText(lines.join("\n")).then(() => {
            if (el) { el.textContent = "Copied!"; setTimeout(() => { if (el) el.textContent = "Post to Discord"; }, 2000); }
          });
        }}
        id={`ipo-discord-${ipo.name}`}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/25 text-[#7B8DB4] hover:text-white transition-all text-xs font-semibold"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
        </svg>
        Post to Discord
      </button>

      <p className="text-[9px] text-[#333368]">AI-generated analysis · Not financial advice · For educational purposes only</p>
    </div>
  );
}

// ── IPO Cards ─────────────────────────────────────────────────────────────────

const RATING_WORDS: Record<IPOItem["rating"], string> = {
  Strong: "Larger listing on a major exchange",
  Watch: "Worth watching",
  Speculative: "Higher risk",
};

function IPOCard({ ipo, showPerf }: { ipo: IPOItem; showPerf?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const priceText = ipo.price ? `$${ipo.price.replace("-", "–$")}` : null;
  return (
    <li className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-[var(--mx-text)]">{ipo.name}</p>
          <p className="mt-0.5 text-[12px] text-[var(--mx-text-3)]">
            {[ipo.symbol, ipo.exchange].filter(Boolean).join(" · ") || "Ticker not set yet"}
          </p>
        </div>
        <p className="shrink-0 text-right text-[13px] text-[var(--mx-text-2)]">
          {showPerf ? fmtDate(ipo.date) : daysUntil(ipo.date)}
        </p>
      </div>

      {showPerf ? (
        <p className="mt-4 text-[14px] text-[var(--mx-text-2)]">
          Listed at {ipo.ipoPrice ? `$${ipo.ipoPrice.toFixed(2)}` : priceText ?? "an unknown price"}
          {ipo.currentPrice != null && <> → now ${ipo.currentPrice.toFixed(2)}</>}
          {ipo.perfPct != null && <span className={ipo.perfPct >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"}> ({ipo.perfPct >= 0 ? "+" : "−"}{Math.abs(ipo.perfPct).toFixed(1)}%)</span>}
        </p>
      ) : (
        <p className="mt-4 text-[14px] text-[var(--mx-text-2)]">
          {priceText ? `Expected price ${priceText} a share` : "Price not set yet"}
          {ipo.totalValue ? ` · raising ${fmtMoney(ipo.totalValue)}` : ""}
        </p>
      )}

      <p className="mt-1 text-[13px] text-[var(--mx-text-3)]">
        {ipo.isSpac ? "Shell company that plans to buy a business later — higher risk" : RATING_WORDS[ipo.rating]}
      </p>

      <button type="button" onClick={() => setExpanded(v => !v)} className="mt-3 text-[13px] text-[var(--mx-text-2)] underline hover:text-[var(--mx-text)]">
        {expanded ? "Hide details" : "More details"}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--mx-line)] space-y-2">
          <p className="text-[13px] text-[var(--mx-text-2)]">{ipo.ratingReason}{ipo.shares ? ` · ${(ipo.shares / 1e6).toFixed(1)} million shares` : ""}</p>
          <AIPanel ipo={ipo} />
        </div>
      )}
    </li>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IPOPage() {
  const [tab,     setTab]     = useState<"upcoming" | "recent">("upcoming");
  const [data,    setData]    = useState<{ upcoming: IPOItem[]; recent: IPOItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ipo")
      .then(r => r.json())
      .then(d => {
        if ((d as { error?: string }).error) { setError("We couldn’t load the list right now. Please try again shortly."); return; }
        setData(d as { upcoming: IPOItem[]; recent: IPOItem[] });
      })
      .catch(() => setError("We couldn’t load the list right now. Please try again shortly."))
      .finally(() => setLoading(false));
  }, []);

  const items = tab === "upcoming" ? (data?.upcoming ?? []) : (data?.recent ?? []);
  const pill = (on: boolean) => `h-9 px-4 rounded-full border text-[14px] transition-colors ${on ? "border-[var(--mx-text)] bg-[var(--mx-text)] text-[var(--mx-canvas)]" : "border-[var(--mx-line)] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]"}`;

  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-5xl mx-auto w-full space-y-6">
            <header>
              <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">New listings (IPOs)</h1>
              <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">An IPO is when a company starts selling its shares to the public for the first time. New listings can move a lot in their first weeks.</p>
            </header>

            <div className="flex gap-2" role="group" aria-label="Show">
              <button type="button" onClick={() => setTab("upcoming")} className={pill(tab === "upcoming")} aria-pressed={tab === "upcoming"}>Coming soon{data ? ` (${data.upcoming.length})` : ""}</button>
              <button type="button" onClick={() => setTab("recent")} className={pill(tab === "recent")} aria-pressed={tab === "recent"}>Recently listed{data ? ` (${data.recent.length})` : ""}</button>
            </div>

            {error && <p className="text-[15px] text-[var(--mx-text-2)]">{error}</p>}

            {loading && <ul className="grid sm:grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <li key={i} className="h-36 rounded-[14px] bg-[var(--mx-raised)] animate-pulse" />)}</ul>}

            {!loading && !error && items.length === 0 && (
              <p className="py-10 text-center text-[15px] text-[var(--mx-text-2)]">
                {tab === "upcoming" ? "No new listings are scheduled in the next two months." : "No companies listed in the last three months."}
              </p>
            )}

            {!loading && items.length > 0 && (
              <ul className="grid sm:grid-cols-2 gap-3">{items.map((ipo, i) => <IPOCard key={i} ipo={ipo} showPerf={tab === "recent"} />)}</ul>
            )}

            <p className="text-[12.5px] text-[var(--mx-text-3)]">Source: Finnhub and Nasdaq. For learning — not financial advice.</p>
          </div>
        </main>
      </div>
    </div>
    </PaywallGuard>
  );
}
