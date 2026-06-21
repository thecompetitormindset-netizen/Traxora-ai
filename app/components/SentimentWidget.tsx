"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchSentiment } from "../lib/sentimentCache";

type SentimentData = {
  overallScore: number;
  fearGreed:    number;
  regime:       string;
  vix:          number | null;
  vixChange:    number | null;
  spyChange:    number | null;
  qqqChange:    number | null;
  breakdown: {
    vixInput:      number;
    momentumInput: number;
    newsInput:     number;
    weights:       { vix: number; momentum: number; news: number };
  } | null;
};

const R  = 72;
const CX = 110;
const CY = 94;

// Hairline track — full semicircle
const FULL_ARC   = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
// Left half (bearish fill): left endpoint → top center
const LEFT_HALF  = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX} ${CY - R}`;
// Right half (bullish fill): top center → right endpoint
const RIGHT_HALF = `M ${CX} ${CY - R} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
const HALF_ARC_LEN = Math.PI * R / 2; // ≈ 113 SVG units

// External tick marks — small radial lines outside the arc, no mask needed
const GAUGE_TICKS = [-100, -50, 0, 50, 100].map((v) => {
  const n  = (v + 100) / 200;
  const a  = Math.PI * n;
  const ca = Math.cos(a), sa = Math.sin(a);
  // Tick lines start just outside arc outer edge (R+2) and extend to R+11
  const r1 = R + 3, r2 = R + 11, rl = R + 23;
  let lx = CX - rl * ca;
  let ly = CY - rl * sa;
  let anchor: "start" | "middle" | "end" = "middle";
  if (v === -100) { ly += 10; anchor = "middle"; }
  else if (v === 100) { ly += 10; anchor = "middle"; }
  else if (v < 0) anchor = "end";
  else if (v > 0) anchor = "start";
  return {
    v, label: v > 0 ? `+${v}` : `${v}`,
    x1: CX - r1 * ca, y1: CY - r1 * sa,
    x2: CX - r2 * ca, y2: CY - r2 * sa,
    lx, ly, anchor,
  };
});

function useIsDark() {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const sync = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    sync();
    window.addEventListener("theme-changed", sync);
    return () => window.removeEventListener("theme-changed", sync);
  }, []);
  return isDark;
}

// ── Animated arc gauge ────────────────────────────────────────────────────────

