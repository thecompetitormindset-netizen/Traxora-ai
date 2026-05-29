"use client";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getJournal, clearJournal, type JournalEntry } from "../components/AutoJournal";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const GRADE_STYLE: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  B: "text-cyan-400    bg-cyan-500/10    border-cyan-500/30",
  C: "text-amber-400   bg-amber-500/10   border-amber-500/30",
  D: "text-orange-400  bg-orange-500/10  border-orange-500/30",
  F: "text-rose-400    bg-rose-500/10    border-rose-500/30",
};

type ReviewResult = {
  overallGrade:      string;
  coachSummary:      string;
  recurringMistakes: string[];
  strengths:         string[];
  priorityFixes:     { issue: string; howToFix: string }[];
  nextFocusArea:     string;
  stats: {
    winRate:    number;
    totalPL:    number;
    gradeCount: Record<string, number>;
    tradeCount: number;
  };
};

export default function JournalPage() {
  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [review,     setReview]     = useState<ReviewResult | null>(null);
  const [reviewing,  setReviewing]  = useState(false);
  const [reviewErr,  setReviewErr]  = useState("");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  useEffect(() => {
    setEntries(getJournal());
    const refresh = () => setEntries(getJournal());
    window.addEventListener("journal-updated", refresh);
    return () => window.removeEventListener("journal-updated", refresh);
  }, []);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function getCoaching() {
    setReviewing(true);
    setReviewErr("");
    try {
      const res  = await fetch("/api/ai/journal-review", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sells }),   // only send SELL entries
      });
      const data = await res.json();
      if (!res.ok) { setReviewErr(data.error ?? "Failed"); return; }
      setReview(data);
    } catch (err) {
      setReviewErr(err instanceof Error ? err.message : "Network error");
    } finally {
      setReviewing(false);
    }
  }

  const sells  = entries.filter(e => e.side === "SELL");
  const buys   = entries.filter(e => e.side === "BUY");
  const wins   = sells.filter(e => (e.pl ?? 0) > 0);
  const winRate = sells.length > 0 ? Math.round((wins.length / sells.length) * 100) : 0;
  const totalPL = sells.reduce((s, e) => s + (e.pl ?? 0), 0);
  const avgPLPct = sells.length > 0
    ? (sells.reduce((s, e) => s + (e.plPct ?? 0), 0) / sells.length).toFixed(1)
    : "0.0";

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">Trade Journal</h1>
              <p className="text-[#7B8DB4] mt-1 text-sm">
                AI-written analysis for every trade — mistakes, lessons, and coaching.
              </p>
            </div>
            {entries.length > 0 && (
              <button
                onClick={() => { clearJournal(); setReview(null); }}
                className="text-xs text-[#4B5675] hover:text-rose-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Stats strip */}
          {entries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {[
                { label: "Closed Trades", value: entries.length.toString(),                    color: "text-emerald-400" },
                { label: "Win Rate",      value: sells.length > 0 ? `${winRate}%` : "—",        color: winRate >= 50 ? "text-emerald-400" : "text-rose-400" },
                { label: "Total P&L",     value: `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`, color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: "Avg P&L %",     value: sells.length > 0 ? `${Number(avgPLPct) >= 0 ? "+" : ""}${avgPLPct}%` : "—", color: Number(avgPLPct) >= 0 ? "text-emerald-400" : "text-rose-400" },
              ].map(s => (
                <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 text-center">
                  <p className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Grade distribution */}
          {sells.length > 0 && (() => {
            const grades = ["A", "B", "C", "D", "F"];
            const counts = Object.fromEntries(grades.map(g => [g, sells.filter(e => e.analysis?.grade === g).length]));
            return (
              <div className="mt-3 bg-[#13112A] border border-[#252345] rounded-2xl p-4">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Grade Distribution</p>
                <div className="flex gap-2">
                  {grades.map(g => (
                    <div key={g} className="flex-1 text-center">
                      <p className={`text-lg font-black ${GRADE_STYLE[g].split(" ")[0]}`}>{counts[g]}</p>
                      <p className="text-[10px] text-[#4B5675] mt-0.5">{g}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* AI Coaching button */}
          {sells.length >= 2 && !review && (
            <button
              onClick={getCoaching}
              disabled={reviewing}
              className="w-full mt-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 transition-colors font-semibold text-sm flex items-center justify-center gap-2"
            >
              {reviewing ? (
                <>
                  <span className="animate-spin text-base">⟳</span>
                  Analyzing your trading patterns…
                </>
              ) : (
                <>🧠 Get AI Coaching Report</>
              )}
            </button>
          )}
          {reviewErr && <p className="text-rose-400 text-xs mt-2 text-center">{reviewErr}</p>}

          {/* Coaching Report */}
          {review && (
            <div className="mt-4 bg-[#13112A] border border-emerald-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-base text-[#F1F5F9]">AI Coaching Report</p>
                <span className={`text-sm font-black px-3 py-1 rounded-lg border ${GRADE_STYLE[review.overallGrade] ?? GRADE_STYLE.C}`}>
                  {review.overallGrade}
                </span>
              </div>

              <p className="text-sm text-[#7B8DB4] leading-relaxed">{review.coachSummary}</p>

              {/* Priority fixes */}
              {review.priorityFixes.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Priority Fixes</p>
                  <div className="space-y-2">
                    {review.priorityFixes.map((fix, i) => (
                      <div key={i} className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                        <p className="text-xs font-semibold text-rose-300 mb-1">{fix.issue}</p>
                        <p className="text-xs text-[#7B8DB4] leading-relaxed">{fix.howToFix}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recurring mistakes */}
              {review.recurringMistakes.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Recurring Mistakes</p>
                  <ul className="space-y-1">
                    {review.recurringMistakes.map((m, i) => (
                      <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                        <span className="text-rose-400 shrink-0">×</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Strengths */}
              {review.strengths.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Strengths</p>
                  <ul className="space-y-1">
                    {review.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                        <span className="text-emerald-400 shrink-0">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next focus */}
              {review.nextFocusArea && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">This Week's Focus</p>
                  <p className="text-xs text-emerald-300 leading-relaxed">{review.nextFocusArea}</p>
                </div>
              )}

              <button
                onClick={getCoaching}
                className="text-xs text-[#4B5675] hover:text-emerald-400 transition-colors"
              >
                Refresh report
              </button>
            </div>
          )}

          {/* Trade entries */}
          <div className="mt-6 space-y-3">
            {entries.length === 0 ? (
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-10 text-center">
                <p className="text-4xl mb-4">📓</p>
                <p className="text-[#F1F5F9] font-semibold">No journal entries yet</p>
                <p className="text-[#4B5675] text-sm mt-2 max-w-xs mx-auto">
                  Close a trade in your Paper Portfolio and an AI-written coaching entry is generated automatically.
                </p>
              </div>
            ) : (
              entries.map((e) => {
                const won     = (e.pl ?? 0) >= 0;
                const clean   = e.symbol.replace(".US", "").replace(".COMM", "");
                const isOpen  = expanded.has(e.id);
                const hasAI   = Boolean(e.analysis);
                const grade   = e.analysis?.grade ?? null;
                const plPos   = (e.pl ?? 0) >= 0;

                return (
                  <div
                    key={e.id}
                    className={`bg-[#13112A] border rounded-2xl overflow-hidden transition-all ${
                      won ? "border-emerald-500/20" : "border-rose-500/20"
                    }`}
                  >
                    {/* Card header — always visible */}
                    <button
                      className="w-full p-5 text-left"
                      onClick={() => hasAI && toggleExpand(e.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Win/Loss badge */}
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border shrink-0 ${
                            won
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                          }`}>
                            {won ? "WIN" : "LOSS"}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[#F1F5F9]">{clean}</p>
                              {/* Grade badge — SELL only */}
                              {grade && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${GRADE_STYLE[grade] ?? GRADE_STYLE.C}`}>
                                  {grade}
                                </span>
                              )}
                              {/* Close reason tag */}
                              {e.closeReason === "tp" && (
                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                  TP HIT
                                </span>
                              )}
                              {e.closeReason === "stop" && (
                                <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                                  STOPPED
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#4B5675] font-mono mt-0.5">
                              {e.quantity} share{e.quantity !== 1 ? "s" : ""} · ${Number(e.price).toFixed(2)}
                              {e.pl != null && (
                                <span className={`ml-2 font-semibold ${plPos ? "text-emerald-400" : "text-rose-400"}`}>
                                  {plPos ? "+" : ""}${Number(e.pl).toFixed(2)} ({plPos ? "+" : ""}{Number(e.plPct).toFixed(1)}%)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[10px] text-[#4B5675]">{timeAgo(e.timestamp)}</p>
                          {hasAI && (
                            <span className="text-[#4B5675] text-xs">{isOpen ? "▲" : "▼"}</span>
                          )}
                        </div>
                      </div>

                      {/* AI entry — always shown */}
                      <div className="border-l-2 border-emerald-500/30 pl-3 mt-3">
                        <p className="text-xs text-[#7B8DB4] leading-relaxed">{e.entry}</p>
                      </div>
                    </button>

                    {/* Expanded analysis — SELL trades only */}
                    {isOpen && e.analysis && (
                      <div className="border-t border-[#252345] px-5 pb-5 pt-4 space-y-4">

                        {/* Verdict */}
                        <div className="flex items-start gap-3">
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${GRADE_STYLE[grade!] ?? GRADE_STYLE.C}`}>
                            {grade}
                          </span>
                          <p className="text-xs text-[#7B8DB4] leading-relaxed pt-0.5">{e.analysis.verdict}</p>
                        </div>

                        {/* Mistakes */}
                        {e.analysis.mistakes.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Mistakes</p>
                            <ul className="space-y-1.5">
                              {e.analysis.mistakes.map((m, i) => (
                                <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                                  <span className="text-rose-400 shrink-0">×</span>
                                  {m}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Wins */}
                        {e.analysis.wins.length > 0 && (
                          <div>
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">What Went Right</p>
                            <ul className="space-y-1.5">
                              {e.analysis.wins.map((w, i) => (
                                <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                                  <span className="text-emerald-400 shrink-0">✓</span>
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Lesson */}
                        {e.analysis.lesson && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Key Lesson</p>
                            <p className="text-xs text-emerald-300 leading-relaxed">{e.analysis.lesson}</p>
                          </div>
                        )}

                        {/* Trade details */}
                        {(e.entryPrice != null || e.stopLoss != null || e.takeProfit != null) && (
                          <div className="flex gap-3 flex-wrap pt-1">
                            {e.entryPrice != null && (
                              <span className="text-[10px] text-[#4B5675] font-mono">
                                Entry: ${Number(e.entryPrice).toFixed(2)}
                              </span>
                            )}
                            {e.stopLoss != null && (
                              <span className="text-[10px] text-[#4B5675] font-mono">
                                SL: ${Number(e.stopLoss).toFixed(2)}
                              </span>
                            )}
                            {e.takeProfit != null && (
                              <span className="text-[10px] text-[#4B5675] font-mono">
                                TP: ${Number(e.takeProfit).toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {entries.length > 0 && (
            <p className="text-center text-[10px] text-[#333368] mt-6">
              {entries.length} closed trade{entries.length !== 1 ? "s" : ""} · AI-generated coaching
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
