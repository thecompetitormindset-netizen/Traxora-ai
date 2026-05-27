"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Breakdown = {
  vixInput:      number;
  momentumInput: number;
  newsInput:     number;
  weights:       { vix: number; momentum: number; news: number };
};

type SentimentData = {
  overallScore: number;   // -100 to +100
  fearGreed:    number;   // 0-100
  label:        string;
  regime:       string;
  vix:          number | null;
  vixChange:    number | null;
  spyChange:    number | null;
  qqqChange:    number | null;
  breakdown:    Breakdown | null;
};

// ── Semicircle gauge — same math as the Pulse page ───────────────────────────

function SentimentGauge({ score }: { score: number }) {
  const clamp  = Math.max(-100, Math.min(100, score));
  const pct    = (clamp + 100) / 200;
  const R = 64, cx = 80, cy = 80;
  const a = Math.PI + pct * Math.PI; // π → 0 (left → right)
  const needleX = cx + R * Math.cos(a);
  const needleY = cy + R * Math.sin(a);

  function arc(s: number, e: number, stroke: string, w = 11) {
    const sx = cx + R * Math.cos(s), sy = cy + R * Math.sin(s);
    const ex = cx + R * Math.cos(e), ey = cy + R * Math.sin(e);
    const large = Math.abs(e - s) > Math.PI ? 1 : 0;
    return <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`}
                 fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" />;
  }

  const needleColor = clamp >= 30 ? "#10B981" : clamp >= -30 ? "#F59E0B" : "#F43F5E";
  const scoreClass  = clamp >= 30 ? "text-emerald-400" : clamp >= -30 ? "text-amber-400" : "text-rose-400";
  const label = clamp >= 50  ? "Strong Bullish"
              : clamp >= 20  ? "Bullish"
              : clamp >= -20 ? "Neutral"
              : clamp >= -50 ? "Bearish"
              : "Strong Bearish";

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="88" viewBox="0 0 160 88">
        {arc(Math.PI, 0,             "#1C2333", 13)}
        {arc(Math.PI, Math.PI * 1.5, "#F43F5E44", 11)}
        {arc(Math.PI * 1.4, Math.PI * 1.6, "#F59E0B33", 11)}
        {arc(Math.PI * 1.5, 0,       "#10B98144", 11)}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY}
              stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={needleColor} />
      </svg>
      <p className={`text-3xl font-black font-mono tabular-nums -mt-3 ${scoreClass}`}>
        {clamp > 0 ? "+" : ""}{clamp}
      </p>
      <p className="text-[11px] text-[#7B8DB4] mt-0.5">{label}</p>
    </div>
  );
}

// ── Component input bar ───────────────────────────────────────────────────────

function ComponentBar({
  label, weight, value, color,
}: {
  label: string; weight: number; value: number; color: string;
}) {
  const pct      = Math.max(0, Math.min(100, value));
  const barClass  = pct >= 60 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  const textClass = pct >= 60 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
        <span className="text-[9px] text-[#4B5675] font-mono">{weight}%</span>
      </div>
      <div className="h-1.5 bg-[#1C2333] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barClass}`}
             style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[10px] font-black font-mono mt-0.5 tabular-nums ${textClass}`}>
        {pct}
      </p>
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

  const regimeColor =
    data?.regime === "Risk-On"  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    data?.regime === "Risk-Off" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                  "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675]">Market Sentiment</p>
          <p className="text-[10px] text-[#2D3A50] mt-0.5">
            VIX (60%) + Momentum (30%) + News (10%)
          </p>
        </div>
        {!loading && data?.regime && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${regimeColor}`}>
            {data.regime}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-36 flex items-center justify-center">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="#818CF8" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : !data ? (
        <div className="h-36 flex items-center justify-center">
          <p className="text-[#4B5675] text-sm">Sentiment unavailable</p>
        </div>
      ) : (
        <>
          {/* Gauge */}
          <SentimentGauge score={data.overallScore ?? 0} />

          {/* Component breakdown — the actual math */}
          {data.breakdown && (
            <div className="mt-4 flex gap-3">
              <ComponentBar
                label="VIX"
                weight={data.breakdown.weights.vix}
                value={data.breakdown.vixInput}
                color="text-indigo-400"
              />
              <ComponentBar
                label="Trend"
                weight={data.breakdown.weights.momentum}
                value={data.breakdown.momentumInput}
                color="text-violet-400"
              />
              <ComponentBar
                label="News"
                weight={data.breakdown.weights.news}
                value={data.breakdown.newsInput}
                color="text-sky-400"
              />
            </div>
          )}

          {/* SPY + QQQ quick stats */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: "SPY", chg: data.spyChange },
              { label: "QQQ", chg: data.qqqChange },
            ].map(({ label, chg }) => (
              <div key={label} className="bg-[#060A14]/60 border border-[#1C2333] rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#4B5675] font-mono">{label}</span>
                {chg != null ? (
                  <span className={`text-[11px] font-black font-mono tabular-nums ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-[#4B5675] text-xs">—</span>
                )}
              </div>
            ))}
          </div>

          {/* Link to Pulse */}
          <Link href="/market-sentiment"
                className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-semibold">
            Full Pulse analysis
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
            </svg>
          </Link>
        </>
      )}
    </div>
  );
}