function ArcGauge({ score, isDark }: { score: number; isDark: boolean }) {
  const arcFillRef    = useRef<SVGPathElement>(null);
  const needleLineRef = useRef<SVGLineElement>(null);
  const needleTipRef  = useRef<SVGCircleElement>(null);
  const scoreTextRef  = useRef<SVGTextElement>(null);

  const norm      = Math.max(0, Math.min(1, (score + 100) / 200));
  const fillColor = score >= 10 ? "#10B981" : score <= -10 ? "#EF4444" : "#818CF8";
  const label     = score >= 50  ? "STRONG BULLISH"
                  : score >= 20  ? "BULLISH"
                  : score >= -20 ? "NEUTRAL"
                  : score >= -50 ? "BEARISH"
                                 : "STRONG BEARISH";

  useEffect(() => {
    const arcEl   = arcFillRef.current;
    const lineEl  = needleLineRef.current;
    const tipEl   = needleTipRef.current;
    const scoreEl = scoreTextRef.current;
    if (!arcEl) return;

    const arcLen    = arcEl.getTotalLength();
    const activeLen = norm * arcLen;

    // Reset to empty
    arcEl.style.strokeDasharray  = String(arcLen);
    arcEl.style.strokeDashoffset = String(arcLen);
    if (lineEl) { lineEl.setAttribute("x1", String(CX - R)); lineEl.setAttribute("y1", String(CY)); }
    if (tipEl)  { tipEl.setAttribute("cx",  String(CX - R)); tipEl.setAttribute("cy",  String(CY)); }
    if (scoreEl) scoreEl.textContent = "0";

    const duration = 1300;
    let start = 0, rafId: number;

    function step(ts: number) {
      if (!arcEl) return;
      if (!start) start = ts;
      const t     = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      // Fill sweeps left → current position
      arcEl.style.strokeDashoffset = String(arcLen - activeLen * eased);

      // Needle tracks the fill tip exactly: same angle, same frame
      const a  = Math.PI * norm * eased;
      const tx = CX - R * Math.cos(a);
      const ty = CY - R * Math.sin(a);
      if (lineEl) { lineEl.setAttribute("x1", String(tx)); lineEl.setAttribute("y1", String(ty)); }
      if (tipEl)  { tipEl.setAttribute("cx",  String(tx)); tipEl.setAttribute("cy",  String(ty)); }

      if (scoreEl) {
        const v = Math.round(eased * score);
        scoreEl.textContent = v > 0 ? `+${v}` : String(v);
      }

      if (t < 1) rafId = requestAnimationFrame(step);
    }

    const delay = setTimeout(() => { rafId = requestAnimationFrame(step); }, 60);
    return () => { clearTimeout(delay); cancelAnimationFrame(rafId); };
  }, [score, norm]);

  const trackColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
  const tickColor  = isDark ? "#2B3650"                : "#94A3B8";
  const textMid    = isDark ? "#4B5675"                : "#64748B";
  const scoreColor = isDark ? "#E2E8F0"                : "#0F172A";
  const bgFill     = isDark ? "#13112A"                : "#FFFFFF";

  return (
    <div className="flex flex-col items-center select-none">
      <svg viewBox="-10 -10 240 146" className="w-full max-w-[320px]">
        <defs>
          <filter id="sg-fill-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={isDark ? "3" : "1.5"} result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Tick marks */}
        {GAUGE_TICKS.map((t) => (
          <line key={`tick-${t.v}`}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={tickColor} strokeWidth={t.v === 0 ? 1.5 : 1} strokeLinecap="round"
          />
        ))}

        {/* Tick labels */}
        {GAUGE_TICKS.map((t) => (
          <text key={`lbl-${t.v}`}
            x={t.lx} y={t.ly} fontSize="7.5" fill={tickColor}
            textAnchor={t.anchor} fontFamily="ui-monospace,monospace"
          >{t.label}</text>
        ))}

        {/* Hairline track */}
        <path d={FULL_ARC} fill="none"
          stroke={trackColor} strokeWidth={2} strokeLinecap="round" />

        {/* Speedometer fill — sweeps left → score position */}
        <path ref={arcFillRef} d={FULL_ARC} fill="none"
          stroke={fillColor} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={Math.PI * R} strokeDashoffset={Math.PI * R}
          filter="url(#sg-fill-glow)" />

        {/* Needle arm */}
        <line ref={needleLineRef}
          x1={CX - R} y1={CY} x2={CX} y2={CY}
          stroke={fillColor} strokeWidth={1} strokeLinecap="round" opacity={0.5} />

        {/* Pivot */}
        <circle cx={CX} cy={CY} r={3} fill={fillColor} opacity={0.8} />

        {/* Tip — rides the fill's leading edge */}
        <circle ref={needleTipRef}
          cx={CX - R} cy={CY} r={5}
          fill={bgFill} stroke={fillColor} strokeWidth={2} />

        {/* Score */}
        <text ref={scoreTextRef}
          x={CX} y={CY - 16} fontSize="30" fontWeight="800"
          fill={scoreColor} textAnchor="middle" fontFamily="ui-monospace,monospace"
        >0</text>

        {/* Label */}
        <text x={CX} y={CY + 5} fontSize="8.5" fill={textMid}
          textAnchor="middle" fontFamily="system-ui,sans-serif" letterSpacing="0.07em"
        >{label}</text>
      </svg>
    </div>
  );
}

// ── Sub-metric card with animated bar fill ────────────────────────────────────

