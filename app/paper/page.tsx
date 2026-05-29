"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { generateAndSavePaperEntry } from "../components/AutoJournal";
import Link from "next/link";
import type { PaperTrade, Direction, ExitReason, TradeStatus, AddTradeInitial } from "../lib/paperTrades";
import {
  loadTrades, saveTrades, calcPL, calcPLPct,
  fmtMoney, fmtPct, plColor, daysBetween,
  STARTING_CAPITAL,
} from "../lib/paperTrades";
import AddTradeModal from "../components/paper/AddTradeModal";
import CloseModal from "../components/paper/CloseModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type TradeReview = {
  summary: string;
  frameworks?: {
    ict?:       { verdict: string; points: string[] };
    wyckoff?:   { verdict: string; points: string[] };
    rMultiple?: { achieved: string; verdict: string };
    douglas?:   { verdict: string; point: string };
    risk?:      { verdict: string; points: string[] };
  };
  strengths: string[];
  mistakes:  string[];
  lesson:    string;
};

// ── Main Page ─────────────────────────────────────────────────────────────────

function PaperPortfolio() {
  const searchParams                    = useSearchParams();
  const router                          = useRouter();
  const [trades, setTrades]             = useState<PaperTrade[]>([]);
  const [prices, setPrices]             = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [addInitial, setAddInitial]     = useState<AddTradeInitial | undefined>();
  const [closing, setClosing]           = useState<PaperTrade | null>(null);
  const [tab, setTab]                   = useState<"open" | "closed">("open");
  const [reviews, setReviews]           = useState<Record<string, TradeReview | "loading" | "error">>({});

  // Pre-fill from signal toast URL params
  useEffect(() => {
    const symbol    = searchParams.get("symbol");
    const direction = searchParams.get("direction") as Direction | null;
    const price     = searchParams.get("price");
    if (symbol && direction) {
      setAddInitial({ symbol, direction, entryPrice: price ?? "" });
      setShowAdd(true);
      router.replace("/paper");
    }
  }, [searchParams, router]);

  useEffect(() => { setTrades(loadTrades()); }, []);

  const open   = trades.filter(t => t.status === "OPEN");
  const closed = trades.filter(t => t.status === "CLOSED").sort((a, b) =>
    new Date(b.exitDate!).getTime() - new Date(a.exitDate!).getTime());

  // Fetch live prices for open positions
  const fetchPrices = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setLoadingPrices(true);
    const results = await Promise.allSettled(symbols.map(async sym => {
      const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const data = await res.json();
      return { sym, price: typeof data.price === "number" ? data.price : null };
    }));
    const map: Record<string, number> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.price !== null) map[r.value.sym] = r.value.price;
    }
    setPrices(prev => ({ ...prev, ...map }));
    setLoadingPrices(false);
  }, []);

  useEffect(() => {
    const syms = [...new Set(open.map(t => t.symbol))];
    if (syms.length > 0) fetchPrices(syms);
    const id = setInterval(() => {
      const s = [...new Set(open.map(t => t.symbol))];
      if (s.length > 0) fetchPrices(s);
    }, 30_000);
    return () => clearInterval(id);
  }, [trades, fetchPrices]);

  async function fetchReview(trade: PaperTrade) {
    if (!trade.exitPrice || !trade.exitDate) return;
    setReviews(prev => ({ ...prev, [trade.id]: "loading" }));
    try {
      const pl    = calcPL(trade, trade.exitPrice);
      const plPct = calcPLPct(trade, trade.exitPrice);
      const res   = await fetch("/api/ai/trade-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:      trade.symbol,
          direction:   trade.direction,
          entryPrice:  trade.entryPrice,
          exitPrice:   trade.exitPrice,
          shares:      trade.shares,
          stopLoss:    trade.stopLoss,
          takeProfit:  trade.takeProfit,
          entryDate:   trade.entryDate,
          exitDate:    trade.exitDate,
          exitReason:  trade.exitReason,
          notes:       trade.notes,
          pl,
          plPct,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReviews(prev => ({ ...prev, [trade.id]: data }));
    } catch {
      setReviews(prev => ({ ...prev, [trade.id]: "error" }));
    }
  }

  function addTrade(t: PaperTrade) {
    const updated = [t, ...trades];
    setTrades(updated);
    saveTrades(updated);
    fetchPrices([t.symbol]);
  }

  function closeTrade(id: string, exitPrice: number, reason: ExitReason) {
    const exitDate = new Date().toISOString();
    const updated = trades.map(t => t.id === id ? {
      ...t, status: "CLOSED" as TradeStatus,
      exitPrice, exitDate, exitReason: reason,
    } : t);
    setTrades(updated);
    saveTrades(updated);
    setClosing(null);
    const trade = trades.find(t => t.id === id);
    if (trade) {
      generateAndSavePaperEntry({
        id:         trade.id,
        symbol:     trade.symbol,
        direction:  trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice,
        shares:     trade.shares,
        stopLoss:   trade.stopLoss,
        takeProfit: trade.takeProfit,
        exitDate,
        exitReason: reason,
      });
    }
  }

  function deleteTrade(id: string) {
    if (!confirm("Delete this trade?")) return;
    const updated = trades.filter(t => t.id !== id);
    setTrades(updated);
    saveTrades(updated);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalUnrealized = open.reduce((s, t) => {
    const p = prices[t.symbol];
    return p != null ? s + calcPL(t, p) : s;
  }, 0);

  const closedPL = closed.reduce((s, t) =>
    t.exitPrice != null ? s + calcPL(t, t.exitPrice) : s, 0);

  const wins    = closed.filter(t => t.exitPrice != null && calcPL(t, t.exitPrice) > 0).length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null;

  const totalPL    = closedPL + totalUnrealized;
  const accountVal = STARTING_CAPITAL + totalPL;

  const stats = [
    { label: "Account Value",  value: `$${accountVal.toFixed(2)}`,                      color: "text-[#F1F5F9]" },
    { label: "Total P&L",      value: fmtMoney(totalPL),                                color: plColor(totalPL) },
    { label: "Open Positions", value: open.length.toString(),                            color: "text-[#F1F5F9]" },
    { label: "Win Rate",       value: winRate != null ? `${winRate}%` : "—",            color: winRate != null ? (winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#7B8DB4]" },
    { label: "Closed Trades",  value: closed.length.toString(),                          color: "text-[#F1F5F9]" },
    { label: "Realized P&L",   value: closed.length > 0 ? fmtMoney(closedPL) : "—",   color: plColor(closedPL) },
  ];

  // ── Advanced math stats ────────────────────────────────────────────────────
  const closedWithPL = closed.filter(t => t.exitPrice != null);
  const winTrades    = closedWithPL.filter(t => calcPL(t, t.exitPrice!) > 0);
  const lossTrades   = closedWithPL.filter(t => calcPL(t, t.exitPrice!) < 0);

  const avgWin  = winTrades.length  > 0 ? winTrades.reduce((s, t)  => s + calcPL(t, t.exitPrice!), 0)  / winTrades.length  : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0) / lossTrades.length) : 0;
  const winPct  = closedWithPL.length > 0 ? winTrades.length / closedWithPL.length : 0;
  const lossPct = 1 - winPct;
  const expectancy = closedWithPL.length >= 2 ? (winPct * avgWin) - (lossPct * avgLoss) : null;

  const grossWins   = winTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0);
  const grossLosses = Math.abs(lossTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0));
  const profitFactor = closedWithPL.length >= 2 && grossLosses > 0 ? grossWins / grossLosses : null;

  const rMultiples = closedWithPL
    .filter(t => t.stopLoss != null)
    .map(t => {
      const risk = Math.abs(t.entryPrice - t.stopLoss!) * t.shares;
      return risk > 0 ? calcPL(t, t.exitPrice!) / risk : null;
    })
    .filter((r): r is number => r !== null);
  const avgR = rMultiples.length > 0 ? rMultiples.reduce((s, r) => s + r, 0) / rMultiples.length : null;

  let maxConsecLosses = 0, curConsec = 0;
  for (const t of [...closedWithPL].reverse()) {
    if (calcPL(t, t.exitPrice!) < 0) { curConsec++; maxConsecLosses = Math.max(maxConsecLosses, curConsec); }
    else curConsec = 0;
  }

  const holdTimes = closedWithPL.filter(t => t.exitDate).map(t => daysBetween(t.entryDate, t.exitDate!));
  const avgHold   = holdTimes.length > 0 ? (holdTimes.reduce((s, d) => s + d, 0) / holdTimes.length) : null;

  const showAdvanced = closedWithPL.length >= 2;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Paper Portfolio</h1>
              <p className="text-sm text-[#7B8DB4] mt-1">
                Log trades from TradingView manually — track live P&amp;L, stops &amp; targets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Log Trade
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {stats.map(s => (
              <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-2xl px-4 py-4">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-medium mb-1">{s.label}</p>
                <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Advanced performance metrics */}
          {showAdvanced && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-4">Performance Metrics</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Expectancy */}
                <div>
                  <p className={`text-lg font-black font-mono ${expectancy != null ? plColor(expectancy) : "text-[#7B8DB4]"}`}>
                    {expectancy != null ? `${expectancy >= 0 ? "+" : ""}$${expectancy.toFixed(2)}` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Expectancy / trade</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Van Tharp — avg $ earned per trade. Positive = your system has an edge.</p>
                </div>
                {/* Profit Factor */}
                <div>
                  <p className={`text-lg font-black font-mono ${profitFactor != null ? (profitFactor >= 1.5 ? "text-emerald-400" : profitFactor >= 1 ? "text-amber-400" : "text-rose-400") : "text-[#7B8DB4]"}`}>
                    {profitFactor != null ? `${profitFactor.toFixed(2)}x` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Profit Factor</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Total wins ÷ total losses. &gt;1.5 = solid. &gt;2.0 = excellent.</p>
                </div>
                {/* Avg R-Multiple */}
                <div>
                  <p className={`text-lg font-black font-mono ${avgR != null ? plColor(avgR) : "text-[#7B8DB4]"}`}>
                    {avgR != null ? `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Avg R-Multiple</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Van Tharp — actual R earned per 1R risked. Only trades with a SL count.</p>
                </div>
                {/* Max Consec Losses */}
                <div>
                  <p className={`text-lg font-black font-mono ${maxConsecLosses >= 4 ? "text-rose-400" : maxConsecLosses >= 2 ? "text-amber-400" : "text-emerald-400"}`}>
                    {maxConsecLosses}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Max Consec. Losses</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Worst losing streak. Know your drawdown tolerance before it hits.</p>
                </div>
                {/* Avg Hold Time */}
                <div>
                  <p className="text-lg font-black font-mono text-[#F1F5F9]">
                    {avgHold != null ? `${avgHold.toFixed(1)}d` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Avg Hold Time</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Average days per closed trade. Shorter isn't always better.</p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-[#0D0B1A] border border-[#252345] rounded-xl p-1 w-fit">
            {([["open", `Open (${open.length})`], ["closed", `Closed (${closed.length})`]] as const).map(([t, l]) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-[#252345] text-[#F1F5F9]" : "text-[#4B5675] hover:text-[#7B8DB4]"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* ── OPEN POSITIONS ─────────────────────────────────────────────── */}
          {tab === "open" && (
            <div className="space-y-3">
              {open.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-16 text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No open positions</p>
                  <p className="text-xs text-[#4B5675] mb-5">Apply a signal from the morning brief in TradingView, then log it here.</p>
                  <button type="button" onClick={() => setShowAdd(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold">
                    Log First Trade →
                  </button>
                </div>
              ) : (
                <>
                  {loadingPrices && (
                    <p className="text-xs text-[#4B5675] flex items-center gap-1.5">
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Refreshing prices…
                    </p>
                  )}
                  {open.map(trade => {
                    const cur = prices[trade.symbol];
                    const pl    = cur != null ? calcPL(trade, cur)    : null;
                    const plPct = cur != null ? calcPLPct(trade, cur) : null;
                    const cost  = trade.entryPrice * trade.shares;

                    // SL/TP distance bars
                    const slDist = trade.stopLoss   != null && cur != null
                      ? Math.abs(cur - trade.stopLoss)   / Math.abs(trade.entryPrice - trade.stopLoss)   * 100 : null;
                    const tpDist = trade.takeProfit != null && cur != null
                      ? Math.abs(cur - trade.takeProfit) / Math.abs(trade.entryPrice - trade.takeProfit) * 100 : null;

                    const atRisk    = trade.stopLoss   != null ? Math.abs(trade.entryPrice - trade.stopLoss)   * trade.shares : null;
                    const potential = trade.takeProfit != null ? Math.abs(trade.entryPrice - trade.takeProfit) * trade.shares : null;
                    const rr        = atRisk && potential ? (potential / atRisk).toFixed(1) : null;

                    const days = daysBetween(trade.entryDate, new Date().toISOString());

                    return (
                      <div key={trade.id} className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                        {/* Main row */}
                        <div className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            {/* Left: symbol + meta */}
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${trade.direction === "LONG" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                {trade.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-lg font-black tracking-tight">{trade.symbol}</p>
                                  <Link href={`/analysis?symbol=${encodeURIComponent(trade.symbol)}`}
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-semibold">
                                    Analyse →
                                  </Link>
                                </div>
                                <p className="text-xs text-[#4B5675]">
                                  {trade.shares} shares @ ${trade.entryPrice.toFixed(2)} · ${cost.toFixed(2)} cost · {days}d ago
                                </p>
                              </div>
                            </div>

                            {/* Right: current price + P&L */}
                            <div className="text-right">
                              <p className="text-xl font-black font-mono">
                                {cur != null ? `$${cur.toFixed(2)}` : <span className="text-[#4B5675] text-base">loading…</span>}
                              </p>
                              {pl !== null && plPct !== null && (
                                <p className={`text-sm font-bold font-mono ${plColor(pl)}`}>
                                  {fmtMoney(pl)} · {fmtPct(plPct)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* SL / TP progress bars */}
                          {(trade.stopLoss != null || trade.takeProfit != null) && (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {trade.stopLoss != null && (
                                <div>
                                  <div className="flex justify-between text-[10px] text-[#4B5675] mb-1">
                                    <span>Stop Loss</span>
                                    <span className="text-rose-400 font-mono font-bold">${trade.stopLoss.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#252345] rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500/60 rounded-full transition-all"
                                      style={{ width: `${Math.min(slDist ?? 0, 100)}%` }} />
                                  </div>
                                </div>
                              )}
                              {trade.takeProfit != null && (
                                <div>
                                  <div className="flex justify-between text-[10px] text-[#4B5675] mb-1">
                                    <span>Take Profit {rr && <span className="text-emerald-400">{rr}:1 R:R</span>}</span>
                                    <span className="text-emerald-400 font-mono font-bold">${trade.takeProfit.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#252345] rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500/60 rounded-full transition-all"
                                      style={{ width: `${Math.min(tpDist ?? 0, 100)}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Notes */}
                          {trade.notes && (
                            <p className="mt-3 text-xs text-[#7B8DB4] italic">"{trade.notes}"</p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-4">
                            <button type="button" onClick={() => setClosing(trade)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 rounded-xl text-xs font-bold">
                              Close Position
                            </button>
                            <button type="button" onClick={() => deleteTrade(trade.id)}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4B5675] hover:text-rose-400 border border-[#252345] hover:border-rose-500/30 transition-all">
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── CLOSED TRADES ──────────────────────────────────────────────── */}
          {tab === "closed" && (
            <div>
              {closed.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-16 text-center">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No closed trades yet</p>
                  <p className="text-xs text-[#4B5675]">Closed positions will appear here with full P&amp;L breakdown.</p>
                </div>
              ) : (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-[#252345] text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">
                    <span className="col-span-2">Trade</span>
                    <span className="text-right">Entry</span>
                    <span className="text-right">Exit</span>
                    <span className="text-right">P&amp;L</span>
                    <span className="text-right">Result</span>
                  </div>
                  <div className="divide-y divide-[#252345]">
                    {closed.map(trade => {
                      const pl    = trade.exitPrice != null ? calcPL(trade, trade.exitPrice) : 0;
                      const plPct = trade.exitPrice != null ? calcPLPct(trade, trade.exitPrice) : 0;
                      const won   = pl > 0;
                      const days  = trade.exitDate ? daysBetween(trade.entryDate, trade.exitDate) : 0;
                      const review = reviews[trade.id];

                      return (
                        <div key={trade.id} className="divide-y divide-[#252345]">
                          <div className="grid grid-cols-6 gap-2 px-5 py-4 items-center hover:bg-[#1A1838]/50 transition-colors">
                            <div className="col-span-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${trade.direction === "LONG" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                  {trade.direction}
                                </span>
                                <p className="text-sm font-bold">{trade.symbol}</p>
                              </div>
                              <p className="text-[10px] text-[#4B5675] mt-0.5">{trade.shares} shares · {days}d</p>
                              {trade.exitReason && trade.exitReason !== "manual" && (
                                <span className={`text-[9px] font-semibold ${trade.exitReason === "target_hit" ? "text-emerald-400" : "text-rose-400"}`}>
                                  {trade.exitReason === "target_hit" ? "🎯 Target hit" : "🛑 Stop hit"}
                                </span>
                              )}
                            </div>
                            <p className="text-right text-xs font-mono text-[#7B8DB4]">${trade.entryPrice.toFixed(2)}</p>
                            <p className="text-right text-xs font-mono text-[#7B8DB4]">${trade.exitPrice?.toFixed(2) ?? "—"}</p>
                            <div className="text-right">
                              <p className={`text-sm font-black font-mono ${plColor(pl)}`}>{fmtMoney(pl)}</p>
                              <p className={`text-[10px] font-mono ${plColor(pl)}`}>{fmtPct(plPct)}</p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1.5">
                              <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${won ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                {won ? "WIN" : "LOSS"}
                              </span>
                              <button type="button" onClick={() => fetchReview(trade)}
                                disabled={review === "loading"}
                                className="text-[9px] font-semibold text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors flex items-center gap-1">
                                {review === "loading" ? (
                                  <><svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>AI…</>
                                ) : (
                                  <>{review && typeof review === "object" ? "↺ Re-review" : "✦ AI Review"}</>
                                )}
                              </button>
                              <button type="button" onClick={() => deleteTrade(trade.id)}
                                className="text-[9px] text-[#4B5675] hover:text-rose-400 transition-colors">
                                delete
                              </button>
                            </div>
                          </div>

                          {/* AI Review panel */}
                          {review && review !== "loading" && (
                            <div className={`px-5 py-4 space-y-3 ${review === "error" ? "bg-rose-500/5" : "bg-violet-500/5"}`}>
                              {review === "error" ? (
                                <p className="text-xs text-rose-400">AI review failed — tap ✦ AI Review to retry.</p>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-violet-400 text-xs">✦</span>
                                    <p className="text-xs font-bold text-violet-300">Multi-Framework AI Review</p>
                                  </div>
                                  <p className="text-xs text-[#94A3B8] leading-relaxed">{review.summary}</p>

                                  {/* 5-framework breakdown */}
                                  {review.frameworks && (
                                    <div className="space-y-2">
                                      {([
                                        ["Market Structure", review.frameworks.ict,      review.frameworks.ict?.points],
                                        ["Wyckoff",          review.frameworks.wyckoff,  review.frameworks.wyckoff?.points],
                                        ["Risk Mgmt",        review.frameworks.risk,     review.frameworks.risk?.points],
                                      ] as [string, { verdict: string; points?: string[] } | undefined, string[] | undefined][]).map(([name, fw, pts]) => fw && (
                                        <div key={name} className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">{name}</p>
                                          <p className="text-[11px] text-[#94A3B8]">{fw.verdict}</p>
                                          {pts && pts.length > 0 && (
                                            <ul className="mt-1 space-y-0.5">
                                              {pts.map((p, i) => <li key={i} className="text-[10px] text-[#4B5675] flex gap-1.5"><span className="shrink-0">·</span>{p}</li>)}
                                            </ul>
                                          )}
                                        </div>
                                      ))}
                                      {review.frameworks.rMultiple && (
                                        <div className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <div className="flex items-center gap-2 mb-1">
                                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Van Tharp R-Multiple</p>
                                            <span className={`text-xs font-black font-mono ${plColor(parseFloat(review.frameworks.rMultiple.achieved) || 0)}`}>{review.frameworks.rMultiple.achieved}</span>
                                          </div>
                                          <p className="text-[11px] text-[#94A3B8]">{review.frameworks.rMultiple.verdict}</p>
                                        </div>
                                      )}
                                      {review.frameworks.douglas && (
                                        <div className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">Mark Douglas — Psychology</p>
                                          <p className="text-[11px] text-[#94A3B8]">{review.frameworks.douglas.verdict}</p>
                                          {review.frameworks.douglas.point && <p className="text-[10px] text-[#4B5675] mt-0.5">· {review.frameworks.douglas.point}</p>}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {review.strengths && review.strengths.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5">What you did right</p>
                                      <ul className="space-y-1">
                                        {review.strengths.map((s, i) => (
                                          <li key={i} className="text-xs text-[#94A3B8] flex gap-2">
                                            <span className="text-emerald-400 shrink-0">✓</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {review.mistakes && review.mistakes.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1.5">What went wrong</p>
                                      <ul className="space-y-1">
                                        {review.mistakes.map((m, i) => (
                                          <li key={i} className="text-xs text-[#94A3B8] flex gap-2">
                                            <span className="text-rose-400 shrink-0">✕</span>{m}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  <div className="border border-violet-500/20 bg-violet-500/10 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">Key lesson</p>
                                    <p className="text-xs text-[#F1F5F9] leading-relaxed">{review.lesson}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {showAdd && <AddTradeModal onAdd={addTrade} initial={addInitial} onClose={() => { setShowAdd(false); setAddInitial(undefined); }} />}
      {closing && (
        <CloseModal
          trade={closing}
          currentPrice={prices[closing.symbol] ?? null}
          onClose={() => setClosing(null)}
          onConfirm={(ep, reason) => closeTrade(closing.id, ep, reason)}
        />
      )}
    </div>
  );
}

export default function PaperPage() {
  return (
    <Suspense>
      <PaperPortfolio />
    </Suspense>
  );
}
