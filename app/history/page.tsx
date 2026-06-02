"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, type Trade } from "../lib/trading";
import { getJournal, type JournalEntry } from "../components/AutoJournal";

type RoundTrip = {
  symbol:     string;
  buyTrade:   Trade;
  sellTrade:  Trade;
  pl:         number;
  plPct:      number;
  buyEntry?:  JournalEntry;   // AI reasoning at entry
  sellEntry?: JournalEntry;   // AI analysis at exit
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  B: "text-cyan-400    bg-cyan-500/10    border-cyan-500/20",
  C: "text-amber-400   bg-amber-500/10   border-amber-500/20",
  D: "text-orange-400  bg-orange-500/10  border-orange-500/20",
  F: "text-rose-400    bg-rose-500/10    border-rose-500/20",
};

function fmt(n: number, decimals = 2) { return n.toFixed(decimals); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPage() {
  const [trades,      setTrades]      = useState<Trade[]>([]);
  const [journal,     setJournal]     = useState<JournalEntry[]>([]);
  const [view,        setView]        = useState<"roundtrip" | "raw">("roundtrip");
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  useEffect(() => {
  }, []);

  useEffect(() => {
    function load() {
      const p = getPortfolio();
      setTrades(p.trades);
      setJournal(getJournal());
    }
    load();
    window.addEventListener("journal-updated", load);
    return () => window.removeEventListener("journal-updated", load);
  }, []);

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Build round-trip pairs: match each SELL to its preceding BUY
  const roundTrips: RoundTrip[] = [];
  const usedBuyIdx = new Set<number>();

  // trades is newest-first, reverse to process chronologically
  const chronological = [...trades].reverse();

  for (let i = 0; i < chronological.length; i++) {
    const sell = chronological[i];
    if (sell.side !== "SELL") continue;

    // Find most recent BUY of same symbol before this SELL (not already matched)
    for (let j = i - 1; j >= 0; j--) {
      if (usedBuyIdx.has(j)) continue;
      const buy = chronological[j];
      if (buy.symbol !== sell.symbol || buy.side !== "BUY") continue;

      usedBuyIdx.add(j);
      const pl    = (sell.price - buy.price) * sell.quantity;
      const plPct = ((sell.price - buy.price) / buy.price) * 100;

      // Find matching journal entries
      const buyEntry  = journal.find(e => e.side === "BUY"  && e.symbol === sell.symbol &&
        Math.abs(new Date(e.timestamp).getTime() - new Date(buy.time).getTime()) < 60_000);
      const sellEntry = journal.find(e => e.side === "SELL" && e.symbol === sell.symbol &&
        Math.abs(new Date(e.timestamp).getTime() - new Date(sell.time).getTime()) < 60_000);

      roundTrips.push({ symbol: sell.symbol, buyTrade: buy, sellTrade: sell, pl, plPct, buyEntry, sellEntry });
      break;
    }
  }

  // Unmatched (open) BUY trades
  const unmatchedBuys = chronological.filter((t, i) => t.side === "BUY" && !usedBuyIdx.has(i));

  const totalPL    = roundTrips.reduce((s, r) => s + r.pl, 0);
  const wins       = roundTrips.filter(r => r.pl > 0).length;
  const winRate    = roundTrips.length > 0 ? Math.round((wins / roundTrips.length) * 100) : 0;
  const buyCount   = trades.filter(t => t.side === "BUY").length;
  const sellCount  = trades.filter(t => t.side === "SELL").length;

  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-4xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold">Trade History</h1>
              <p className="text-[#7B8DB4] mt-1 text-sm">
                Round-trip analysis — entry reasoning vs actual outcome.
              </p>
            </div>
            {/* View toggle */}
            <div className="flex gap-1 bg-[#1A1838] rounded-xl p-1 text-xs">
              {(["roundtrip", "raw"] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    view === v ? "bg-emerald-600 text-white" : "text-[#4B5675] hover:text-[#7B8DB4]"
                  }`}
                >
                  {v === "roundtrip" ? "Round Trips" : "All Trades"}
                </button>
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Total Trades",     value: trades.length.toString(),                       color: "text-emerald-400" },
              { label: "Completed Pairs",  value: roundTrips.length.toString(),                    color: "text-emerald-400" },
              { label: "Win Rate",         value: roundTrips.length ? `${winRate}%` : "—",          color: winRate >= 50 ? "text-emerald-400" : "text-rose-400" },
              { label: "Realised P&L",     value: roundTrips.length ? `${totalPL >= 0 ? "+" : ""}$${fmt(totalPL)}` : "—", color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(s => (
              <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 text-center">
                <p className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ─── Round-Trip View ─── */}
          {view === "roundtrip" && (
            <div className="mt-6 space-y-3">

              {roundTrips.length === 0 && unmatchedBuys.length === 0 && (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-10 text-center">
                  <p className="text-3xl mb-3">📊</p>
                  <p className="font-semibold text-[#F1F5F9]">No completed trades yet</p>
                  <p className="text-[#4B5675] text-sm mt-2">A round trip is one BUY matched to one SELL of the same symbol.</p>
                </div>
              )}

              {roundTrips.map((rt, idx) => {
                const key    = `${rt.symbol}-${idx}`;
                const isOpen = expanded.has(key);
                const clean  = rt.symbol.replace(".US", "").replace(".COMM", "");
                const pos    = rt.pl >= 0;
                const grade  = rt.sellEntry?.analysis?.grade;

                return (
                  <div
                    key={key}
                    className={`bg-[#13112A] border rounded-2xl overflow-hidden ${
                      pos ? "border-emerald-500/20" : "border-rose-500/20"
                    }`}
                  >
                    {/* Summary row */}
                    <button type="button" className="w-full p-5 text-left" onClick={() => toggleExpand(key)}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Outcome badge */}
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border shrink-0 ${
                            pos
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                          }`}>
                            {pos ? "WIN" : "LOSS"}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[#F1F5F9]">{clean}</p>
                              {grade && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${GRADE_COLOR[grade] ?? GRADE_COLOR.C}`}>
                                  {grade}
                                </span>
                              )}
                              {rt.sellTrade.closeReason === "tp" && (
                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">TP HIT</span>
                              )}
                              {rt.sellTrade.closeReason === "stop" && (
                                <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">STOPPED</span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#4B5675] font-mono mt-0.5">
                              {rt.buyTrade.quantity} shares · Entry ${fmt(rt.buyTrade.price)} → Exit ${fmt(rt.sellTrade.price)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`font-black font-mono text-base ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                              {pos ? "+" : ""}${fmt(rt.pl)}
                            </p>
                            <p className={`text-[10px] font-mono ${pos ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                              {pos ? "+" : ""}{fmt(rt.plPct, 1)}%
                            </p>
                          </div>
                          <span className="text-[#4B5675] text-xs">{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-[#252345] px-5 pb-5 pt-4 space-y-4">

                        {/* Entry vs Exit timeline */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Entry (BUY)</p>
                            <p className="font-mono font-bold text-emerald-400 text-sm">${fmt(rt.buyTrade.price)}</p>
                            <p className="text-[10px] text-[#4B5675] mt-0.5">{fmtDate(rt.buyTrade.time)}</p>
                            {rt.buyTrade.stopLoss && (
                              <p className="text-[10px] text-[#4B5675] font-mono mt-1">SL ${fmt(rt.buyTrade.stopLoss)} · TP ${fmt(rt.buyTrade.takeProfit ?? 0)}</p>
                            )}
                          </div>
                          <div className={`border rounded-xl p-3 ${pos ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Exit (SELL)</p>
                            <p className={`font-mono font-bold text-sm ${pos ? "text-emerald-400" : "text-rose-400"}`}>${fmt(rt.sellTrade.price)}</p>
                            <p className="text-[10px] text-[#4B5675] mt-0.5">{fmtDate(rt.sellTrade.time)}</p>
                            <p className={`text-[10px] font-mono mt-1 font-semibold ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                              {pos ? "+" : ""}${fmt(rt.pl)} ({pos ? "+" : ""}{fmt(rt.plPct, 1)}%)
                            </p>
                          </div>
                        </div>

                        {/* AI Entry Reasoning */}
                        {rt.buyEntry && (
                          <div>
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">AI Entry Reasoning</p>
                            <div className="border-l-2 border-emerald-500/30 pl-3">
                              <p className="text-xs text-[#7B8DB4] leading-relaxed">{rt.buyEntry.entry}</p>
                            </div>
                          </div>
                        )}

                        {/* Did the thesis play out? */}
                        {rt.sellEntry?.analysis && (
                          <>
                            <div>
                              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Outcome vs Thesis</p>
                              <div className={`border-l-2 pl-3 ${pos ? "border-emerald-500/30" : "border-rose-500/30"}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-[#F1F5F9]">
                                    {pos ? "✓ Trade played out in favor" : "✗ Trade went against the thesis"}
                                  </span>
                                </div>
                                <p className="text-xs text-[#7B8DB4] leading-relaxed">{rt.sellEntry.analysis.verdict}</p>
                              </div>
                            </div>

                            {/* Mistakes */}
                            {rt.sellEntry.analysis.mistakes.length > 0 && (
                              <div>
                                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">Execution Mistakes</p>
                                <ul className="space-y-1.5">
                                  {rt.sellEntry.analysis.mistakes.map((m, i) => (
                                    <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                                      <span className="text-rose-400 shrink-0">×</span>{m}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Wins */}
                            {rt.sellEntry.analysis.wins.length > 0 && (
                              <div>
                                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2">What Went Right</p>
                                <ul className="space-y-1.5">
                                  {rt.sellEntry.analysis.wins.map((w, i) => (
                                    <li key={i} className="text-xs text-[#7B8DB4] flex gap-2">
                                      <span className="text-emerald-400 shrink-0">✓</span>{w}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Lesson */}
                            {rt.sellEntry.analysis.lesson && (
                              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Key Lesson</p>
                                <p className="text-xs text-emerald-300 leading-relaxed">{rt.sellEntry.analysis.lesson}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Open positions */}
              {unmatchedBuys.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-2 px-1">Open Positions</p>
                  {unmatchedBuys.map((t, i) => {
                    const clean = t.symbol.replace(".US", "").replace(".COMM", "");
                    return (
                      <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black px-2.5 py-1 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                            OPEN
                          </span>
                          <div>
                            <p className="font-bold text-[#F1F5F9]">{clean}</p>
                            <p className="text-[10px] text-[#4B5675] font-mono">
                              {t.quantity} shares · ${fmt(t.price)} · {fmtDate(t.time)}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-amber-400 font-medium">Active</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Raw Trade Log View ─── */}
          {view === "raw" && (
            <div className="mt-6 bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
              {trades.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[#4B5675] text-sm">No trades yet. Go to Market and place a trade.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[#4B5675] text-[10px] uppercase tracking-wide border-b border-[#252345]">
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Symbol</th>
                        <th className="px-4 py-3 font-semibold">Qty</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Close</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr key={`${trade.symbol}-${trade.time}-${index}`} className="border-b border-[#252345] last:border-0">
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              trade.side === "BUY"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}>
                              {trade.side}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-[#F1F5F9]">
                            {trade.symbol.replace(".US", "").replace(".COMM", "")}
                          </td>
                          <td className="px-4 py-3 font-mono text-[#7B8DB4]">{trade.quantity}</td>
                          <td className="px-4 py-3 font-mono text-[#7B8DB4]">${fmt(trade.price)}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-[#F1F5F9]">
                            ${fmt(trade.quantity * trade.price)}
                          </td>
                          <td className="px-4 py-3 text-[10px]">
                            {trade.closeReason === "tp"   && <span className="text-emerald-400">TP</span>}
                            {trade.closeReason === "stop" && <span className="text-orange-400">Stop</span>}
                            {!trade.closeReason && <span className="text-[#4B5675]">—</span>}
                          </td>
                          <td className="px-4 py-3 text-[#4B5675] text-xs whitespace-nowrap">
                            {fmtDate(trade.time)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {trades.length > 0 && (
            <p className="text-center text-[10px] text-[#333368] mt-6">
              {buyCount} buys · {sellCount} sells · {roundTrips.length} completed round trips
            </p>
          )}
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