function MetricCard({
  label, sublabel, weight, value, accent, delay = 0,
}: {
  label: string; sublabel: string; weight: number;
  value: number; accent: string; delay?: number;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const pct      = Math.max(0, Math.min(100, value));
  const barColor = pct >= 60 ? "#10B981" : pct >= 40 ? "#F59E0B" : "#EF4444";
  const valClass = pct >= 60 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-rose-400";

  useEffect(() => {
    setBarWidth(0);
    const t = setTimeout(() => setBarWidth(pct), delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div className="flex-1 min-w-[88px] bg-[#0D0B1A] rounded-xl p-3 border border-[#252345] space-y-2">
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className={`text-[9px] font-black uppercase tracking-widest leading-none ${accent}`}>{label}</p>
          <p className="text-[8px] text-[#4B5675] mt-0.5 leading-none">{sublabel}</p>
        </div>
        <span className="text-[8px] text-[#333368] font-mono shrink-0">{weight}%</span>
      </div>

      {/* Animated bar */}
      <div className="h-1.5 rounded-full bg-[#1C1933] overflow-hidden">
        <div
          className={`h-full rounded-full sg-bar-fill ${
            pct >= 60
              ? "bg-emerald-500 shadow-[0_0_6px_#10B98166]"
              : pct >= 40
              ? "bg-amber-500  shadow-[0_0_6px_#F59E0B66]"
              : "bg-red-500    shadow-[0_0_6px_#EF444466]"
          }`}
          style={{ "--sg-bar-w": `${barWidth}%` } as React.CSSProperties}
        />
      </div>

      <p className={`text-base font-black font-mono tabular-nums leading-none ${valClass}`}>
        {pct}<span className="text-[8px] text-[#4B5675] font-normal">/100</span>
      </p>
    </div>
  );
}

// ── Widget ─────────────────────────────────────────────────────────────────────

export default function SentimentWidget() {
  const [data,    setData]    = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const isDark = useIsDark();

  useEffect(() => {
    fetchSentiment()
      .then(d => setData((d as SentimentData | null)))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const regimeClass =
    data?.regime === "Risk-On"  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    data?.regime === "Risk-Off" ? "bg-rose-500/10    text-rose-400    border-rose-500/20"    :
                                  "bg-amber-500/10   text-amber-400   border-amber-500/20";

  return (
    <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5">

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#4B5675]">Market Sentiment</p>
          <p className="text-[10px] text-[#333368] mt-0.5">VIX · 5D momentum · News flow</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!loading && data?.regime && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${regimeClass}`}>
              {data.regime}
            </span>
          )}
          {!loading && data?.vix != null && (
            <span className="text-[9px] font-mono text-[#4B5675]">
              VIX{" "}
              <span className={`font-bold ${
                data.vix >= 30 ? "text-rose-400" : data.vix >= 20 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {data.vix.toFixed(1)}
              </span>
              {data.vixChange != null && (
                <span className={data.vixChange >= 0 ? "text-rose-400" : "text-emerald-400"}>
                  {" "}{data.vixChange >= 0 ? "+" : ""}{data.vixChange.toFixed(1)}%
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="#34D399" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : !data ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-[#4B5675] text-sm">Unavailable</p>
        </div>
      ) : (
        <>
          {/* Arc gauge */}
          <ArcGauge score={data.overallScore ?? 0} isDark={isDark} />

          {/* Sub-metric breakdown */}
          {data.breakdown && (
            <div className="mt-3 flex flex-wrap gap-2">
              <MetricCard
                label="VIX"
                sublabel={data.vix != null ? `Raw: ${data.vix.toFixed(1)}` : "Fear index"}
                weight={data.breakdown.weights.vix}
                value={data.breakdown.vixInput}
                accent="text-emerald-400"
                delay={400}
              />
              <MetricCard
                label="5D Trend"
                sublabel="SPY momentum"
                weight={data.breakdown.weights.momentum}
                value={data.breakdown.momentumInput}
                accent="text-teal-400"
                delay={600}
              />
              <MetricCard
                label="News"
                sublabel="Sentiment flow"
                weight={data.breakdown.weights.news}
                value={data.breakdown.newsInput}
                accent="text-sky-400"
                delay={800}
              />
            </div>
          )}

          {/* SPY / QQQ pills + link */}
          <div className="mt-3 flex items-center gap-2">
            {[
              { label: "SPY", chg: data.spyChange },
              { label: "QQQ", chg: data.qqqChange },
            ].map(({ label, chg }) => (
              <div key={label} className="flex items-center gap-1.5 bg-[#0D0B1A] border border-[#252345] rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] font-bold text-[#4B5675] font-mono">{label}</span>
                <span className={`text-[11px] font-black font-mono tabular-nums ${
                  chg == null ? "text-[#4B5675]" : chg >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                </span>
              </div>
            ))}
            <Link
              href="/market-sentiment"
              className="ml-auto text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              Full Pulse
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
              </svg>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
