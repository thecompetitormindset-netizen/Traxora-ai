"use client";

import { useEffect, useState } from "react";

type AnalystRatings = {
  symbol:      string;
  consensus:   "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | null;
  meanRating:  number | null;
  numAnalysts: number | null;
  targetMean:  number | null;
  targetHigh:  number | null;
  targetLow:   number | null;
  breakdown: {
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
  } | null;
};

const CONSENSUS_STYLE: Record<string, string> = {
  "Strong Buy":  "bg-emerald-600 text-white border-emerald-500",
  "Buy":         "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "Hold":        "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "Sell":        "bg-rose-500/20 text-rose-300 border-rose-500/40",
  "Strong Sell": "bg-rose-700 text-white border-rose-600",
};

const BAR_COLORS = [
  { key: "strongBuy" as const,  label: "Strong Buy",  color: "bg-emerald-600" },
  { key: "buy"       as const,  label: "Buy",         color: "bg-emerald-400" },
  { key: "hold"      as const,  label: "Hold",        color: "bg-amber-400"   },
  { key: "sell"      as const,  label: "Sell",        color: "bg-rose-400"    },
  { key: "strongSell"as const,  label: "Strong Sell", color: "bg-rose-600"    },
];

export default function AnalystRatings({ symbol, currentPrice }: { symbol: string; currentPrice?: number | null }) {
  const [data,    setData]    = useState<AnalystRatings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true); setError(false); setData(null);
    fetch(`/api/market/analyst-ratings?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!d.error) setData(d); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="card-shine glass surface-sheen rounded-2xl border border-[#252345] p-5 skeleton-shimmer">
        <div className="h-3 bg-[#252345] rounded w-32 mb-4" />
        <div className="flex gap-4">
          <div className="h-10 bg-[#252345] rounded-xl w-28" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-[#252345] rounded w-full" />
            <div className="h-3 bg-[#252345] rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data || !data.consensus) return null;

  const total = data.breakdown
    ? Object.values(data.breakdown).reduce((s, v) => s + v, 0)
    : 0;

  // Price target upside
  const upside = currentPrice && data.targetMean
    ? ((data.targetMean - currentPrice) / currentPrice) * 100
    : null;

  // Target bar: position current price within low–high range
  const targetRange = data.targetHigh && data.targetLow ? data.targetHigh - data.targetLow : 0;
  const currentPct  = (currentPrice && targetRange > 0 && data.targetLow)
    ? Math.max(0, Math.min(100, ((currentPrice - data.targetLow) / targetRange) * 100))
    : null;
  const meanPct = (data.targetMean && targetRange > 0 && data.targetLow)
    ? Math.max(0, Math.min(100, ((data.targetMean - data.targetLow) / targetRange) * 100))
    : null;

  const consensusStyle = CONSENSUS_STYLE[data.consensus] ?? "bg-[#1A1838] text-[#F1F5F9] border-[#252345]";

  return (
    <div className="card-shine glass surface-sheen rounded-2xl border border-[#252345] p-5">
      <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-4">
        Wall Street · {data.numAnalysts ?? "—"} Analysts
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Left: consensus + breakdown */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-sm font-black px-4 py-2 rounded-xl border ${consensusStyle}`}>
              {data.consensus}
            </span>
            {data.meanRating !== null && (
              <div>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Mean Rating</p>
                <p className="text-sm font-bold text-[#F1F5F9]">
                  {data.meanRating.toFixed(1)}<span className="text-[10px] text-[#4B5675]"> / 5</span>
                </p>
              </div>
            )}
          </div>

          {data.breakdown && total > 0 && (
            <div className="space-y-1.5">
              {BAR_COLORS.map(({ key, label, color }) => {
                const count = data.breakdown![key];
                const pct   = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[9px] text-[#4B5675] w-16 shrink-0">{label}</span>
                    <div className="flex-1 h-2 bg-[#1A1838] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all duration-500`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[9px] font-mono text-[#7B8DB4] w-4 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: price targets */}
        {data.targetMean && data.targetHigh && data.targetLow && (
          <div>
            <div className="flex items-end gap-3 mb-4 flex-wrap">
              <div>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Price Target</p>
                <p className="text-2xl font-black font-mono text-[#F1F5F9]">
                  ${data.targetMean.toFixed(2)}
                </p>
              </div>
              {upside !== null && (
                <span className={`text-sm font-black font-mono mb-0.5 ${upside >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
                </span>
              )}
            </div>

            {/* Range bar */}
            <div className="relative mb-3">
              <div className="h-2 bg-[#1A1838] rounded-full relative overflow-visible">
                {/* Fill from low to high */}
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500/30 via-amber-400/30 to-emerald-500/30 rounded-full" />
                {/* Mean marker */}
                {meanPct !== null && (
                  <div className="range-pin-sm absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-violet-400 border-2 border-[#0A0815] rounded-full z-10"
                    style={{ "--pin-pct": `${meanPct}%` } as React.CSSProperties}
                    title={`Target: $${data.targetMean.toFixed(2)}`}
                  />
                )}
                {/* Current price marker */}
                {currentPct !== null && (
                  <div className="range-pin-sm absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#0A0815] rounded-full z-20"
                    style={{ "--pin-pct": `${currentPct}%` } as React.CSSProperties}
                    title={`Current: $${currentPrice?.toFixed(2)}`}
                  />
                )}
              </div>
            </div>

            {/* Low / High labels */}
            <div className="flex justify-between text-[9px] font-mono">
              <div>
                <p className="text-[#4B5675]">Low</p>
                <p className="text-rose-400 font-bold">${data.targetLow.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-[#4B5675]">Mean</p>
                <p className="text-violet-400 font-bold">${data.targetMean.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[#4B5675]">High</p>
                <p className="text-emerald-400 font-bold">${data.targetHigh.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-[9px] text-[#333368] mt-4">
        Source: Yahoo Finance · Not financial advice
      </p>
    </div>
  );
}
