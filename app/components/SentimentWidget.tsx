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
// Vertical thermometer: shaft fills bottom→top, pointer arrow, glowing bulb.

function Gauge({ score }: { score: number }) {
  const c   = Math.max(-100, Math.min(100, score));
  const pct = (c + 100) / 200;

  // Shaft geometry
  const sX = 36, sY = 10, sW = 22, sH = 186;
  // Bulb
  const bCX = sX + sW / 2, bCY = sY + sH + 20, bR = 17;
  // Fill: rises from bottom of shaft to current pct
  const fillY = sY + (1 - pct) * sH;
  const fillH = pct * sH;

  const color      = c >= 30 ? "#10B981" : c >= -30 ? "#F59E0B" : "#EF4444";
  const scoreClass = c >= 30 ? "text-emerald-400" : c >= -30 ? "text-amber-400" : "text-rose-400";
  const label      = c >= 50 ? "Strong Bullish" : c >= 20 ? "Bullish" : c >= -20 ? "Neutral" : c >= -50 ? "Bearish" : "Strong Bearish";

  const ticks = [
    { p: 1,    lbl: "+100" },
    { p: 0.75, lbl: "+50"  },
    { p: 0.5,  lbl: "0"    },
    { p: 0.25, lbl: "−50"  },
    { p: 0,    lbl: "−100" },
  ].map(t => ({ ...t, y: sY + (1 - t.p) * sH }));

  return (
    <div className="flex items-center gap-5 justify-center w-full py-2">
      <svg viewBox="0 0 90 238" width="72" aria-hidden="true">
        <defs>
          {/* Gradient maps to shaft userSpace coords so fill level doesn't shift the colors */}
          <linearGradient id="tg" x1="0" y1={sY + sH} x2="0" y2={sY} gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#EF4444" />
            <stop offset="28%"  stopColor="#F97316" />
            <stop offset="50%"  stopColor="#F59E0B" />
            <stop offset="72%"  stopColor="#22C55E" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <clipPath id="tclip">
            <rect x={sX} y={sY} width={sW} height={sH} rx={sW / 2} />
          </clipPath>
        </defs>

        {/* Shaft background */}
        <rect x={sX} y={sY} width={sW} height={sH} rx={sW / 2} fill="#080E1B" />

        {/* Fill (clipped to rounded shaft) */}
        <g clipPath="url(#tclip)">
          {/* Dim ghost of full gradient for context */}
          <rect x={sX} y={sY} width={sW} height={sH} fill="url(#tg)" opacity="0.14" />
          {/* Active fill level */}
          {fillH > 0 && (
            <rect x={sX} y={fillY} width={sW} height={fillH} fill="url(#tg)" />
          )}
        </g>

        {/* Centre zero marker */}
        <line x1={sX + 4} y1={sY + sH / 2} x2={sX + sW - 4} y2={sY + sH / 2}
              stroke="#232F46" strokeWidth="1.5" strokeDasharray="3 2" />

        {/* Tick marks + scale labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={sX - 6} y1={t.y} x2={sX - 1} y2={t.y}
                  stroke="#253145" strokeWidth="1.5" strokeLinecap="round" />
            <text x={sX - 9} y={t.y} fontSize="8" fill="#3A4F6A"
                  fontFamily="monospace" textAnchor="end" dominantBaseline="central">
              {t.lbl}
            </text>
          </g>
        ))}

        {/* Pointer arrow at fill level */}
        <polygon
          points={`${sX + sW + 1},${fillY - 5} ${sX + sW + 11},${fillY} ${sX + sW + 1},${fillY + 5}`}
          fill={color}
        />

        {/* Bulb: glow ring + solid fill + dark centre */}
        <circle cx={bCX} cy={bCY} r={bR + 6} fill={color} fillOpacity="0.12" />
        <circle cx={bCX} cy={bCY} r={bR}     fill={color} />
        <circle cx={bCX} cy={bCY} r={bR * 0.38} fill="#060A14" />
      </svg>

      {/* Score + label alongside */}
      <div className="flex flex-col">
        <p className={`text-4xl font-black font-mono tabular-nums leading-none ${scoreClass}`}>
          {c > 0 ? "+" : ""}{c}
        </p>
        <p className="text-[11px] font-semibold text-[#7B8DB4] mt-2 tracking-wide">{label}</p>
      </div>
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
