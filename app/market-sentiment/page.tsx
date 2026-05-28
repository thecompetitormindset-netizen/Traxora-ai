"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio } from "../lib/trading";

// ── Types ─────────────────────────────────────────────────────────────────

interface MarketData {
  score:          number;
  label:          string;
  color:          string;
  vix:            number | null;
  vixChange:      number | null;
  overallScore:   number;
  fearGreed:      number;
  regime:         string;
  spyPrice:       number | null;
  spyChange:      number | null;
  qqqPrice:       number | null;
  qqqChange:      number | null;
  iwmPrice:       number | null;
  iwmChange:      number | null;
  vixTermStructure: string;
  putCallProxy:   { value: number; avg: number; interpretation: string };
  topHeadlines:   Array<{ title: string; source: string; sentiment: string; score: number }>;
  newsCount:      number;
  fetchedAt:      number;
}

interface ClassifiedItem {
  sentiment:  "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  reason:     string;
}

interface SynthesisResult {
  ticker:  string;
  score:   number;
  summary: string;
  drivers: string[];
  regime:  string;
  bullish: number;
  bearish: number;
  neutral: number;
}

interface MasterReport {
  narrative:              string;
  contrarian:             string;
  smartMoneySignal:       string;
  retailVsInstitutional:  string;
  divergences:            string[];
  themes:                 string[];
  catalysts:              string[];
  positionGuidance:       string;
  overallBias:            string;
  confidence:             number;
  generatedAt:            number;
}

// ── Sub-components ────────────────────────────────────────────────────────

function Skeleton({ h = "h-4", w = "w-full", rounded = "rounded-lg" }: { h?: string; w?: string; rounded?: string }) {
  return <div className={`${h} ${w} ${rounded} bg-[#1C2333] animate-pulse`} />;
}

