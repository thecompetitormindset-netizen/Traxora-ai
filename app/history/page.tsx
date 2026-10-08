"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useState } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, type Trade } from "../lib/trading";
import { getJournal, type JournalEntry } from "../components/AutoJournal";
import { scopedKey, setCurrentUser } from "../lib/userState";

type SignalRecord = {
  symbol:     string;
  name:       string;
  signal:     "BUY" | "SELL";
  price:      number;
  confidence: string;
  time:       number;
};

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
  const { data: session } = useAppSession();
  const [trades,      setTrades]      = useState<Trade[]>([]);
  const [journal,     setJournal]     = useState<JournalEntry[]>([]);
  const [view,        setView]        = useState<"roundtrip" | "raw" | "signals">("roundtrip");
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [signals,     setSignals]     = useState<SignalRecord[]>([]);
  const [sigPrices,   setSigPrices]   = useState<Record<string, number>>({});

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

  // Load AI signal history from localStorage once session resolves
  useEffect(() => {
    const email = session?.user?.email ?? null;
    setCurrentUser(email);
    try {
      const raw = localStorage.getItem(scopedKey("traxora_alerts"));
      setSignals(raw ? JSON.parse(raw) : []);
    } catch { setSignals([]); }
  }, [session]);

  // Fetch current prices for every unique symbol in signal history
  useEffect(() => {
    if (signals.length === 0) return;
    const syms = [...new Set(signals.map((r) => r.symbol))];
    syms.forEach(async (sym) => {
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
        const data = await res.json();
        if (data?.price) setSigPrices((p) => ({ ...p, [sym]: data.price }));
      } catch { /* silent */ }
    });
  }, [signals]);

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
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">

          {/* Header */}
          <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="reveal text-2xl font-black tracking-tight text-gradient-green">Trade History</h1>
            </div>
            {/* View toggle */}
            <div className="flex gap-1 bg-[#1A1838] rounded-xl p-1 text-xs">
              {([["roundtrip","Round Trips"],["raw","All Trades"],["signals","AI Signals"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    view === v ? "bg-emerald-600 text-white" : "text-[#4B5675] hover:text-[#7B8DB4]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats strip — hidden on signals tab */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 ${view === "signals" ? "hidden" : ""}`}>
            {[
              { label: "Total Trades",     value: trades.length.toString(),                       color: "text-emerald-400" },
              { label: "Completed Pairs",  value: roundTrips.length.toString(),                    color: "text-emerald-400" },
              { label: "Win Rate",         value: roundTrips.length ? `${winRate}%` : "—",          color: winRate >= 50 ? "text-emerald-400" : "text-rose-400" },
              { label: "Realised P&L",     value: roundTrips.length ? `${totalPL >= 0 ? "+" : ""}$${fmt(totalPL)}` : "—", color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(s => (
              <div key={s.label} className="card-shine card-hover-lift glass surface-sheen border border-[#252345] rounded-2xl p-4 text-center">
                <p className={`num-reveal text-2xl font-black font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ─── Round-Trip View ─── */}
          {view === "roundtrip" && (
            <div className="mt-3 space-y-3">

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
            <div className="mt-3 bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
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

          {trades.length > 0 && view !== "signals" && (
            <p className="text-center text-[10px] text-[#333368] mt-3">
              {buyCount} buys · {sellCount} sells · {roundTrips.length} completed round trips
            </p>
          )}

          {/* ─── AI Signal History ─── */}
          {view === "signals" && (
            <div className="mt-3 space-y-2">
              {signals.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-12 text-center">
                  <p className="text-[#4B5675] text-sm">No AI signals fired yet.</p>
                  <p className="text-[11px] text-[#333368] mt-1.5">BUY/SELL signals fire automatically on the dashboard.</p>
                  <Link href="/dashboard" className="inline-block mt-4 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">Go to Dashboard →</Link>
                </div>
              ) : (
                (() => {
                  // Require ≥72h (3 days) so short-term noise doesn't dominate.
                  // 24h is too noisy — a valid BUY can dip 1% on day 1 then run 8% by day 3.
                  const measured = signals.filter(r => {
                    const hoursOld = (Date.now() - r.time) / 3_600_000;
                    return hoursOld >= 72 && sigPrices[r.symbol] != null;
                  });
                  // A signal is "correct" if price moved in the signal direction
                  // by at least 0.3% (filters out flat/noise outcomes)
                  const isCorrect = (r: typeof signals[0]) => {
                    const cur  = sigPrices[r.symbol];
                    const pct  = r.signal === "BUY" ? (cur - r.price) / r.price * 100 : (r.price - cur) / r.price * 100;
                    return pct > 0.3;
                  };
                  const correct  = measured.filter(isCorrect);
                  const accuracy = measured.length >= 3 ? Math.round((correct.length / measured.length) * 100) : null;
                  const buysM    = measured.filter(r => r.signal === "BUY");
                  const sellsM   = measured.filter(r => r.signal === "SELL");
                  const buyAcc   = buysM.length  >= 3 ? Math.round(buysM.filter(isCorrect).length  / buysM.length  * 100) : null;
                  const sellAcc  = sellsM.length >= 3 ? Math.round(sellsM.filter(isCorrect).length / sellsM.length * 100) : null;
                  const avgReturn = measured.length > 0
                    ? measured.reduce((s, r) => {
                        const cur = sigPrices[r.symbol];
                        return s + (r.signal === "BUY" ? (cur - r.price) / r.price : (r.price - cur) / r.price) * 100;
                      }, 0) / measured.length
                    : null;
                  const highConfM   = measured.filter(r => r.confidence === "High");
                  const highConfAcc = highConfM.length >= 3
                    ? Math.round(highConfM.filter(isCorrect).length / highConfM.length * 100)
                    : null;

                  return (
                <>
                  {/* Accuracy stats — ≥72h window filters out 24h noise */}
                  {accuracy != null ? (
                    <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 mb-4">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest">Signal Performance</p>
                        <p className="text-[10px] text-[#333368]">{measured.length} signals ≥3 days old · current prices</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Overall accuracy", value: `${accuracy}%`, color: accuracy >= 60 ? "text-emerald-400" : accuracy >= 45 ? "text-amber-400" : "text-rose-400", sub: `${correct.length}/${measured.length} correct` },
                          { label: "BUY accuracy",     value: buyAcc  != null ? `${buyAcc}%`  : "—", color: buyAcc  != null ? (buyAcc  >= 60 ? "text-emerald-400" : buyAcc  >= 45 ? "text-amber-400" : "text-rose-400") : "text-[#4B5675]", sub: `${buysM.length} measured` },
                          { label: "SELL accuracy",    value: sellAcc != null ? `${sellAcc}%` : "—", color: sellAcc != null ? (sellAcc >= 60 ? "text-emerald-400" : sellAcc >= 45 ? "text-amber-400" : "text-rose-400") : "text-[#4B5675]", sub: `${sellsM.length} measured` },
                          { label: "Avg return",       value: avgReturn != null ? `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(2)}%` : "—", color: avgReturn != null ? (avgReturn >= 0 ? "text-emerald-400" : "text-rose-400") : "text-[#4B5675]", sub: highConfAcc != null ? `High conf: ${highConfAcc}%` : "3-day since signal" },
                        ].map(s => (
                          <div key={s.label} className="bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-3">
                            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">{s.label}</p>
                            <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                            <p className="text-[9px] text-[#333368] mt-0.5">{s.sub}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] text-[#333368] mt-3">Correct = price moved in signal direction by ≥0.3% after 3+ days. Not financial advice.</p>
                    </div>
                  ) : (
                    <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4 mb-4 text-center">
                      <p className="text-[11px] text-[#4B5675]">Accuracy stats appear once 3+ signals are ≥3 days old and current prices load.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Total signals", value: signals.length,                                color: "text-[#F1F5F9]"   },
                      { label: "Buy signals",   value: signals.filter(s => s.signal === "BUY").length,  color: "text-emerald-400" },
                      { label: "Sell signals",  value: signals.filter(s => s.signal === "SELL").length, color: "text-rose-400"    },
                    ].map((s) => (
                      <div key={s.label} className="card-hover-lift bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
                        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest">{s.label}</p>
                        <p className={`text-2xl font-bold font-mono mt-1.5 ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {signals.map((r, i) => {
                    const ticker  = r.symbol.replace(/\.(US|COMM)$/, "");
                    const current = sigPrices[r.symbol];
                    const pctRaw  = current ? ((current - r.price) / r.price) * 100 : null;
                    const pct     = pctRaw != null
                      ? r.signal === "BUY" ? pctRaw : -pctRaw
                      : null;
                    const pctPos  = pct != null && pct >= 0;
                    const diff    = Date.now() - r.time;
                    const mins    = Math.floor(diff / 60_000);
                    const timeStr = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                    return (
                      <Link
                        key={i}
                        href={`/analysis?symbol=${encodeURIComponent(r.symbol)}`}
                        className="group flex items-center gap-3 bg-[#13112A] border border-[#252345] hover:border-[#333368] hover:bg-[#1A1838] rounded-2xl px-4 py-3.5 transition-all"
                      >
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border shrink-0 ${r.signal === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>{r.signal}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm tracking-tight">{ticker}</p>
                          <p className="text-[11px] text-[#4B5675] truncate">{r.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-mono font-bold">${r.price.toFixed(2)}</p>
                          <p className="text-[10px] text-[#4B5675]">at signal</p>
                        </div>
                        {current != null ? (
                          <div className="text-right shrink-0 min-w-[80px]">
                            <p className="text-sm font-mono font-bold">${current.toFixed(2)}</p>
                            {pct != null && (
                              <span className={`text-[10px] font-mono font-bold ${pctPos ? "text-emerald-400" : "text-rose-400"}`}>
                                {pctPos ? "+" : ""}{pct.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        ) : <div className="min-w-[80px]" />}
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className={`text-[10px] font-semibold ${r.confidence === "High" ? "text-emerald-400" : r.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>{r.confidence ?? "—"}</p>
                          <p className="text-[10px] text-[#4B5675]">{timeStr}</p>
                        </div>
                      </Link>
                    );
                  })}
                </>
                  );
                })()
              )}
            </div>
          )}
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
