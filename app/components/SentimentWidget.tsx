"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SentimentData = {
  overallScore: number;
  regime:       string;
  spyChange:    number | null;
  qqqChange:    number | null;
  breakdown: {
    vixInput:      number;
    momentumInput: number;
    newsInput:     number;
    weights:       { vix: number; momentum: number; news: number };
  } | null;
};

// ── Horizontal Score Bar ───────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const c   = Math.max(-100, Math.min(100, score));
  const pct = (c + 100) / 200; // 0 → 1

  const color      = c >= 30 ? "#10B981" : c >= -30 ? "#F59E0B" : "#EF4444";
  const scoreClass = c >= 30 ? "text-emerald-400" : c >= -30 ? "text-amber-400" : "text-rose-400";
  const label      = c >= 50 ? "Strong Bullish" : c >= 20 ? "Bullish" : c >= -20 ? "Neutral" : c >= -50 ? "Bearish" : "Strong Bearish";

  return (
    <div className="w-full py-1">
      <div className="flex items-baseline justify-between mb-3">
        <span className={`text-4xl font-black font-mono tabular-nums leading-none ${scoreClass}`}>
          {c > 0 ? "+" : ""}{c}
        </span>
        <span className="text-[11px] font-semibold text-[#7B8DB4] tracking-wide">{label}</span>
      </div>

      {/* Track: −100 ··· 0 ··· +100 */}
      <div className="relative h-4 bg-[#080E1B] rounded-full overflow-hidden border border-[#1C2333]">
        {/* Gradient backdrop */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: "linear-gradient(90deg,#EF4444 0%,#F97316 28%,#F59E0B 50%,#22C55E 72%,#10B981 100%)", opacity: 0.18 }}
        />
        {/* Zero tick */}
        <div className="absolute top-0 bottom-0 w-px bg-[#232F46]" style={{ left: "50%" }} />
        {/* Needle */}
        <div
          className="absolute top-1 bottom-1 w-2 rounded-full"
          style={{ left: `calc(${pct * 100}% - 4px)`, background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-[8px] text-[#2D3A50] font-mono mt-1 px-0.5">
        <span>−100</span><span>−50</span><span>0</span><span>+50</span><span>+100</span>
      </div>
    </div>
  );
}

// ── Bar (breakdown) ────────────────────────────────────────────────────────────

function Bar({ label, weight, value, accent }: { label: string; weight: number; value: number; accent: string }) {
  const pct       = Math.max(0, Math.min(100, value));
  const fillClass = pct >= 60 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  const numClass  = pct >= 60 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex-1 min-w-0 bg-[#060A14] rounded-xl p-2.5 border border-[#1C2333]">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[9px] font-black uppercase tracking-widest ${accent}`}>{label}</span>
        <span className="text-[9px] text-[#4B5675] font-mono">{weight}%</span>
      </div>
      <div className="h-1.5 bg-[#1C2333] rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full transition-all duration-700 ${fillClass}`}
             style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-sm font-black font-mono tabular-nums ${numClass}`}>{pct}</p>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function SentimentWidget() {
  const [data,    setData]    = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sentiment")
      .then(r => r.json())
      .then(d => setData(d?.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const regimeClass =
    data?.regime === "Risk-On"  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    data?.regime === "Risk-Off" ? "bg-rose-500/10    text-rose-400    border-rose-500/20"    :
                                  "bg-amber-500/10   text-amber-400   border-amber-500/20";

  return (
    <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#4B5675]">Market Sentiment</p>
          <p className="text-[10px] text-[#2D3A50] mt-0.5">VIX · Momentum · News composite · math-driven</p>
        </div>
        {!loading && data?.regime && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${regimeClass}`}>
            {data.regime}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="#818CF8" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : !data ? (
        <div className="h-24 flex items-center justify-center">
          <p className="text-[#4B5675] text-sm">Unavailable</p>
        </div>
      ) : (
        <>
          {/* Horizontal score bar */}
          <ScoreBar score={data.overallScore ?? 0} />

          {/* Math breakdown */}
          {data.breakdown && (
            <div className="mt-4 flex gap-2">
              <Bar label="VIX"   weight={data.breakdown.weights.vix}      value={data.breakdown.vixInput}      accent="text-indigo-400" />
              <Bar label="Trend" weight={data.breakdown.weights.momentum}  value={data.breakdown.momentumInput} accent="text-violet-400" />
              <Bar label="News"  weight={data.breakdown.weights.news}      value={data.breakdown.newsInput}     accent="text-sky-400"    />
            </div>
          )}

          {/* SPY / QQQ + link */}
          <div className="mt-3 flex items-center gap-2">
            {[
              { label: "SPY", chg: data.spyChange },
              { label: "QQQ", chg: data.qqqChange },
            ].map(({ label, chg }) => (
              <div key={label} className="flex items-center gap-1.5 bg-[#060A14] border border-[#1C2333] rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-[#4B5675] font-mono">{label}</span>
                <span className={`text-[11px] font-black font-mono tabular-nums ${
                  chg == null ? "text-[#4B5675]" : chg >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                </span>
              </div>
            ))}
            <Link href="/market-sentiment"
                  className="ml-auto text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
              Full Pulse
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
              </svg>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