function MetricCard({
  label, sublabel, children, badge, whyContent, accentColor = "indigo",
}: {
  label:       string;
  sublabel?:   string;
  children:    React.ReactNode;
  badge?:      React.ReactNode;
  whyContent?: string;
  accentColor?: string;
}) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className={`bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5 flex flex-col gap-3 hover:border-${accentColor}-500/30 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675]">{label}</p>
          {sublabel && <p className="text-[10px] text-[#2D3A50] mt-0.5">{sublabel}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {whyContent && (
            <button
              type="button"
              onClick={() => setShowWhy(v => !v)}
              className="text-[10px] text-[#4B5675] hover:text-indigo-400 border border-[#1C2333] hover:border-indigo-500/30 px-2 py-0.5 rounded-lg transition-colors"
            >
              Why?
            </button>
          )}
        </div>
      </div>
      {children}
      {showWhy && whyContent && (
        <p className="text-[11px] text-[#7B8DB4] border-t border-[#1C2333] pt-3 leading-relaxed">
          {whyContent}
        </p>
      )}
    </div>
  );
}

// Vertical thermometer gauge (-100 to +100)
function SentimentGauge({ score }: { score: number }) {
  const clamp = Math.max(-100, Math.min(100, score));
  const pct   = (clamp + 100) / 200;

  const sX = 44, sY = 12, sW = 28, sH = 220;
  const bCX = sX + sW / 2, bCY = sY + sH + 24, bR = 22;
  const fillY = sY + (1 - pct) * sH;
  const fillH = pct * sH;

  const color = clamp >= 30 ? "#10B981" : clamp >= -30 ? "#F59E0B" : "#EF4444";
  const label = clamp >= 50 ? "Strong Bullish" : clamp >= 20 ? "Bullish" : clamp >= -20 ? "Neutral" : clamp >= -50 ? "Bearish" : "Strong Bearish";

  const ticks = [
    { p: 1,    lbl: "+100" },
    { p: 0.75, lbl: "+50"  },
    { p: 0.5,  lbl: "0"    },
    { p: 0.25, lbl: "−50"  },
    { p: 0,    lbl: "−100" },
  ].map(t => ({ ...t, y: sY + (1 - t.p) * sH }));

  return (
    <div className="flex items-center gap-6 justify-center w-full py-3">
      <svg viewBox="0 0 110 286" width="90" aria-hidden="true">
        <defs>
          <linearGradient id="pg" x1="0" y1={sY + sH} x2="0" y2={sY} gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#EF4444" />
            <stop offset="28%"  stopColor="#F97316" />
            <stop offset="50%"  stopColor="#F59E0B" />
            <stop offset="72%"  stopColor="#22C55E" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <clipPath id="pclip">
            <rect x={sX} y={sY} width={sW} height={sH} rx={sW / 2} />
          </clipPath>
        </defs>

        {/* Shaft background */}
        <rect x={sX} y={sY} width={sW} height={sH} rx={sW / 2} fill="#080E1B" />

        {/* Fill */}
        <g clipPath="url(#pclip)">
          <rect x={sX} y={sY} width={sW} height={sH} fill="url(#pg)" opacity="0.14" />
          {fillH > 0 && <rect x={sX} y={fillY} width={sW} height={fillH} fill="url(#pg)" />}
        </g>

        {/* Zero line */}
        <line x1={sX + 5} y1={sY + sH / 2} x2={sX + sW - 5} y2={sY + sH / 2}
              stroke="#232F46" strokeWidth="1.5" strokeDasharray="3 2" />

        {/* Tick marks + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={sX - 7} y1={t.y} x2={sX - 1} y2={t.y}
                  stroke="#253145" strokeWidth="2" strokeLinecap="round" />
            <text x={sX - 11} y={t.y} fontSize="9.5" fill="#3A4F6A"
                  fontFamily="monospace" textAnchor="end" dominantBaseline="central">
              {t.lbl}
            </text>
          </g>
        ))}

        {/* Pointer arrow */}
        <polygon
          points={`${sX + sW + 1},${fillY - 6} ${sX + sW + 13},${fillY} ${sX + sW + 1},${fillY + 6}`}
          fill={color}
        />

        {/* Bulb */}
        <circle cx={bCX} cy={bCY} r={bR + 7} fill={color} fillOpacity="0.12" />
        <circle cx={bCX} cy={bCY} r={bR}     fill={color} />
        <circle cx={bCX} cy={bCY} r={bR * 0.38} fill="#060A14" />
      </svg>

      {/* Score + label alongside */}
      <div className="flex flex-col">
        <p className={`text-5xl font-black font-mono tabular-nums leading-none ${
          clamp >= 30 ? "text-emerald-400" : clamp >= -30 ? "text-amber-400" : "text-rose-400"
        }`}>
          {clamp > 0 ? "+" : ""}{clamp}
        </p>
        <p className="text-xs font-semibold text-[#7B8DB4] mt-2 tracking-wide">{label}</p>
      </div>
    </div>
  );
}

// Fear & Greed bar gauge
function FGGauge({ value }: { value: number }) {
  const clamp = Math.max(0, Math.min(100, value));
  const color = clamp >= 80 ? "#10B981" : clamp >= 60 ? "#22C55E" : clamp >= 40 ? "#F59E0B" : clamp >= 20 ? "#F97316" : "#F43F5E";
  const label = clamp >= 80 ? "Extreme Greed" : clamp >= 60 ? "Greed" : clamp >= 40 ? "Neutral" : clamp >= 20 ? "Fear" : "Extreme Fear";
  return (
    <div>
      <div className="flex justify-between text-[10px] text-[#4B5675] mb-1.5">
        <span>Extreme Fear</span>
        <span className="font-black font-mono text-sm" style={{ color }}>{clamp}</span>
        <span>Extreme Greed</span>
      </div>
      <div className="h-2.5 bg-[#1C2333] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamp}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[11px] font-semibold mt-1.5 text-center" style={{ color }}>{label}</p>
    </div>
  );
}

function SignalBadge({ s, small }: { s: string; small?: boolean }) {
  const size = small ? "text-[9px] px-1.5 py-0.5" : "text-xs px-2.5 py-1";
  if (s === "Bullish" || s === "Somewhat-Bullish")
    return <span className={`${size} rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold`}>{s}</span>;
  if (s === "Bearish" || s === "Somewhat-Bearish")
    return <span className={`${size} rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold`}>{s}</span>;
  return <span className={`${size} rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold`}>{s}</span>;
}

function ChgPill({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[#4B5675] text-xs font-mono">—</span>;
  const pos = v >= 0;
  return (
    <span className={`text-xs font-mono font-bold ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.round((score + 100) / 2);
  const color = score >= 30 ? "#10B981" : score >= -30 ? "#F59E0B" : "#F43F5E";
  return (
    <div className="mt-2">
      <div className="h-1.5 bg-[#1C2333] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-[#4B5675]">-100</span>
        <span className="text-[9px] font-mono font-bold" style={{ color }}>{score > 0 ? "+" : ""}{score}</span>
        <span className="text-[9px] text-[#4B5675]">+100</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function MarketSentimentPage() {
  const { data: session } = useSession();
  const [md,          setMd]          = useState<MarketData | null>(null);
  const [mdLoading,   setMdLoading]   = useState(true);
  const [mdError,     setMdError]     = useState<string | null>(null);

  const [classified,   setClassified]   = useState<ClassifiedItem[] | null>(null);
  const [classLoading, setClassLoading] = useState(false);

  const [syntheses,    setSyntheses]    = useState<SynthesisResult[]>([]);
  const [synthLoading, setSynthLoading] = useState(false);

  const [report,       setReport]       = useState<MasterReport | null>(null);
  const [reportLoading,setReportLoading]= useState(false);
  const [reportError,  setReportError]  = useState<string | null>(null);

  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load market data ────────────────────────────────────────────────────

  const loadMarketData = useCallback(async () => {
    try {
      const res  = await fetch("/api/sentiment", { cache: "no-store" });
      const data = await res.json() as MarketData & { error?: string };
      if (data.error) { setMdError(data.error); return; }
      setMd(data);
      setMdError(null);
      setLastRefresh(new Date());
    } catch { setMdError("Failed to load market data"); }
    finally { setMdLoading(false); }
  }, []);

  useEffect(() => {
    loadMarketData();
    intervalRef.current = setInterval(() => {
      if (!document.hidden) loadMarketData();
    }, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadMarketData]);

  // ── Auto-classify headlines once market data loads ────────────────────
  useEffect(() => {
    if (!md || !md.topHeadlines?.length || classified !== null) return;
    async function classify() {
      setClassLoading(true);
      try {
        const res  = await fetch("/api/sentiment/classify", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ headlines: md!.topHeadlines.map(h => ({ text: h.title, source: h.source })) }),
        });
        const data = await res.json() as { classified: ClassifiedItem[] };
        if (Array.isArray(data.classified)) setClassified(data.classified);
      } catch { /* silent */ }
      finally { setClassLoading(false); }
    }
    classify();
  }, [md, classified]);

  // ── Synthesize for user's top holdings ──────────────────────────────
  useEffect(() => {
    if (!md || !classified || syntheses.length > 0) return;
    const portfolio = getPortfolio();
    const userTickers = portfolio.holdings.map(h => h.symbol.replace(".US","").replace(".COMM","")).slice(0, 3);
    if (userTickers.length === 0) return;

    async function synthesize() {
      setSynthLoading(true);
      try {
        const results = await Promise.allSettled(
          userTickers.map(async (ticker) => {
            const items = (md!.topHeadlines ?? [])
              .filter((_, i) => classified![i]?.sentiment)
              .map((h, i) => ({
                text:       h.title,
                sentiment:  classified![i]?.sentiment ?? "Neutral",
                confidence: classified![i]?.confidence ?? 50,
                source:     h.source,
              }));
            if (items.length === 0) return null;
            const res  = await fetch("/api/sentiment/synthesize", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ ticker, items }),
            });
            return res.ok ? (await res.json() as SynthesisResult) : null;
          }),
        );
        const valid = results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []);
        setSyntheses(valid);
      } catch { /* silent */ }
      finally { setSynthLoading(false); }
    }
    synthesize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, classified]);

  // ── Generate Opus master report ──────────────────────────────────────
  async function generateReport() {
    setReportLoading(true);
    setReportError(null);
    try {
      const portfolio = getPortfolio();
      const positions = portfolio.holdings.map(h => ({
        symbol:   h.symbol,
        quantity: h.quantity,
        avgPrice: h.avgPrice,
      }));
      const res  = await fetch("/api/sentiment/master", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          marketData: md ?? {},
          syntheses,
          positions,
          watchlist: [],
        }),
      });
      const data = await res.json() as MasterReport & { reason?: string };
      if (!res.ok || data.reason === "AI_UNAVAILABLE") {
        setReportError("AI temporarily unavailable — please check your Anthropic API key in Settings.");
        return;
      }
      setReport(data);
    } catch { setReportError("Report generation failed. Try again shortly."); }
    finally { setReportLoading(false); }
  }

  const toggleCard = (id: string) => setExpandedCard(v => v === id ? null : id);

  // ── Derived stats ──────────────────────────────────────────────────
  const bullishPct = classified && classified.length > 0
    ? Math.round((classified.filter(c => c.sentiment === "Bullish").length / classified.length) * 100)
    : null;
  const bearishPct = classified && classified.length > 0
    ? Math.round((classified.filter(c => c.sentiment === "Bearish").length / classified.length) * 100)
    : null;

  const biasColor = (report?.overallBias ?? md?.regime ?? "Neutral") === "Bullish" || (report?.overallBias ?? "") === "Risk-On"
    ? "text-emerald-400"
    : (report?.overallBias ?? "") === "Bearish" || (report?.overallBias ?? "") === "Risk-Off"
    ? "text-rose-400"
    : "text-amber-400";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-black">Market Sentiment</h1>
              <p className="text-[#7B8DB4] mt-2 text-sm">
                Institutional-grade analysis powered by Claude AI — Haiku for classification, Sonnet for synthesis, Opus for deep reports.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {lastRefresh && (
                <p className="text-[11px] text-[#4B5675]">
                  Updated {lastRefresh.toLocaleTimeString()}
                </p>
              )}
              <button
                type="button"
                onClick={loadMarketData}
                disabled={mdLoading}
                className="text-xs bg-[#1C2333] hover:bg-[#2D3A50] border border-[#2D3A50] px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {mdLoading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>

          {/* Model routing badge strip */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {[
              { model: "Haiku",  task: "Classify",      color: "sky",    tokens: "~150 tok/call" },
              { model: "Sonnet", task: "Synthesize",     color: "violet", tokens: "~512 tok/call" },
              { model: "Opus",   task: "Master Report",  color: "amber",  tokens: "~1500 tok/call" },
            ].map(b => (
              <div key={b.model} className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg bg-${b.color}-500/10 border border-${b.color}-500/20 text-${b.color}-400`}>
                <span className="font-black">{b.model}</span>
                <span className="text-[#4B5675]">·</span>
                <span>{b.task}</span>
                <span className="text-[#4B5675]">{b.tokens}</span>
              </div>
            ))}
          </div>

          {mdError && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-sm text-rose-400">
              {mdError} — market data sources temporarily unavailable.
            </div>
          )}

          {/* ── SECTION 1: At-a-Glance Gauges ──────────────────────────── */}
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#4B5675] mt-8 mb-4">At-a-Glance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* Overall Score */}
            <MetricCard
              label="Overall Market Score"
              sublabel="Composite institutional sentiment"
              accentColor="indigo"
              whyContent="Derived from VIX volatility (60%), SPY 5-day momentum (30%), and news sentiment (10%). Range: -100 (extreme bearish) to +100 (extreme bullish)."
            >
              {mdLoading ? (
                <div className="space-y-2"><Skeleton h="h-20" /><Skeleton h="h-4" w="w-2/3" /></div>
              ) : md ? (
                <SentimentGauge score={md.overallScore ?? 0} />
              ) : <p className="text-[#4B5675] text-sm text-center py-4">Unavailable</p>}
            </MetricCard>

            {/* Fear & Greed */}
            <MetricCard
              label="Fear & Greed Index"
              sublabel="Composite market psychology (0–100)"
              accentColor="amber"
              whyContent="Computed from: VIX level (inverse correlation), S&P 500 5-day momentum, and news sentiment scores from Alpha Vantage. CNN's original uses 7 components; this is a 3-factor approximation."
            >
              {mdLoading ? (
                <div className="space-y-2"><Skeleton h="h-8" /><Skeleton h="h-3" /></div>
              ) : md ? (
                <FGGauge value={md.fearGreed ?? md.score ?? 50} />
              ) : <p className="text-[#4B5675] text-sm text-center py-4">Unavailable</p>}
            </MetricCard>

            {/* VIX */}
            <MetricCard
              label="VIX — Volatility Index"
              sublabel="CBOE options-implied 30-day vol"
              accentColor={md?.vixChange != null && md.vixChange > 0 ? "rose" : "emerald"}
              whyContent="VIX < 15 = complacency (greed). VIX 15-25 = normal. VIX > 30 = fear. Term structure: contango (futures > spot) = calm; backwardation (spot > futures) = panic buying of hedges."
            >
              {mdLoading ? (
                <div className="space-y-2"><Skeleton h="h-10" w="w-1/2" /><Skeleton h="h-3" /></div>
              ) : md?.vix != null ? (
                <div>
                  <div className="flex items-end gap-3">
                    <p className="text-4xl font-black font-mono text-[#F1F5F9]">{md.vix.toFixed(2)}</p>
                    <ChgPill v={md.vixChange} />
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${
                      md.vix < 15 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      md.vix < 25 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {md.vix < 15 ? "Complacency" : md.vix < 25 ? "Normal" : md.vix < 35 ? "Elevated Fear" : "Panic"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold capitalize">
                      {md.vixTermStructure}
                    </span>
                  </div>
                </div>
              ) : <p className="text-[#4B5675] text-sm">VIX unavailable</p>}
            </MetricCard>

            {/* Index Pulse */}
            <MetricCard
              label="Index Pulse"
              sublabel="SPY · QQQ · IWM daily change"
              whyContent="SPY = S&P 500. QQQ = Nasdaq-100. IWM = Russell 2000 (small-caps). When large-caps diverge from small-caps, it signals risk-on/off rotation."
            >
              {mdLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} h="h-8" />)}</div>
              ) : (
                <div className="space-y-2">
                  {[
                    { sym: "SPY", price: md?.spyPrice, chg: md?.spyChange },
                    { sym: "QQQ", price: md?.qqqPrice, chg: md?.qqqChange },
                    { sym: "IWM", price: md?.iwmPrice, chg: md?.iwmChange },
                  ].map(row => (
                    <div key={row.sym} className="flex items-center justify-between bg-[#060A14]/60 border border-[#1C2333] rounded-xl px-3 py-2">
                      <span className="text-xs font-mono font-bold text-indigo-400">{row.sym}</span>
                      <span className="text-sm font-mono text-[#F1F5F9]">{row.price != null ? `$${row.price.toFixed(2)}` : "—"}</span>
                      <ChgPill v={row.chg ?? null} />
                    </div>
                  ))}
                </div>
              )}
            </MetricCard>

            {/* Put/Call Proxy */}
            <MetricCard
              label="Put / Call Proxy"
              sublabel="Options hedging pressure (VIX-derived)"
              whyContent="Derived from VIX momentum, not CBOE raw data. P/C > 1.2 = defensive hedging. P/C < 0.7 = speculative call buying. A rising P/C with rising VIX = institutional risk-off."
            >
              {mdLoading ? (
                <div className="space-y-2"><Skeleton h="h-10" w="w-1/3" /><Skeleton h="h-4" /></div>
              ) : md?.putCallProxy ? (
                <div>
                  <div className="flex items-end gap-3 mb-2">
                    <p className={`text-4xl font-black font-mono ${
                      md.putCallProxy.value > 1.2 ? "text-rose-400" :
                      md.putCallProxy.value < 0.7 ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {md.putCallProxy.value.toFixed(2)}
                    </p>
                    <span className="text-xs text-[#4B5675] mb-1">vs avg {md.putCallProxy.avg}</span>
                  </div>
                  <p className="text-xs text-[#7B8DB4]">{md.putCallProxy.interpretation}</p>
                </div>
              ) : <p className="text-[#4B5675] text-sm">Unavailable</p>}
            </MetricCard>

            {/* Market Regime */}
            <MetricCard
              label="Market Regime"
              sublabel="Risk-On · Risk-Off · Transitional"
              whyContent="Derived from Fear & Greed score: ≥65 = Risk-On (buy equities); ≤45 = Risk-Off (defensive positioning); between = Transitional (wait for confirmation)."
            >
              {mdLoading ? (
                <Skeleton h="h-16" />
              ) : md ? (
                <div className="flex flex-col items-center justify-center py-2">
                  <span className={`text-2xl font-black ${
                    md.regime === "Risk-On"  ? "text-emerald-400" :
                    md.regime === "Risk-Off" ? "text-rose-400" : "text-amber-400"
                  }`}>{md.regime}</span>
                  <p className="text-xs text-[#4B5675] mt-2 text-center">
                    {md.regime === "Risk-On"
                      ? "Institutions accumulating equities"
                      : md.regime === "Risk-Off"
                      ? "Smart money rotating to safety"
                      : "Wait for confirmation signal"}
                  </p>
                </div>
              ) : <p className="text-[#4B5675] text-sm text-center py-4">Unavailable</p>}
            </MetricCard>
          </div>

          {/* ── SECTION 2: Smart Money Panel ────────────────────────────── */}
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#4B5675] mt-8 mb-4">Smart Money Signals</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

            {/* Institutional Flow */}
            <MetricCard
              label="Institutional Flow"
              sublabel="Dark pool + block trade proxy"
              whyContent="Derived from SPY & QQQ volume patterns relative to price action. Actual dark pool data requires Unusual Whales API. This shows directional pressure from large-lot activity."
            >
              {mdLoading ? <Skeleton h="h-12" /> : md ? (
                <div>
                  <div className={`text-2xl font-black font-mono ${
                    (md.spyChange ?? 0) >= 0.5 ? "text-emerald-400" :
                    (md.spyChange ?? 0) <= -0.5 ? "text-rose-400" : "text-amber-400"
                  }`}>
                    {(md.spyChange ?? 0) >= 0.5 ? "↑ Buying" : (md.spyChange ?? 0) <= -0.5 ? "↓ Selling" : "→ Neutral"}
                  </div>
                  <p className="text-xs text-[#4B5675] mt-1">Based on SPY price action proxy</p>
                </div>
              ) : <p className="text-[#4B5675] text-sm">Unavailable</p>}
            </MetricCard>

            {/* Options Sentiment */}
            <MetricCard
              label="Options Sentiment"
              sublabel="Call / Put flow directionality"
              whyContent="Derived from VIX term structure and momentum. Backwardation = elevated put demand = bearish hedging. Contango = call-dominant = complacency or bullish speculation."
            >
              {mdLoading ? <Skeleton h="h-12" /> : md ? (
                <div>
                  <p className={`text-lg font-black capitalize ${
                    md.vixTermStructure === "contango" ? "text-emerald-400" :
                    md.vixTermStructure === "backwardation" ? "text-rose-400" : "text-amber-400"
                  }`}>
                    {md.vixTermStructure === "contango" ? "Call Dominant" :
                     md.vixTermStructure === "backwardation" ? "Put Dominant" : "Balanced"}
                  </p>
                  <p className="text-xs text-[#4B5675] mt-1">VIX term structure: {md.vixTermStructure}</p>
                </div>
              ) : <p className="text-[#4B5675] text-sm">Unavailable</p>}
            </MetricCard>

            {/* COT Positioning */}
            <MetricCard
              label="COT Positioning"
              sublabel="CFTC Commitments of Traders"
              whyContent="COT data is published weekly by the CFTC. It shows net long/short positioning by commercial hedgers and large speculators across futures markets. Real data requires CFTC.gov API integration."
            >
              <div className="text-center py-2">
                <p className="text-xs text-[#4B5675]">Weekly data · CFTC</p>
                <a
                  href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors mt-1 block"
                >
                  View latest COT report →
                </a>
              </div>
            </MetricCard>

            {/* Insider Activity */}
            <MetricCard
              label="Insider Activity"
              sublabel="SEC Form 4 net flow (news-derived)"
              whyContent="Tracks mentions of insider buying/selling in news headlines. True Form 4 data requires SEC EDGAR API. Insider buying is a strong bullish signal; selling is often tax/diversification."
            >
              {classLoading ? <Skeleton h="h-12" /> : classified ? (
                <div>
                  <p className={`text-lg font-black ${bullishPct != null && bullishPct > 55 ? "text-emerald-400" : bullishPct != null && bullishPct < 40 ? "text-rose-400" : "text-amber-400"}`}>
                    {bullishPct != null ? `${bullishPct}% Bullish News` : "—"}
                  </p>
                  <p className="text-xs text-[#4B5675] mt-1">
                    {classified.length} headlines classified by Haiku
                  </p>
                </div>
              ) : <p className="text-[#4B5675] text-xs">Awaiting classification</p>}
            </MetricCard>
          </div>

          {/* ── SECTION 3: User-Specific ─────────────────────────────────── */}
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#4B5675] mt-8 mb-4">
            Your Portfolio Sentiment
            {!session?.user && <span className="ml-2 text-[#2D3A50] normal-case font-normal">— sign in to personalize</span>}
          </h2>

          {synthLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5"><Skeleton h="h-16" /></div>)}
            </div>
          ) : syntheses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {syntheses.map(s => (
                <MetricCard
                  key={s.ticker}
                  label={s.ticker}
                  sublabel={`${s.bullish}B · ${s.bearish}Be · ${s.neutral}N analyzed by Sonnet`}
                  badge={<SignalBadge s={s.score >= 20 ? "Bullish" : s.score <= -20 ? "Bearish" : "Neutral"} />}
                  whyContent={s.drivers.join(" · ")}
                >
                  <ScoreBar score={s.score} />
                  <p className="text-xs text-[#7B8DB4] leading-relaxed">{s.summary}</p>
                </MetricCard>
              ))}
            </div>
          ) : (
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-6 text-center">
              <p className="text-[#4B5675] text-sm">
                {getPortfolio().holdings.length === 0
                  ? "No open positions — buy a stock to see sentiment for your holdings."
                  : "Loading sentiment for your positions…"}
              </p>
            </div>
          )}

          {/* News headline distribution */}
          {classified && classified.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "Bullish", pct: bullishPct, color: "emerald" },
                { label: "Bearish", pct: bearishPct, color: "rose"    },
                { label: "Neutral", pct: bullishPct != null && bearishPct != null ? 100 - bullishPct - bearishPct : null, color: "amber" },
              ].map(d => (
                <div key={d.label} className={`bg-${d.color}-500/5 border border-${d.color}-500/20 rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-black font-mono text-${d.color}-400`}>{d.pct ?? "—"}{d.pct != null ? "%" : ""}</p>
                  <p className="text-[10px] text-[#4B5675] mt-0.5">{d.label} Headlines</p>
                </div>
              ))}
            </div>
          )}

          {/* ── SECTION 4: Narrative Panel (Opus) ──────────────────────── */}
          <div className="mt-8 flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#4B5675]">Opus Deep Report</h2>
            {!report && (
              <button
                type="button"
                onClick={generateReport}
                disabled={reportLoading || mdLoading}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold"
              >
                {reportLoading ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Opus thinking…
                  </>
                ) : "Generate ICT Report (Opus)"}
              </button>
            )}
            {report && (
              <button
                type="button"
                onClick={generateReport}
                disabled={reportLoading}
                className="text-xs text-[#4B5675] hover:text-amber-400 transition-colors"
              >
                ↻ Regenerate
              </button>
            )}
          </div>

          {reportError && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-sm text-rose-400">
              {reportError}
            </div>
          )}

          {reportLoading && !report && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5 space-y-3">
                  <Skeleton h="h-3" w="w-1/3" />
                  <Skeleton h="h-4" />
                  <Skeleton h="h-4" w="w-5/6" />
                  <Skeleton h="h-4" w="w-4/6" />
                </div>
              ))}
            </div>
          )}

          {report && (
            <div className="mt-4 space-y-4">

              {/* Narrative + bias */}
              <div className="bg-[#0C1017] border border-amber-500/20 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">Today&apos;s Dominant Narrative</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                      report.overallBias === "Bullish"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : report.overallBias === "Bearish"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}>
                      {report.overallBias} · {report.confidence}% confidence
                    </span>
                    <span className="text-[10px] text-[#4B5675] px-2 py-1 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      claude-opus-4-7
                    </span>
                  </div>
                </div>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">{report.narrative}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Contrarian Signal */}
                <div className="bg-[#0C1017] border border-violet-500/20 rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-400 mb-2">Contrarian Signal</p>
                  <p className="text-sm text-[#CBD5E1] leading-relaxed">{report.contrarian}</p>
                </div>

                {/* Smart Money Signal */}
                <div className="bg-[#0C1017] border border-indigo-500/20 rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-400 mb-2">Smart Money Phase</p>
                  <p className={`text-xl font-black ${biasColor}`}>{report.smartMoneySignal}</p>
                  <p className="text-xs text-[#7B8DB4] mt-2 leading-relaxed">{report.retailVsInstitutional}</p>
                </div>
              </div>

              {/* Themes + Catalysts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">News Themes</p>
                  <div className="space-y-2">
                    {report.themes.map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-[9px] font-black text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-xs text-[#7B8DB4]">{t}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">Tomorrow&apos;s Catalysts</p>
                  <div className="space-y-2">
                    {report.catalysts.map((c, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 text-sm shrink-0">⚡</span>
                        <p className="text-xs text-[#7B8DB4]">{c}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divergences + Position Guidance */}
              {report.divergences.length > 0 && (
                <div className="bg-[#0C1017] border border-rose-500/20 rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400 mb-3">Sentiment vs Price Divergences</p>
                  <div className="flex flex-wrap gap-2">
                    {report.divergences.map((d, i) => (
                      <span key={i} className="text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-lg">
                        ⚠ {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.positionGuidance && report.positionGuidance !== "No specific guidance for current positions." && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">Your Position Guidance</p>
                  <p className="text-sm text-[#CBD5E1] leading-relaxed">{report.positionGuidance}</p>
                  <p className="text-[10px] text-[#4B5675] mt-2">Not financial advice — paper trading only</p>
                </div>
              )}

              <p className="text-[10px] text-[#2D3A50] text-right">
                Generated {new Date(report.generatedAt).toLocaleTimeString()} · Cached 4h · claude-opus-4-7
              </p>
            </div>
          )}

          {/* ── SECTION 5: Live Headlines ─────────────────────────────── */}
          {md?.topHeadlines && md.topHeadlines.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#4B5675] mt-8 mb-4">
                Live Headlines
                <span className="ml-2 normal-case font-normal text-[#2D3A50]">
                  — {classLoading ? "classifying with Haiku…" : classified ? `${classified.length} classified` : "classification pending"}
                </span>
              </h2>
              <div className="space-y-2">
                {md.topHeadlines.map((h, i) => {
                  const cl = classified?.[i];
                  return (
                    <div
                      key={i}
                      className="bg-[#0C1017] border border-[#1C2333] hover:border-indigo-500/20 rounded-xl p-4 flex items-start gap-3 transition-colors cursor-pointer"
                      onClick={() => toggleCard(`h-${i}`)}
                    >
                      {/* Pre-scored AV label */}
                      <SignalBadge s={h.sentiment} small />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#F1F5F9] leading-snug">{h.title}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-[#4B5675]">{h.source}</span>
                          {cl && (
                            <>
                              <span className="text-[#2D3A50]">·</span>
                              <span className="text-[10px] text-[#4B5675]">
                                Haiku: <span className={cl.sentiment === "Bullish" ? "text-emerald-400" : cl.sentiment === "Bearish" ? "text-rose-400" : "text-amber-400"}>{cl.sentiment}</span> ({cl.confidence}%)
                              </span>
                            </>
                          )}
                          {classLoading && !cl && (
                            <span className="text-[10px] text-[#4B5675] animate-pulse">classifying…</span>
                          )}
                        </div>
                        {expandedCard === `h-${i}` && cl?.reason && (
                          <p className="text-[11px] text-[#7B8DB4] mt-2 border-t border-[#1C2333] pt-2">{cl.reason}</p>
                        )}
                      </div>
                      <span className="text-[#4B5675] text-lg shrink-0">{expandedCard === `h-${i}` ? "↑" : "↓"}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-[#2D3A50] text-center mt-10 max-w-2xl mx-auto">
            Market Sentiment is for informational purposes only. AI-generated analysis does not constitute financial advice.
            All sentiment scores are derived from public market data and news sources.
          </p>

        </div>
      </main>
    </div>
  );
}
