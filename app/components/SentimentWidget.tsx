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
// Realistic speedometer: 240° sweep from 8 o'clock (−100) to 4 o'clock (+100).
// Score + label rendered inside the dial face.

function Gauge({ score }: { score: number }) {
  const c   = Math.max(-100, Math.min(100, score));
  const pct = (c + 100) / 200;

  const cx = 140, cy = 130;
  const Ra = 100;                              // arc radius
  const startDeg = 150;                        // 8 o'clock in SVG coords
  const sweepDeg = 240;
  const toRad = (d: number) => (d * Math.PI) / 180;

  function pt(p: number, r: number) {
    const deg = startDeg + p * sweepDeg;
    return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) };
  }

  function arcD(p0: number, p1: number, r: number): string {
    const s = pt(p0, r), e = pt(p1, r);
    const lg = (p1 - p0) * sweepDeg > 180 ? 1 : 0;
    return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  }

  // Needle
  const nRad = toRad(startDeg + pct * sweepDeg);
  const nx = cx + Ra * 0.82 * Math.cos(nRad);
  const ny = cy + Ra * 0.82 * Math.sin(nRad);
  const tx = cx - 16 * Math.cos(nRad);
  const ty = cy - 16 * Math.sin(nRad);

  const color = c >= 30 ? "#10B981" : c >= -30 ? "#F59E0B" : "#EF4444";
  const label = c >= 50 ? "STRONG BULLISH" : c >= 20 ? "BULLISH" : c >= -20 ? "NEUTRAL" : c >= -50 ? "BEARISH" : "STRONG BEARISH";

  const majorTicks = [
    { p: 0,    lbl: "−100" },
    { p: 0.25, lbl: "−50"  },
    { p: 0.5,  lbl: "0"    },
    { p: 0.75, lbl: "+50"  },
    { p: 1,    lbl: "+100" },
  ];
  const minorTicks = [0.125, 0.375, 0.625, 0.875];

  return (
    <div className="w-full flex flex-col items-center">
      <svg viewBox="0 0 280 210" width="100%" aria-hidden="true">

        {/* Outer bezel arc */}
        <path d={arcD(0, 1, Ra + 17)} fill="none" stroke="#151D2E" strokeWidth="8" strokeLinecap="butt" />

        {/* Inner dark dial face (clipping not needed — bezel arc covers the rim) */}
        <circle cx={cx} cy={cy} r={Ra - 2} fill="#070C16" />

        {/* Background arc groove */}
        <path d={arcD(0, 1, Ra)} fill="none" stroke="#09101E" strokeWidth="20" strokeLinecap="butt" />

        {/* Zone arcs */}
        <path d={arcD(0,    0.2,  Ra)} fill="none" stroke="#EF4444" strokeWidth="18" strokeOpacity="0.9"  strokeLinecap="butt" />
        <path d={arcD(0.2,  0.4,  Ra)} fill="none" stroke="#F97316" strokeWidth="18" strokeOpacity="0.78" strokeLinecap="butt" />
        <path d={arcD(0.4,  0.6,  Ra)} fill="none" stroke="#EAB308" strokeWidth="18" strokeOpacity="0.72" strokeLinecap="butt" />
        <path d={arcD(0.6,  0.8,  Ra)} fill="none" stroke="#22C55E" strokeWidth="18" strokeOpacity="0.78" strokeLinecap="butt" />
        <path d={arcD(0.8,  1,    Ra)} fill="none" stroke="#10B981" strokeWidth="18" strokeOpacity="0.9"  strokeLinecap="butt" />

        {/* Zone dividers */}
        {[0.2, 0.4, 0.6, 0.8].map((p, i) => {
          const a = pt(p, Ra - 9), b = pt(p, Ra + 9);
          return <line key={i} x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={b.x.toFixed(1)} y2={b.y.toFixed(1)} stroke="#060A14" strokeWidth="2.5" />;
        })}

        {/* Major tick marks + labels */}
        {majorTicks.map(({ p, lbl }, i) => {
          const a = pt(p, Ra - 22), b = pt(p, Ra + 10), lb = pt(p, Ra + 28);
          return (
            <g key={i}>
              <line x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={b.x.toFixed(1)} y2={b.y.toFixed(1)} stroke="#9DB0CC" strokeWidth="2.5" strokeLinecap="round" />
              <text x={lb.x.toFixed(1)} y={lb.y.toFixed(1)} fontSize="8.5" fill="#4E6280" fontFamily="monospace" textAnchor="middle" dominantBaseline="central">{lbl}</text>
            </g>
          );
        })}

        {/* Minor tick marks */}
        {minorTicks.map((p, i) => {
          const a = pt(p, Ra - 12), b = pt(p, Ra + 5);
          return <line key={i} x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={b.x.toFixed(1)} y2={b.y.toFixed(1)} stroke="#2A3A52" strokeWidth="1.5" strokeLinecap="round" />;
        })}

        {/* Needle */}
        <line x1={tx.toFixed(1)} y1={ty.toFixed(1)} x2={nx.toFixed(1)} y2={ny.toFixed(1)}
              stroke={color} strokeWidth="2.5" strokeLinecap="round" />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="18" fill="#060A14" stroke="#1C2A45" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="10" fill={color} fillOpacity="0.22" />
        <circle cx={cx} cy={cy} r="6"  fill={color} />
        <circle cx={cx} cy={cy} r="3"  fill="#060A14" />

        {/* Score + label inside dial */}
        <text x={cx} y={cy + 42} textAnchor="middle" fontSize="30" fontWeight="900" fontFamily="monospace" fill={color}>
          {c > 0 ? "+" : ""}{c}
        </text>
        <text x={cx} y={cy + 60} textAnchor="middle" fontSize="7.5" fontFamily="monospace" fill="#3E5270" letterSpacing="1.5">
          {label}
        </text>
      </svg>
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
