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

function RatingBadge({ rating }: { rating: IPOItem["rating"] }) {
  const styles = {
    Strong:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    Watch:       "bg-amber-500/15 text-amber-400 border-amber-500/25",
    Speculative: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  };
  const icons = { Strong: "↑", Watch: "~", Speculative: "↓" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${styles[rating]}`}>
      {icons[rating]} {rating}
    </span>
  );
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

function StatusBadge({ status }: { status: IPOItem["status"] }) {
  if (status === "priced")   return <span className="text-[10px] px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">Priced</span>;
  if (status === "expected") return <span className="text-[10px] px-2 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 font-semibold">Expected</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#252345] text-[#4B5675] border border-[#333368] font-semibold">Filed</span>;
}

function PerfPill({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[#4B5675] text-xs font-mono">—</span>;
  const pos = pct >= 0;
  return (
    <span className={`text-sm font-black font-mono ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? "+" : ""}{pct.toFixed(1)}%
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

      <p className="text-[9px] text-[#333368]">AI-generated analysis · Not financial advice · For educational purposes only</p>
    </div>
  );
}

// ── IPO Cards ─────────────────────────────────────────────────────────────────

function IPOCard({ ipo, showPerf }: { ipo: IPOItem; showPerf?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const gained = ipo.perfPct != null && ipo.perfPct > 0;
  const lost   = ipo.perfPct != null && ipo.perfPct < 0;

  const borderColor =
    ipo.rating === "Strong"      ? "border-emerald-500/20 hover:border-emerald-500/40" :
    ipo.rating === "Watch"       ? "border-amber-500/20 hover:border-amber-500/40" :
    showPerf && gained           ? "border-emerald-500/20 hover:border-emerald-500/40" :
    showPerf && lost             ? "border-rose-500/20 hover:border-rose-500/40" :
                                   "border-[#252345] hover:border-rose-500/20";

  return (
    <div
      className={`bg-[#13112A] border rounded-2xl p-5 cursor-pointer transition-colors ${borderColor}`}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-[#F1F5F9] leading-snug">{ipo.name}</p>
            {ipo.isSpac && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#252345] text-[#4B5675] font-bold uppercase tracking-widest">SPAC</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {ipo.symbol && (
              <span className="text-[11px] font-mono font-bold text-emerald-400">{ipo.symbol}</span>
            )}
            {ipo.exchange && (
              <span className="text-[10px] text-[#4B5675]">{ipo.exchange}</span>
            )}
            <RatingBadge rating={ipo.rating} />
            {!showPerf && <StatusBadge status={ipo.status} />}
          </div>
        </div>
        <div className="text-right shrink-0">
          {showPerf ? (
            <>
              <PerfPill pct={ipo.perfPct} />
              {ipo.perfPct != null && <p className="text-[9px] text-[#4B5675] mt-0.5">vs IPO price</p>}
              <p className="text-[10px] text-[#4B5675] mt-1">{fmtDate(ipo.date)}</p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-[#4B5675]">{fmtDate(ipo.date)}</p>
              <p className={`text-[10px] font-semibold mt-0.5 ${
                daysUntil(ipo.date) === "Today" || daysUntil(ipo.date) === "Tomorrow"
                  ? "text-violet-400" : "text-[#4B5675]"
              }`}>{daysUntil(ipo.date)}</p>
            </>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-[#0D0B1A]/60 rounded-xl p-2.5 text-center">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">{showPerf ? "IPO Price" : "Price"}</p>
          <p className="text-xs font-mono font-bold text-[#F1F5F9] mt-0.5">
            {ipo.ipoPrice ? `$${ipo.ipoPrice.toFixed(2)}` : ipo.price ? `$${ipo.price}` : "TBD"}
          </p>
        </div>
        {showPerf ? (
          <div className="bg-[#0D0B1A]/60 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Now</p>
            <p className={`text-xs font-mono font-bold mt-0.5 ${gained ? "text-emerald-400" : lost ? "text-rose-400" : "text-[#F1F5F9]"}`}>
              {ipo.currentPrice ? `$${ipo.currentPrice.toFixed(2)}` : "—"}
            </p>
          </div>
        ) : (
          <div className="bg-[#0D0B1A]/60 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Shares</p>
            <p className="text-xs font-mono font-bold text-[#F1F5F9] mt-0.5">
              {ipo.shares ? `${(ipo.shares / 1e6).toFixed(1)}M` : "TBD"}
            </p>
          </div>
        )}
        <div className="bg-[#0D0B1A]/60 rounded-xl p-2.5 text-center">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Raise</p>
          <p className="text-xs font-mono font-bold text-[#F1F5F9] mt-0.5">{fmtMoney(ipo.totalValue)}</p>
        </div>
      </div>

      {/* Expanded: rating reason + AI panel */}
      {expanded && (
        <div className="mt-3">
          <p className="text-[11px] text-[#7B8DB4] leading-relaxed pt-3 border-t border-[#252345]">{ipo.ratingReason}</p>
          {ipo.isSpac && (
            <p className="text-[10px] text-rose-400 mt-2">
              SPACs are blank-check shells that raise money to acquire an unknown company. Higher risk, often underperform post-merger.
            </p>
          )}
          <AIPanel ipo={ipo} />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IPOPage() {
  const [tab,     setTab]     = useState<"upcoming" | "recent">("upcoming");
  const [data,    setData]    = useState<{ upcoming: IPOItem[]; recent: IPOItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    fetch("/api/ipo")
      .then(r => r.json())
      .then(d => {
        if ((d as { error?: string }).error) { setError((d as { error: string }).error); return; }
        setData(d as { upcoming: IPOItem[]; recent: IPOItem[] });
      })
      .catch(() => setError("Failed to load IPO data"))
      .finally(() => setLoading(false));
  }, []);

  const items = tab === "upcoming" ? (data?.upcoming ?? []) : (data?.recent ?? []);

  const upcomingStrong = data?.upcoming.filter(i => i.rating === "Strong").length ?? 0;
  const upcomingWatch  = data?.upcoming.filter(i => i.rating === "Watch").length  ?? 0;
  const recentGainers  = data?.recent.filter(i => (i.perfPct ?? 0) > 0).length   ?? 0;
  const recentLosers   = data?.recent.filter(i => (i.perfPct ?? 0) < 0).length   ?? 0;

  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-5xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6 mb-6">
            <h1 className="text-4xl font-black">IPO Tracker</h1>
            <p className="text-[#7B8DB4] mt-2 text-sm">
              Upcoming and recent IPOs — tap any card to expand, then run an AI deep dive for price targets, 5-year outlook, thesis, risks, and catalysts.
            </p>
          </div>

          {/* Summary strip */}
          {!loading && data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#13112A] border border-emerald-500/20 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black font-mono text-emerald-400">{upcomingStrong}</p>
                <p className="text-[10px] text-[#4B5675] mt-1 uppercase tracking-widest">Strong Upcoming</p>
              </div>
              <div className="bg-[#13112A] border border-amber-500/20 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black font-mono text-amber-400">{upcomingWatch}</p>
                <p className="text-[10px] text-[#4B5675] mt-1 uppercase tracking-widest">Watch Upcoming</p>
              </div>
              <div className="bg-[#13112A] border border-emerald-500/20 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black font-mono text-emerald-400">{recentGainers}</p>
                <p className="text-[10px] text-[#4B5675] mt-1 uppercase tracking-widest">Recent Gainers</p>
              </div>
              <div className="bg-[#13112A] border border-rose-500/20 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black font-mono text-rose-400">{recentLosers}</p>
                <p className="text-[10px] text-[#4B5675] mt-1 uppercase tracking-widest">Recent Losers</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {(["upcoming", "recent"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors capitalize ${
                  tab === t
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-[#13112A] text-[#4B5675] border border-[#252345] hover:text-[#94A3B8]"
                }`}
              >
                {t === "upcoming" ? `Upcoming (${data?.upcoming.length ?? "…"})` : `Recent (${data?.recent.length ?? "…"})`}
              </button>
            ))}
          </div>

          {/* Rating legend */}
          <div className="flex gap-3 mb-5 flex-wrap">
            {[
              { label: "Strong",      desc: "Major exchange + $200M+ raise",    color: "emerald" },
              { label: "Watch",       desc: "Major exchange or $50M+ raise",    color: "amber"   },
              { label: "Speculative", desc: "SPAC / small raise / no exchange", color: "rose"    },
            ].map(r => (
              <div key={r.label} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-lg bg-${r.color}-500/5 border border-${r.color}-500/20`}>
                <span className={`font-bold text-${r.color}-400`}>{r.label}</span>
                <span className="text-[#4B5675]">{r.desc}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-sm text-rose-400">
              {error}
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 space-y-3">
                  <Skeleton h="h-5" w="w-3/4" />
                  <Skeleton h="h-4" w="w-1/2" />
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[1,2,3].map(j => <Skeleton key={j} h="h-10" />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && !error && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 text-center">
              <p className="text-[#4B5675] text-sm">
                {tab === "upcoming"
                  ? "No upcoming IPOs found in the next 60 days."
                  : "No recent IPOs found in the last 90 days."}
              </p>
            </div>
          )}

          {/* Cards */}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((ipo, i) => (
                <IPOCard key={i} ipo={ipo} showPerf={tab === "recent"} />
              ))}
            </div>
          )}

          <p className="text-[10px] text-[#333368] text-center mt-10">
            IPO data from Finnhub · AI analysis by Claude Haiku · Not financial advice · Data cached 30 min
          </p>
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
