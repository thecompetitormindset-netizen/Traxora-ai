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

// ── Gauge ─────────────────────────────────────────────────────────────────────
// Responsive semicircle speedometer. Pivot at bottom-center.
// Arc sweeps clockwise from left (−100) → top (0) → right (+100).

function Gauge({ score }: { score: number }) {
  const c   = Math.max(-100, Math.min(100, score));
  const pct = (c + 100) / 200;
  const cx = 110, cy = 114, R = 94;

  function arc(s: number, e: number): string {
    const sx = cx + R * Math.cos(s), sy = cy + R * Math.sin(s);
    const ex = cx + R * Math.cos(e), ey = cy + R * Math.sin(e);
    const lg = Math.abs(e - s) > Math.PI ? 1 : 0;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R} ${R} 0 ${lg} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }

  const a  = Math.PI + pct * Math.PI;
  const nx = cx + R * 0.80 * Math.cos(a);
  const ny = cy + R * 0.80 * Math.sin(a);

  const color      = c >= 30 ? "#10B981" : c >= -30 ? "#F59E0B" : "#F43F5E";
  const scoreClass = c >= 30 ? "text-emerald-400" : c >= -30 ? "text-amber-400" : "text-rose-400";
  const label      = c >= 50 ? "Strong Bullish" : c >= 20 ? "Bullish" : c >= -20 ? "Neutral" : c >= -50 ? "Bearish" : "Strong Bearish";

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="0 0 220 120" width="100%" aria-hidden="true">
        {/* Background track */}
        <path d={arc(Math.PI, 2 * Math.PI)} fill="none" stroke="#0D1424" strokeWidth="22" strokeLinecap="round" />
        {/* 5-zone coloring: Strong Bearish → Bearish → Neutral → Bullish → Strong Bullish */}
        <path d={arc(Math.PI,       Math.PI * 1.2)} fill="none" stroke="#F43F5E" strokeWidth="20" strokeOpacity="0.65" strokeLinecap="round" />
        <path d={arc(Math.PI * 1.2, Math.PI * 1.4)} fill="none" stroke="#F97316" strokeWidth="20" strokeOpacity="0.5"  strokeLinecap="round" />
        <path d={arc(Math.PI * 1.4, Math.PI * 1.6)} fill="none" stroke="#F59E0B" strokeWidth="20" strokeOpacity="0.45" strokeLinecap="round" />
        <path d={arc(Math.PI * 1.6, Math.PI * 1.8)} fill="none" stroke="#22C55E" strokeWidth="20" strokeOpacity="0.5"  strokeLinecap="round" />
        <path d={arc(Math.PI * 1.8, 2 * Math.PI)}   fill="none" stroke="#10B981" strokeWidth="20" strokeOpacity="0.65" strokeLinecap="round" />
        {/* Axis labels */}
        <text x="12"  y="118" fontSize="8.5" fill="#3B4D6A" fontFamily="monospace">−100</text>
        <text x="110" y="26"  fontSize="8.5" fill="#3B4D6A" fontFamily="monospace" textAnchor="middle">0</text>
        <text x="208" y="118" fontSize="8.5" fill="#3B4D6A" fontFamily="monospace" textAnchor="end">+100</text>
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)}
              stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Pivot: glow ring + solid dot + dark center */}
        <circle cx={cx} cy={cy} r="11"  fill={color} fillOpacity="0.15" />
        <circle cx={cx} cy={cy} r="6.5" fill={color} />
        <circle cx={cx} cy={cy} r="3"   fill="#060A14" />
      </svg>

      <p className={`text-4xl font-black font-mono tabular-nums -mt-3 ${scoreClass}`}>
        {c > 0 ? "+" : ""}{c}
      </p>
      <p className="text-xs font-semibold text-[#7B8DB4] mt-1 tracking-wide">{label}</p>
    </div>
  );
}

// ── Bar ───────────────────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#4B5675]">Market Sentiment</p>
          <p className="text-[10px] text-[#2D3A50] mt-0.5">VIX · Trend · News composite</p>
        </div>
        {!loading && data?.regime && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${regimeClass}`}>
            {data.regime}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="#818CF8" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : !data ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-[#4B5675] text-sm">Unavailable</p>
        </div>
      ) : (
        <>
          {/* Gauge */}
          <Gauge score={data.overallScore ?? 0} />

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
