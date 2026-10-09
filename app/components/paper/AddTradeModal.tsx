"use client";

import { useState } from "react";
import type { PaperTrade, Direction, AddTradeInitial } from "@/app/lib/paperTrades";
import { Glyph } from "../Icon";

type TradeScore = {
  overall: number;
  trend:   { score: number; note: string };
  entry:   { score: number; note: string };
  risk:    { score: number; note: string };
  setup:   { score: number; note: string };
  verdict: string;
  warning: string | null;
};

function scoreColor(n: number) {
  return n >= 7 ? "text-emerald-400" : n >= 5 ? "text-amber-400" : "text-rose-400";
}

function scoreBg(n: number) {
  return n >= 7
    ? "bg-emerald-500/10 border-emerald-500/20"
    : n >= 5
      ? "bg-amber-500/10 border-amber-500/20"
      : "bg-rose-500/10 border-rose-500/20";
}

export default function AddTradeModal({
  onAdd, onClose, initial,
}: {
  onAdd:    (t: PaperTrade) => void;
  onClose:  () => void;
  initial?: AddTradeInitial;
}) {
  const [symbol,     setSymbol]     = useState(initial?.symbol ?? "");
  const [direction,  setDirection]  = useState<Direction>(initial?.direction ?? "LONG");
  const [entryPrice, setEntryPrice] = useState(initial?.entryPrice ?? "");
  const [shares,     setShares]     = useState("");
  const [stopLoss,   setStopLoss]   = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [notes,      setNotes]      = useState("");
  const [error,      setError]      = useState("");
  const [score,      setScore]      = useState<TradeScore | "loading" | "error" | null>(null);

  async function scoreSetup() {
    const ep = parseFloat(entryPrice);
    if (!symbol.trim() || !ep) return;
    setScore("loading");
    try {
      let currentPrice: number | null = null;
      try {
        const q  = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`, { cache: "no-store" });
        const qd = await q.json();
        if (typeof qd.price === "number") currentPrice = qd.price;
      } catch { /* ignore */ }

      const res  = await fetch("/api/ai/trade-score", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:      symbol.trim().toUpperCase(),
          direction,
          entryPrice:  ep,
          stopLoss:    stopLoss   ? parseFloat(stopLoss)   : null,
          takeProfit:  takeProfit ? parseFloat(takeProfit) : null,
          currentPrice,
          notes,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScore(data);
    } catch {
      setScore("error");
    }
  }

  function submit() {
    const sym = symbol.trim().toUpperCase();
    const ep  = parseFloat(entryPrice);
    const sh  = parseFloat(shares);
    if (!sym)          return setError("Enter a symbol");
    if (!ep || ep <= 0) return setError("Enter a valid entry price");
    if (!sh || sh <= 0) return setError("Enter a valid number of shares");

    const trade: PaperTrade = {
      id:         crypto.randomUUID(),
      symbol:     sym,
      direction,
      entryPrice: ep,
      shares:     sh,
      stopLoss:   stopLoss   ? parseFloat(stopLoss)   : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      entryDate:  new Date().toISOString(),
      notes,
      status:     "OPEN",
      exitPrice:  null,
      exitDate:   null,
      exitReason: null,
    };
    onAdd(trade);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#13112A] border border-[#252345] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#252345]">
          <h2 className="text-base font-bold">Log a Trade</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Symbol */}
          <div>
            <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Symbol</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL, TSLA, SPY…"
              className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:border-emerald-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]"
            />
          </div>

          {/* Direction */}
          <div>
            <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              {(["LONG", "SHORT"] as Direction[]).map(d => (
                <button key={d} type="button" onClick={() => setDirection(d)}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                    direction === d
                      ? d === "LONG"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-rose-500/15 border-rose-500/40 text-rose-400"
                      : "border-[#252345] text-[#4B5675] hover:border-[#333368]"
                  }`}>
                  {d === "LONG" ? "▲ LONG" : "▼ SHORT"}
                </button>
              ))}
            </div>
          </div>

          {/* Entry + Shares */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Entry Price</label>
              <input type="number" min="0" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]" />
            </div>
            <div>
              <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Shares</label>
              <input type="number" min="0" step="0.01" value={shares} onChange={e => setShares(e.target.value)}
                placeholder="0"
                className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]" />
            </div>
          </div>

          {/* SL + TP */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Stop Loss <span className="text-[#4B5675]">(optional)</span></label>
              <input type="number" min="0" step="0.01" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono focus:border-rose-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]" />
            </div>
            <div>
              <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Take Profit <span className="text-[#4B5675]">(optional)</span></label>
              <input type="number" min="0" step="0.01" value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Notes <span className="text-[#4B5675]">(optional)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Morning brief signal, Order Block entry, liquidity sweep…"
              className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors placeholder:text-[#4B5675]" />
          </div>

          {/* Score setup */}
          {parseFloat(entryPrice) > 0 && (
            <div>
              <button type="button" onClick={scoreSetup} disabled={score === "loading"}
                className="w-full py-2 rounded-xl text-xs font-bold border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {score === "loading" ? (
                  <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Scoring setup…</>
                ) : <>✦ Score this setup</>}
              </button>
              {score === "error" && <p className="text-[11px] text-rose-400 mt-1 text-center">Score failed — try again</p>}
              {score && typeof score === "object" && (
                <div className={`mt-3 rounded-xl border px-4 py-3 space-y-3 ${scoreBg(score.overall)}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#F1F5F9]">Setup Score</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-black font-mono ${scoreColor(score.overall)}`}>
                        {score.overall}<span className="text-sm text-[#4B5675]">/10</span>
                      </span>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${scoreBg(score.overall)} ${scoreColor(score.overall)}`}>{score.verdict}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {([["Trend", score.trend], ["Entry", score.entry], ["Risk", score.risk], ["Setup", score.setup]] as [string, { score: number; note: string }][]).map(([label, s]) => (
                      <div key={label} className="flex items-start gap-2">
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                          <span className={`text-xs font-black ${scoreColor(s.score)}`}>{s.score}</span>
                          <span className="text-[10px] text-[#4B5675] font-medium">{label}</span>
                        </div>
                        <p className="text-[10px] text-[#7B8DB4] leading-relaxed">{s.note}</p>
                      </div>
                    ))}
                  </div>
                  {score.warning && <p className="text-[10px] text-amber-400 flex gap-1.5"><span><Glyph e="⚠" /></span>{score.warning}</p>}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button type="button" onClick={submit}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-3 rounded-xl text-sm font-bold">
            Log Trade →
          </button>
        </div>
      </div>
    </div>
  );
}
