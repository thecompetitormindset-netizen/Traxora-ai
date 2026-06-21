"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import dynamic from "next/dynamic";
const TraxoraChart = dynamic(() => import("@/app/components/TraxoraChart"), {
  ssr: false,
});
import MarketStatus from "@/app/components/MarketStatus";
import { getPortfolio } from "@/app/lib/trading";
import { scopedKey } from "@/app/lib/userState";
import type { AIAnalysis, DeepAnalysis, TradePlan } from "@/app/components/analysis/types";
import { signalStyle, riskStyle, confidenceStyle } from "@/app/components/analysis/types";
import DeepMarketPanel from "@/app/components/analysis/DeepMarketPanel";
import ProAnalysisPanel from "@/app/components/analysis/ProAnalysisPanel";
import MarketDepth from "@/app/components/analysis/MarketDepth";
import type { VolumeProfile } from "@/app/api/volume-profile/route";
import type { ProAnalysisResult } from "@/app/api/ai/pro-analysis/route";
import PaywallGuard from "@/app/components/PaywallGuard";
import AnalystRatings from "@/app/components/AnalystRatings";
import type { QuoteStats } from "@/app/api/market/quote-stats/route";

// ── Main Analysis Component ───────────────────────────────────────────────────

function AnalysisContent() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysis | null>(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepStep, setDeepStep]       = useState(0);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [overrideInfo, setOverrideInfo] = useState<{ from: string; to: string } | null>(null);

  const [proAnalysis, setProAnalysis]     = useState<ProAnalysisResult | null>(null);
  const [loadingPro, setLoadingPro]       = useState(false);
  const [proStep, setProStep]             = useState(0);
  const [proError, setProError]           = useState<string | null>(null);

  const DEEP_STEPS = ["Fetching market data…", "Computing indicators…", "Running AI…", "Parsing results…"];
  const PRO_STEPS  = ["Gathering data…", "Checking risk gates…", "Running AI…", "Finalizing…"];

  useEffect(() => {
    if (!loadingDeep) { setDeepStep(0); return; }
    const timers = [1500, 6000, 12000].map((ms, i) => setTimeout(() => setDeepStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [loadingDeep]);

  useEffect(() => {
    if (!loadingPro) { setProStep(0); return; }
    const timers = [2000, 8000, 16000].map((ms, i) => setTimeout(() => setProStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [loadingPro]);

  const [volumeProfile, setVolumeProfile] = useState<VolumeProfile | null>(null);

  type NewsItem = { title: string; link: string; pubDate: string; source: string };
  const [news, setNews]           = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [holding, setHolding] = useState<{ quantity: number; avgPrice: number } | null>(null);

  useEffect(() => {
    function loadHolding() {
      const p = getPortfolio();
      const clean = symbol.replace(".US", "").replace(".COMM", "");
      const h = p.holdings.find(x => x.symbol === symbol || x.symbol.replace(".US","").replace(".COMM","") === clean);
      setHolding(h ? { quantity: h.quantity, avgPrice: h.avgPrice } : null);
    }
    loadHolding();
    window.addEventListener("portfolio-updated", loadHolding);
    return () => window.removeEventListener("portfolio-updated", loadHolding);
  }, [symbol]);

  // Keep the quick-signal panel in sync with the deep analysis result so they never contradict
  useEffect(() => {
    if (!deepAnalysis) return;
    const mapped: "BUY" | "HOLD" | "SELL" =
      deepAnalysis.overallBias === "BULLISH" ? "BUY" :
      deepAnalysis.overallBias === "BEARISH" ? "SELL" : "HOLD";
    setAnalysis(prev => {
      if (prev && prev.signal !== mapped) {
        setOverrideInfo({ from: prev.signal, to: mapped });
      }
      return prev
        ? { ...prev, signal: mapped, confidence: deepAnalysis.confidence }
        : { signal: mapped, confidence: deepAnalysis.confidence, summary: deepAnalysis.biasReasoning, keyPoints: [], risk: "Medium" as const };
    });
  }, [deepAnalysis]);

  useEffect(() => {
    setNewsLoading(true);
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((items) => { setNews(Array.isArray(items) ? items : []); })
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [symbol]);

  // Save visited symbol to recent history (used by Topbar search dropdown)
  useEffect(() => {
    try {
      const key = scopedKey("recent_symbols");
      const prev: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      const next = [symbol, ...prev.filter(s => s !== symbol)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* ignore */ }
  }, [symbol]);

  async function runDeepAnalysis() {
    setLoadingDeep(true);
    setDeepError(null);
    setDeepAnalysis(null);
    try {
      const res = await fetch("/api/ai/deep-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.reason === "AI_UNAVAILABLE") {
        setDeepError("AI unavailable — all providers failed. Check your API keys in settings.");
        return;
      }
      if (!res.ok || data.error) {
        setDeepError(data.error ?? "Analysis failed");
        return;
      }
      setDeepAnalysis(data as DeepAnalysis);
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingDeep(false);
    }
  }

  async function runProAnalysis() {
    setLoadingPro(true);
    setProError(null);
    setProAnalysis(null);
    try {
      const res = await fetch("/api/ai/pro-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(text); }
      catch { setProError(`Server error (${res.status}) — check Vercel logs`); return; }
      if (!res.ok || data.error) { setProError(String(data.error ?? "Pro analysis failed")); return; }
      setProAnalysis(data as unknown as ProAnalysisResult);
    } catch (e) {
      setProError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingPro(false);
    }
  }

  const [expandChart, setExpandChart] = useState(false);
  const [chartHeight, setChartHeight] = useState(460);
  useEffect(() => {
    function calc() { setChartHeight(window.innerWidth < 640 ? (expandChart ? 360 : 280) : (expandChart ? 680 : 460)); }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [expandChart]);

  const [quoteData, setQuoteData] = useState<{
    price: number | null;
    previousClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
  }>({ price: null, previousClose: null, open: null, high: null, low: null });

  const [quoteStats, setQuoteStats] = useState<QuoteStats | null>(null);

  useEffect(() => {
    setAnalysis(null);
    setVolumeProfile(null);
    setQuoteData({ price: null, previousClose: null, open: null, high: null, low: null });
    setQuoteStats(null);

    fetch(`/api/market/quote-stats?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setQuoteStats(d as QuoteStats); })
      .catch(() => {});

    fetch(`/api/volume-profile?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setVolumeProfile(d as VolumeProfile); })
      .catch(() => {});

    async function fetchAndAnalyze() {
      setLoadingAnalysis(true);
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();

        const price = data?.price ?? null;
        const previousClose = data?.previousClose ?? null;
        const open = data?.open ?? null;
        const high = data?.high ?? null;
        const low = data?.low ?? null;
        const dayChangePercent =
          price && previousClose ? ((price - previousClose) / previousClose) * 100 : null;

        setQuoteData({ price, previousClose, open, high, low });

        if (price && previousClose) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, price, previousClose, open, high, low, dayChangePercent }),
          });
          const result = await analyzeRes.json();
          if (result?.signal) {
            setAnalysis(result);
            if (result.signal !== "HOLD" && result.trade?.entryZone && price) {
              try {
                const ALERTS_KEY = "traxora_price_alerts";
                const raw = localStorage.getItem(`traxora_${ALERTS_KEY}`) ?? "{}";
                const alerts = JSON.parse(raw) as Record<string, { above?: number | null; below?: number | null }>;
                const zoneStr: string = result.trade.entryZone;
                const nums = zoneStr.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
                if (nums.length >= 1) {
                  const entryTarget = result.signal === "BUY" ? Math.min(...nums) : Math.max(...nums);
                  alerts[symbol] = { ...alerts[symbol], [result.signal === "BUY" ? "below" : "above"]: entryTarget };
                  localStorage.setItem(`traxora_${ALERTS_KEY}`, JSON.stringify(alerts));
                }
              } catch { /* ignore */ }
            }
          }
        }
      } catch {
        // analysis stays null
      } finally {
        setLoadingAnalysis(false);
      }
    }

    fetchAndAnalyze();
  }, [symbol]);

  const dayChange =
    quoteData.price && quoteData.previousClose
      ? ((quoteData.price - quoteData.previousClose) / quoteData.previousClose) * 100
      : null;

  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(scopedKey("traxora_ran_analysis"))) setShowGuide(true);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (analysis) {
      try { localStorage.setItem(scopedKey("traxora_ran_analysis"), "1"); } catch { /* ignore */ }
      setShowGuide(false);
    }
  }, [analysis]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const ticker = symbol.replace(".US", "").replace(".COMM", "");
  const dollarChange = quoteData.price && quoteData.previousClose
    ? quoteData.price - quoteData.previousClose : null;

  function handlePostPlay() {
    if (!analysis) return;
    const signal = analysis.signal;
    const dir = signal === "BUY" ? "LONG" : signal === "SELL" ? "SHORT" : "HOLD";
    const emoji = signal === "BUY" ? "🟢" : signal === "SELL" ? "🔴" : "🟡";
    const lines: string[] = [];
    lines.push(`${emoji} **${ticker} — ${dir}** | Traxora AI`);
    lines.push(`Confidence: **${analysis.confidence}** | Risk: **${analysis.risk}**`);
    if (quoteData.price) lines.push(`Price: $${quoteData.price.toFixed(2)}`);
    lines.push("");
    if (analysis.trade && signal !== "HOLD") {
      const t = analysis.trade as TradePlan;
      lines.push("**Trade Setup**");
      lines.push(`Entry:  ${t.entryZone}`);
      lines.push(`Stop:   ${t.stopLoss}  (${t.stopReason})`);
      lines.push(`Target: ${t.takeProfit}  (${t.tpReason})`);
      lines.push(`R:R  →  ${t.rrRatio}`);
      lines.push("");
    }
    if (deepAnalysis?.scenarioA) {
      const s = deepAnalysis.scenarioA;
      lines.push("**Smart Money Scenario**");
      lines.push(`Entry zone: ${s.entryFrom} – ${s.entryTo}`);
      lines.push(`Stop: ${s.stopLoss}  |  T1: ${s.target1}  |  T2: ${s.target2}`);
      if (s.target3) lines.push(`T3: ${s.target3}`);
      lines.push(`R:R: ${s.rrRatio}  |  Best time: ${s.bestEntryTime}`);
      lines.push("");
    }
    lines.push(analysis.summary);
    lines.push("");
    lines.push(`📈 traxora.ai`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      const btn = document.getElementById("share-btn");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Post Play"; }, 2000); }
    });
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-7xl mx-auto w-full">

          {/* ── Price Hero ── */}
          <div className="mt-3">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight text-[#F1F5F9]">{ticker}</h1>
                <MarketStatus />
              </div>
              {analysis && (
                <button type="button" onClick={handlePostPlay} id="share-btn"
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2 rounded-xl text-sm font-semibold transition-all">
                  Post Play
                </button>
              )}
            </div>

            {/* Big price */}
            <div className="flex items-end gap-3 flex-wrap">
              {quoteData.price ? (
                <p className="text-5xl sm:text-6xl font-black tracking-tight text-[#F1F5F9] tabular-nums">
                  ${quoteData.price.toFixed(2)}
                </p>
              ) : (
                <div className="h-14 w-52 bg-[#1E1C42] rounded-2xl animate-pulse" />
              )}
              {dayChange !== null && dollarChange !== null && (
                <div className={`flex items-center gap-2 mb-1 ${dayChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  <span className="text-xl font-bold tabular-nums">
                    {dayChange >= 0 ? "+" : ""}${Math.abs(dollarChange).toFixed(2)}
                  </span>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-xl ${dayChange >= 0 ? "bg-emerald-500/15" : "bg-rose-500/15"}`}>
                    {dayChange >= 0 ? "+" : ""}{dayChange.toFixed(2)}%
                  </span>
                  <span className="text-[#4B5675] text-xs">today</span>
                </div>
              )}
            </div>

            {/* Stats strip */}
            {quoteData.price && (
              <div className="flex flex-wrap gap-2 mt-4">
                {([
                  { label: "Open",       value: quoteData.open         ? `$${quoteData.open.toFixed(2)}`         : null, color: ""                },
                  { label: "High",       value: quoteData.high         ? `$${quoteData.high.toFixed(2)}`         : null, color: "text-emerald-400" },
                  { label: "Low",        value: quoteData.low          ? `$${quoteData.low.toFixed(2)}`          : null, color: "text-rose-400"    },
                  { label: "Prev Close", value: quoteData.previousClose ? `$${quoteData.previousClose.toFixed(2)}` : null, color: ""             },
                ] as { label: string; value: string | null; color: string }[]).filter(r => r.value).map(r => (
                  <div key={r.label} className="bg-[#13112A] border border-[#252345] rounded-xl px-3.5 py-2">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">{r.label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${r.color || "text-[#F1F5F9]"}`}>{r.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 52-week range bar + key stats */}
            {quoteStats && quoteData.price && quoteStats.yearHigh && quoteStats.yearLow && (
              <div className="mt-4 bg-[#13112A] border border-[#252345] rounded-2xl p-4 space-y-4">
                {/* 52-week range */}
                <div>
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-2">52-Week Range</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-rose-400 shrink-0">${quoteStats.yearLow.toFixed(2)}</span>
                    <div className="flex-1 relative h-2 bg-[#1A1838] rounded-full overflow-visible">
                      {/* Gradient fill */}
                      <div className="absolute inset-0 bg-gradient-to-r from-rose-500/30 via-amber-400/20 to-emerald-500/30 rounded-full" />
                      {/* Current price marker */}
                      {(() => {
                        const pct = Math.max(0, Math.min(100,
                          ((quoteData.price! - quoteStats.yearLow!) / (quoteStats.yearHigh! - quoteStats.yearLow!)) * 100
                        ));
                        return (
                          <div
                            className="range-pin absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-[#0A0815] rounded-full z-10 shadow-lg"
                            style={{ "--pin-pct": `${pct}%` } as React.CSSProperties}
                            title={`$${quoteData.price!.toFixed(2)} — ${pct.toFixed(0)}% of 52-week range`}
                          />
                        );
                      })()}
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 shrink-0">${quoteStats.yearHigh.toFixed(2)}</span>
                  </div>
                  <p className="text-[9px] text-[#4B5675] mt-1 text-center">
                    {(((quoteData.price - quoteStats.yearLow) / (quoteStats.yearHigh - quoteStats.yearLow)) * 100).toFixed(0)}% of 52-week range
                    {quoteData.price >= quoteStats.yearHigh * 0.95 && <span className="text-amber-400 ml-1">· Near 52w high</span>}
                    {quoteData.price <= quoteStats.yearLow * 1.05  && <span className="text-rose-400 ml-1">· Near 52w low</span>}
                  </p>
                </div>

                {/* Key fundamentals */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#1A1838]">
                  {[
                    { label: "Market Cap",  value: quoteStats.marketCap    ? quoteStats.marketCap >= 1e12 ? `$${(quoteStats.marketCap/1e12).toFixed(2)}T` : quoteStats.marketCap >= 1e9 ? `$${(quoteStats.marketCap/1e9).toFixed(1)}B` : `$${(quoteStats.marketCap/1e6).toFixed(0)}M` : null },
                    { label: "P/E Ratio",   value: quoteStats.pe           ? quoteStats.pe.toFixed(1) : null },
                    { label: "EPS (TTM)",   value: quoteStats.eps          ? `$${quoteStats.eps.toFixed(2)}` : null },
                    { label: "Beta",        value: quoteStats.beta         ? quoteStats.beta.toFixed(2) : null },
                    { label: "Avg Volume",  value: quoteStats.avgVolume    ? quoteStats.avgVolume >= 1e6 ? `${(quoteStats.avgVolume/1e6).toFixed(1)}M` : `${(quoteStats.avgVolume/1e3).toFixed(0)}K` : null },
                    { label: "Div Yield",   value: quoteStats.dividendYield ? `${quoteStats.dividendYield.toFixed(2)}%` : null },
                  ].filter(s => s.value).map(s => (
                    <div key={s.label}>
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">{s.label}</p>
                      <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Chart ── */}
          <div className="mt-4">
            <TraxoraChart
              symbol={symbol}
              height={chartHeight}
              isExpanded={expandChart}
              onExpandToggle={() => setExpandChart(e => !e)}
              signalData={analysis && analysis.signal !== "HOLD" && analysis.trade ? {
                signal:     analysis.signal,
                confidence: analysis.confidence,
                entry:      analysis.trade.entryZone,
                stop:       analysis.trade.stopLoss,
                target:     analysis.trade.takeProfit,
                rrRatio:    analysis.trade.rrRatio,
                summary:    analysis.summary,
              } : null}
            />
          </div>

          {/* ── Banners ── */}
          {showGuide && !loadingAnalysis && !analysis && (
            <div className="mt-4 flex items-start gap-4 px-5 py-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5">
              <span className="text-2xl shrink-0">👋</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-emerald-300 mb-1">Your first analysis is loading</p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  Traxora AI is fetching live data for <strong className="text-[#F1F5F9]">{ticker}</strong>.
                  In a few seconds you&apos;ll see a <strong className="text-emerald-400">BUY</strong>, <strong className="text-amber-400">HOLD</strong>, or <strong className="text-rose-400">SELL</strong> signal with an exact entry zone, stop loss, and take profit.
                  Run <strong className="text-[#F1F5F9]">Deep Analysis</strong> below for the full institutional-grade breakdown.
                </p>
              </div>
              <button type="button" onClick={() => setShowGuide(false)} aria-label="Dismiss guide" className="text-[#4B5675] hover:text-[#7B8DB4] shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
          {overrideInfo && (
            <div className="mt-4 flex items-start gap-3 px-5 py-4 rounded-2xl border border-amber-500/30 bg-amber-500/8">
              <span className="text-xl shrink-0 mt-0.5">🔁</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-300 mb-1">Signal updated by Deep Analysis</p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  Quick scan: <strong className="text-[#F1F5F9]">{overrideInfo.from}</strong> → Deep analysis: <strong className="text-[#F1F5F9]">{overrideInfo.to}</strong>. Multi-timeframe Smart Money analysis takes precedence.
                </p>
              </div>
              <button type="button" onClick={() => setOverrideInfo(null)} aria-label="Dismiss" className="text-[#4B5675] hover:text-[#7B8DB4] shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── Signal + Trade Plan (hero row) ── */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Signal Card */}
            <div className={`card-shine glass surface-sheen rounded-2xl p-5 border ${
              analysis?.signal === "BUY"  ? "border-emerald-500/30 signal-card-buy"  :
              analysis?.signal === "SELL" ? "border-rose-500/30    signal-card-sell" :
              "border-[#252345]"
            }`}>
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Traxora AI Signal</p>

              {holding && (
                <div className="mb-3 flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">Position</span>
                  <span className="text-[10px] font-mono text-[#F1F5F9]">{holding.quantity} sh @ ${holding.avgPrice.toFixed(2)}</span>
                  {quoteData.price && (
                    <span className={`ml-auto text-[10px] font-black font-mono ${quoteData.price >= holding.avgPrice ? "text-emerald-400" : "text-rose-400"}`}>
                      {quoteData.price >= holding.avgPrice ? "+" : ""}${((quoteData.price - holding.avgPrice) * holding.quantity).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {loadingAnalysis && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-14 bg-[#1E1C42] rounded-xl" />
                  <div className="h-3 bg-[#1E1C42] rounded w-3/4" />
                  <div className="h-3 bg-[#1E1C42] rounded w-1/2" />
                </div>
              )}

              {!loadingAnalysis && analysis && (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-2xl font-black px-5 py-2.5 rounded-xl border ${signalStyle(analysis.signal)}`}>
                      {analysis.signal}
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#4B5675] uppercase tracking-wider">Confidence</span>
                        <span className={`text-xs font-bold ${confidenceStyle(analysis.confidence)}`}>{analysis.confidence}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#4B5675] uppercase tracking-wider">Risk</span>
                        <span className={`text-xs font-bold ${riskStyle(analysis.risk)}`}>{analysis.risk}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#CBD5E1] leading-relaxed mb-3">{analysis.summary}</p>

                  {analysis.signal !== "HOLD" && analysis.trade?.entryZone && (
                    <div className="mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      <span className="text-[9px] text-amber-500/80 font-medium">Alert set for entry {analysis.trade.entryZone}</span>
                    </div>
                  )}

                  {analysis.signal !== "HOLD" && (
                    <a
                      href={`/paper?symbol=${encodeURIComponent(symbol.replace(".US","").replace(".COMM",""))}&side=${analysis.signal === "BUY" ? "BUY" : "SELL"}`}
                      className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                        analysis.signal === "BUY" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-rose-600 hover:bg-rose-500 text-white"
                      }`}
                    >
                      {holding
                        ? analysis.signal === "BUY" ? "Add to Position" : "Close / Sell Position"
                        : analysis.signal === "BUY" ? "Buy Long on Paper" : "Sell Short on Paper"}
                    </a>
                  )}
                </>
              )}

              {!loadingAnalysis && !analysis && (
                <p className="text-sm text-[#4B5675]">Unable to generate signal. Market data may be unavailable.</p>
              )}
            </div>

            {/* Trade Plan */}
            {!loadingAnalysis && analysis?.trade && analysis.signal !== "HOLD" ? (() => {
              const t = analysis.trade as TradePlan;
              const isBuy = analysis.signal === "BUY";
              return (
                <div className={`card-shine glass surface-sheen gradient-border-card rounded-2xl p-5 border ${isBuy ? "border-emerald-500/25" : "border-rose-500/25"}`}>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-4">Trade Plan</p>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { label: "Entry Zone", value: t.entryZone,  color: "text-amber-400"   },
                      { label: "Stop Loss",  value: t.stopLoss,   color: "text-rose-400"    },
                      { label: "Take Profit",value: t.takeProfit, color: "text-emerald-400" },
                    ].map(r => (
                      <div key={r.label} className="bg-[#0D0B1A] rounded-xl p-3 text-center">
                        <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1.5">{r.label}</p>
                        <p className={`text-[11px] font-mono font-black leading-tight ${r.color}`}>{r.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 text-[10px] text-[#7B8DB4] mb-4">
                    {[
                      { arrow: "text-amber-400",   label: "Entry",  reason: t.entryReason },
                      { arrow: "text-rose-400",     label: "Stop",   reason: t.stopReason  },
                      { arrow: "text-emerald-400",  label: "Target", reason: t.tpReason    },
                    ].map(r => (
                      <div key={r.label} className="flex items-start gap-2">
                        <span className={`${r.arrow} font-bold shrink-0 mt-px`}>↳</span>
                        <span><span className="text-[#4B5675] font-semibold">{r.label}: </span>{r.reason}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[9px] text-[#4B5675] uppercase tracking-widest">Risk / Reward</span>
                    <span className={`text-lg font-black font-mono ${isBuy ? "text-emerald-400" : "text-rose-400"}`}>{t.rrRatio}</span>
                  </div>
                </div>
              );
            })() : (
              <div className="card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345] flex flex-col items-center justify-center gap-3 text-center min-h-[200px]">
                {loadingAnalysis ? (
                  <div className="space-y-3 w-full animate-pulse">
                    <div className="h-20 bg-[#1E1C42] rounded-xl" />
                    <div className="h-3 bg-[#1E1C42] rounded w-2/3 mx-auto" />
                  </div>
                ) : (
                  <>
                    <p className="text-3xl">📋</p>
                    <p className="text-xs text-[#4B5675]">Trade plan appears here after signal loads.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Analyst Ratings ── */}
          <div className="mt-4">
            <AnalystRatings symbol={symbol} currentPrice={quoteData.price} />
          </div>

          {/* ── Analysis detail cards ── */}
          {(analysis?.keyPoints?.length || analysis?.signals || (quoteData.price && quoteData.high && quoteData.low)) ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
                <div className="card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345]">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Key Observations</p>
                  <ul className="space-y-2">
                    {analysis.keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#CBD5E1]">
                        <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.signals && (
                <div className="card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345]">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Price Structure</p>
                  <div className="flex gap-2 mb-3">
                    {[
                      { label: "Structure", val: analysis.signals.marketStructure },
                      { label: "Bias",      val: analysis.signals.dailyBias       },
                      { label: "Zone",      val: analysis.signals.priceZone       },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex-1 bg-[#0D0B1A] rounded-xl p-2.5">
                        <p className="text-[9px] text-[#4B5675] mb-1">{label}</p>
                        <p className={`text-xs font-bold ${val === "Bullish" || val === "Discount" ? "text-emerald-400" : val === "Bearish" || val === "Premium" ? "text-rose-400" : "text-amber-400"}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[
                      { tag: "Key Level", color: "text-teal-400", text: analysis.signals.orderBlock   },
                      { tag: "Price Gap", color: "text-blue-400", text: analysis.signals.fairValueGap },
                      { tag: "Best Entry",color: "text-cyan-400", text: analysis.signals.ote          },
                    ].filter(r => r.text).map(({ tag, color, text }) => (
                      <div key={tag} className="flex gap-2">
                        <span className={`text-[10px] font-black shrink-0 mt-0.5 w-16 ${color}`}>{tag}</span>
                        <p className="text-[11px] text-[#CBD5E1] leading-snug">{text}</p>
                      </div>
                    ))}
                    <div className="mt-1 rounded-xl bg-amber-500/5 border border-amber-500/20 p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">Take-Profit Targets</span>
                        <span className="text-[7px] text-[#4B5675]">price draws to these</span>
                      </div>
                      <p className="text-[11px] text-[#CBD5E1] leading-snug">{analysis.signals.liquidity}</p>
                      {analysis.signals.bslPrice != null && analysis.signals.sslPrice != null && (
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">↑ ${analysis.signals.bslPrice.toFixed(2)}</span>
                          <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">↓ ${analysis.signals.sslPrice.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    {analysis.signals.immediateRebalance && (
                      <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[8px] font-black text-violet-400 uppercase tracking-widest">Session Gap</span>
                          <span className="text-[7px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-px rounded font-bold">ENTRY ZONE</span>
                        </div>
                        <p className="text-[11px] text-[#CBD5E1] leading-snug">{analysis.signals.immediateRebalance}</p>
                      </div>
                    )}
                    {analysis.signals.setup && (
                      <div className="pt-2 border-t border-[#252345]">
                        <p className="text-[9px] text-[#4B5675] mb-1">Confluence note</p>
                        <p className="text-[11px] text-white leading-snug">{analysis.signals.setup}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {quoteData.price && quoteData.high && quoteData.low && (
                <MarketDepth price={quoteData.price} high={quoteData.high} low={quoteData.low} symbol={symbol} />
              )}
            </div>
          ) : null}

          {/* ── Volume Profile + News ── */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

            {volumeProfile && (
              <div className="card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345]">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Volume Profile (60-day)</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: "POC", value: `$${volumeProfile.poc.toFixed(2)}`, color: "text-yellow-400", desc: "Highest volume"   },
                    { label: "VAH", value: `$${volumeProfile.vah.toFixed(2)}`, color: "text-emerald-400", desc: "Value area top"   },
                    { label: "VAL", value: `$${volumeProfile.val.toFixed(2)}`, color: "text-rose-400",    desc: "Value area bottom" },
                  ].map(({ label, value, color, desc }) => (
                    <div key={label} className="bg-[#0D0B1A] rounded-xl p-2.5 text-center">
                      <p className={`text-xs font-black ${color}`}>{label}</p>
                      <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">{value}</p>
                      <p className="text-[9px] text-[#4B5675] mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>
                {quoteData.price && (
                  <div className="mb-4 p-3 rounded-xl bg-[#0D0B1A] border border-[#252345]">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Price Position</p>
                    <p className={`text-xs font-bold ${
                      quoteData.price > volumeProfile.vah ? "text-rose-400" :
                      quoteData.price < volumeProfile.val ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {quoteData.price > volumeProfile.vah
                        ? `▲ Above value area — premium (${((quoteData.price - volumeProfile.vah) / volumeProfile.vah * 100).toFixed(1)}% above VAH)`
                        : quoteData.price < volumeProfile.val
                        ? `▼ Below value area — discount (${((volumeProfile.val - quoteData.price) / volumeProfile.val * 100).toFixed(1)}% below VAL)`
                        : "◆ Inside value area — balanced market"}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-2">Key Volume Nodes</p>
                  {volumeProfile.nodes.filter(n => n.type !== "normal").sort((a, b) => b.price - a.price).slice(0, 6).map(node => (
                    <div key={node.price} className="flex items-center gap-2">
                      <span className={`text-[9px] font-black w-8 shrink-0 ${node.type === "HVN" ? "text-emerald-400" : "text-rose-400"}`}>{node.type}</span>
                      <span className="text-[11px] text-[#F1F5F9] font-mono w-16 shrink-0">${node.price.toFixed(2)}</span>
                      <div className="flex-1 flex gap-0.5">
                        {Array.from({ length: 8 }).map((_, i) => {
                          const maxVol = volumeProfile.nodes.reduce((m, n) => Math.max(m, n.volume), 1);
                          const filled = Math.round(node.volume / maxVol * 8) > i;
                          return <div key={i} className={`flex-1 h-1.5 rounded-sm ${filled ? node.type === "HVN" ? "bg-emerald-500/60" : "bg-rose-500/40" : "bg-[#0D0B1A]"}`} />;
                        })}
                      </div>
                      <span className="text-[9px] text-[#4B5675] shrink-0">{node.type === "HVN" ? "S/R" : "Fast move"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* News — card style */}
            <div className="card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345]">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Latest News</p>
              {newsLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="animate-pulse rounded-xl bg-[#0D0B1A] h-16" />
                  ))}
                </div>
              ) : news.length === 0 ? (
                <p className="text-xs text-[#4B5675]">No recent news found.</p>
              ) : (
                <div className="space-y-2">
                  {news.map((item, i) => (
                    <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-3 rounded-xl bg-[#0D0B1A] hover:bg-[#13112A] border border-[#252345] hover:border-emerald-500/20 p-3.5 transition-all">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#F1F5F9] group-hover:text-emerald-300 transition-colors line-clamp-2 leading-snug">{item.title}</p>
                        <p className="text-[10px] text-[#4B5675] mt-1.5">
                          {item.source}{item.pubDate ? ` · ${new Date(item.pubDate).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                        </p>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="shrink-0 mt-0.5 text-[#4B5675] group-hover:text-emerald-400 transition-colors">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── AI Deep Dive ── */}
          <div className="mt-4 card-shine glass surface-sheen rounded-2xl p-5 border border-[#252345]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🔍</span>
                <p className="text-sm font-bold text-[#F1F5F9]">AI Deep Dive</p>
                <span className="text-[9px] text-[#4B5675] bg-[#0D0B1A] border border-[#252345] px-2 py-0.5 rounded-full">6 Smart Money concepts</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={runDeepAnalysis} disabled={loadingDeep}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all text-white">
                  {loadingDeep ? DEEP_STEPS[deepStep] : deepAnalysis ? "↺ Re-run" : "Deep Analysis"}
                </button>
                <button type="button" onClick={runProAnalysis} disabled={loadingPro}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1C1933] hover:bg-[#252345] border border-[#252345] disabled:opacity-50 transition-all text-[#7B8DB4] hover:text-[#F1F5F9]">
                  {loadingPro ? PRO_STEPS[proStep] : proAnalysis ? "↺ Re-run" : "Advanced Check"}
                </button>
              </div>
            </div>

            {(loadingDeep || loadingPro) && (
              <div className="mt-4 flex gap-8 flex-wrap">
                {loadingDeep && (
                  <div className="space-y-1.5">
                    {DEEP_STEPS.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${i < deepStep ? "bg-emerald-500" : i === deepStep ? "bg-emerald-400 animate-pulse" : "bg-[#252345]"}`} />
                        <span className={`text-[9px] transition-all ${i < deepStep ? "text-emerald-600 line-through" : i === deepStep ? "text-[#CBD5E1]" : "text-[#252345]"}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {loadingPro && (
                  <div className="space-y-1.5">
                    {PRO_STEPS.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${i < proStep ? "bg-violet-500" : i === proStep ? "bg-violet-400 animate-pulse" : "bg-[#252345]"}`} />
                        <span className={`text-[9px] transition-all ${i < proStep ? "text-violet-600 line-through" : i === proStep ? "text-[#CBD5E1]" : "text-[#252345]"}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {deepError && <p className="mt-3 text-xs text-rose-400">{deepError}</p>}
            {proError  && <p className="mt-3 text-xs text-rose-400">{proError}</p>}
          </div>

          {/* ── Deep Market + Pro Analysis Results (full width) ── */}
          {deepAnalysis && <DeepMarketPanel data={deepAnalysis} symbol={symbol} />}
          {proAnalysis  && <ProAnalysisPanel data={proAnalysis} symbol={symbol} />}
        </div>
      </main>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <PaywallGuard>
      <Suspense
        fallback={
          <div className="flex min-h-screen text-[#F1F5F9] items-center justify-center">
            <div className="text-[#4B5675] text-sm">Loading analysis…</div>
          </div>
        }
      >
        <AnalysisContent />
      </Suspense>
    </PaywallGuard>
  );
}
