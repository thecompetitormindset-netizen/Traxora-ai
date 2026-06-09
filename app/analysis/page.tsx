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

  // Current portfolio holding for this symbol
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
      // Read as text first so a non-JSON error page doesn't obscure the real error
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

  useEffect(() => {
    setAnalysis(null);
    setVolumeProfile(null);
    setQuoteData({
      price: null,
      previousClose: null,
      open: null,
      high: null,
      low: null,
    });

    // Fetch volume profile in background
    fetch(`/api/volume-profile?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setVolumeProfile(d as VolumeProfile); })
      .catch(() => {});

    async function fetchAndAnalyze() {
      setLoadingAnalysis(true);
      try {
        const res = await fetch(
          `/api/quote?symbol=${encodeURIComponent(symbol)}`,
        );
        const data = await res.json();

        const price = data?.price ?? null;
        const previousClose = data?.previousClose ?? null;
        const open = data?.open ?? null;
        const high = data?.high ?? null;
        const low = data?.low ?? null;
        const dayChangePercent =
          price && previousClose
            ? ((price - previousClose) / previousClose) * 100
            : null;

        setQuoteData({ price, previousClose, open, high, low });

        if (price && previousClose) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol,
              price,
              previousClose,
              open,
              high,
              low,
              dayChangePercent,
            }),
          });
          const result = await analyzeRes.json();
          if (result?.signal) {
            setAnalysis(result);
            // Auto-set entry zone price alert so user gets notified when price reaches their zone
            if (result.signal !== "HOLD" && result.trade?.entryZone && price) {
              try {
                const ALERTS_KEY = "traxora_price_alerts";
                const raw = localStorage.getItem(`traxora_${ALERTS_KEY}`) ?? "{}";
                const alerts = JSON.parse(raw) as Record<string, { above?: number | null; below?: number | null }>;
                const zoneStr: string = result.trade.entryZone;
                const nums = zoneStr.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
                if (nums.length >= 1) {
                  const entryTarget = result.signal === "BUY" ? Math.min(...nums) : Math.max(...nums);
                  alerts[symbol] = {
                    ...alerts[symbol],
                    [result.signal === "BUY" ? "below" : "above"]: entryTarget,
                  };
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
      ? ((quoteData.price - quoteData.previousClose) /
          quoteData.previousClose) *
        100
      : null;

  const [showGuide, setShowGuide] = useState(false); // initialized in effect after user is known

  // Show guide only for users who haven't run analysis yet — read after _userId is set by Topbar effect
  useEffect(() => {
    try {
      if (!localStorage.getItem(scopedKey("traxora_ran_analysis"))) setShowGuide(true);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty dep: runs once after mount, by which time Topbar's setCurrentUser effect has also run

  useEffect(() => {
    if (analysis) {
      try { localStorage.setItem(scopedKey("traxora_ran_analysis"), "1"); } catch { /* ignore */ }
      setShowGuide(false);
    }
  }, [analysis]);

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">
          <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">
                {symbol.replace(".US", "").replace(".COMM", "")} Analysis
              </h1>
              <p className="text-[#7B8DB4] mt-2">
                AI-powered market signal for {symbol}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <MarketStatus />
              {analysis && (
                <button
                  type="button"
                  onClick={() => {
                    const ticker = symbol.replace(".US", "").replace(".COMM", "");
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

                    if (deepAnalysis && deepAnalysis.scenarioA) {
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

                    const text = lines.join("\n");
                    navigator.clipboard.writeText(text).then(() => {
                      const btn = document.getElementById("share-btn");
                      if (btn) {
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = "Post Play"; }, 2000);
                      }
                    });
                  }}
                  id="share-btn"
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                >
                  Post Play
                </button>
              )}
            </div>
          </div>

          {/* ── Chart — always full width ── */}
          <div className="mt-6">
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

          {/* ── First-signal guide banner ── */}
          {showGuide && !loadingAnalysis && !analysis && (
            <div className="mt-4 flex items-start gap-4 px-5 py-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5">
              <span className="text-2xl shrink-0">👋</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-emerald-300 mb-1">Your first analysis is loading</p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  Traxora AI is fetching live data for <strong className="text-[#F1F5F9]">{symbol.replace(".US","").replace(".COMM","")}</strong>.
                  In a few seconds you&apos;ll see a <strong className="text-emerald-400">BUY</strong>, <strong className="text-amber-400">HOLD</strong>, or <strong className="text-rose-400">SELL</strong> signal with an exact entry zone, stop loss, and take profit.
                  Run <strong className="text-[#F1F5F9]">Deep Analysis</strong> below for the full institutional-grade breakdown.
                </p>
              </div>
              <button type="button" onClick={() => setShowGuide(false)} aria-label="Dismiss guide" className="text-[#4B5675] hover:text-[#7B8DB4] shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* ── Deep analysis signal override banner ── */}
          {overrideInfo && (
            <div className="mt-4 flex items-start gap-3 px-5 py-4 rounded-2xl border border-amber-500/30 bg-amber-500/8">
              <span className="text-xl shrink-0 mt-0.5">🔁</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-300 mb-1">Signal updated by Deep Analysis</p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  The quick scan showed <strong className="text-[#F1F5F9]">{overrideInfo.from}</strong>, but the full institutional analysis found{" "}
                  <strong className="text-[#F1F5F9]">{overrideInfo.to}</strong>. Deep Analysis uses 6 Smart Money concepts, IV data, and multi-timeframe structure — it takes precedence.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideInfo(null)}
                aria-label="Dismiss"
                className="text-[#4B5675] hover:text-[#7B8DB4] shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── Info panels — always below chart in a grid ── */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Signal Card */}
            <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Traxora AI Signal</p>

              {/* Current portfolio position for this symbol */}
              {holding && (
                <div className="mb-3 flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">Position</span>
                  <span className="text-[10px] font-mono text-[#F1F5F9]">{holding.quantity} sh @ ${holding.avgPrice.toFixed(2)}</span>
                  {quoteData.price && (
                    <span className={`ml-auto text-[10px] font-black font-mono ${
                      quoteData.price >= holding.avgPrice ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {quoteData.price >= holding.avgPrice ? "+" : ""}
                      ${((quoteData.price - holding.avgPrice) * holding.quantity).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {loadingAnalysis && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-10 bg-[#1E1C42] rounded-xl" />
                  <div className="h-3 bg-[#1E1C42] rounded w-3/4" />
                  <div className="h-3 bg-[#1E1C42] rounded w-1/2" />
                </div>
              )}

              {!loadingAnalysis && analysis && (
                <>
                  <span className={`inline-block text-xl font-bold px-4 py-2 rounded-xl border ${signalStyle(analysis.signal)}`}>
                    {analysis.signal}
                  </span>
                  <div className="flex items-center gap-4 mt-3">
                    <div>
                      <p className="text-[10px] text-[#4B5675]">Confidence</p>
                      <p className={`text-sm font-semibold mt-0.5 ${confidenceStyle(analysis.confidence)}`}>{analysis.confidence}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#4B5675]">Risk</p>
                      <p className={`text-sm font-semibold mt-0.5 ${riskStyle(analysis.risk)}`}>{analysis.risk}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#CBD5E1] mt-3 leading-relaxed">{analysis.summary}</p>
                </>
              )}

              {!loadingAnalysis && !analysis && (
                <p className="text-sm text-[#4B5675]">Unable to generate signal. Market data may be unavailable.</p>
              )}

              {/* Entry zone alert badge */}
              {!loadingAnalysis && analysis && analysis.signal !== "HOLD" && analysis.trade?.entryZone && (
                <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  <span className="text-[9px] text-amber-500/80 font-medium">Price alert auto-set for entry zone {analysis.trade.entryZone}</span>
                </div>
              )}

              {/* Paper Trade CTA */}
              {!loadingAnalysis && analysis && analysis.signal !== "HOLD" && (
                <a
                  href={`/paper?symbol=${encodeURIComponent(symbol.replace(".US","").replace(".COMM",""))}&side=${analysis.signal === "BUY" ? "BUY" : "SELL"}`}
                  className={`mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                    analysis.signal === "BUY" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-rose-600 hover:bg-rose-500 text-white"
                  }`}
                >
                  {holding
                    ? analysis.signal === "BUY" ? "Add to Position" : "Close / Sell Position"
                    : analysis.signal === "BUY" ? "Buy Long on Paper" : "Sell Short on Paper"}
                </a>
              )}
            </div>

            {/* Trade Plan */}
            {!loadingAnalysis && analysis?.trade && analysis.signal !== "HOLD" && (() => {
              const t = analysis.trade as TradePlan;
              const isBuy = analysis.signal === "BUY";
              return (
                <div className={`bg-[#13112A] rounded-2xl p-5 border ${isBuy ? "border-emerald-500/25" : "border-rose-500/25"}`}>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Trade Plan</p>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-[#0D0B1A] rounded-xl p-3 text-center">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Entry Zone</p>
                      <p className="text-[11px] font-mono font-black text-amber-400 leading-tight">{t.entryZone}</p>
                    </div>
                    <div className="bg-[#0D0B1A] rounded-xl p-3 text-center">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Stop Loss</p>
                      <p className="text-sm font-mono font-black text-rose-400">{t.stopLoss}</p>
                    </div>
                    <div className="bg-[#0D0B1A] rounded-xl p-3 text-center">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Take Profit</p>
                      <p className="text-sm font-mono font-black text-emerald-400">{t.takeProfit}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-[10px] text-[#7B8DB4]">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0 mt-px">↳</span>
                      <span><span className="text-[#4B5675] font-semibold">Entry: </span>{t.entryReason}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold shrink-0 mt-px">↳</span>
                      <span><span className="text-[#4B5675] font-semibold">Stop: </span>{t.stopReason}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold shrink-0 mt-px">↳</span>
                      <span><span className="text-[#4B5675] font-semibold">Target: </span>{t.tpReason}</span>
                    </div>
                  </div>

                  <div className={`mt-3 pt-3 border-t border-white/5 flex items-center justify-between`}>
                    <span className="text-[9px] text-[#4B5675] uppercase tracking-widest">Risk/Reward</span>
                    <span className={`text-sm font-black font-mono ${isBuy ? "text-emerald-400" : "text-rose-400"}`}>{t.rrRatio}</span>
                  </div>
                </div>
              );
            })()}

            {/* Price Snapshot */}
            <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Price Snapshot</p>
              {quoteData.price ? (
                <div className="space-y-2">
                  {[
                    { label: "Current",    value: `$${quoteData.price.toFixed(2)}`,        color: "text-white font-semibold" },
                    dayChange !== null ? { label: "Day Change", value: `${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)}%`, color: dayChange >= 0 ? "text-emerald-400" : "text-rose-400" } : null,
                    quoteData.open   ? { label: "Open",       value: `$${quoteData.open.toFixed(2)}`,          color: "text-white" } : null,
                    quoteData.high   ? { label: "High",       value: `$${quoteData.high.toFixed(2)}`,          color: "text-white" } : null,
                    quoteData.low    ? { label: "Low",        value: `$${quoteData.low.toFixed(2)}`,           color: "text-white" } : null,
                    quoteData.previousClose ? { label: "Prev. Close", value: `$${quoteData.previousClose.toFixed(2)}`, color: "text-white" } : null,
                  ].filter(Boolean).map((row) => (
                    <div key={row!.label} className="flex justify-between text-sm">
                      <span className="text-[#7B8DB4]">{row!.label}</span>
                      <span className={row!.color}>{row!.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#4B5675] animate-pulse">Loading…</p>
              )}
            </div>

            {/* Key Observations */}
            {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
              <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
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

            {/* Smart Money Structure */}
            {analysis?.signals && (
              <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
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

                  {/* Liquidity levels — shown as take-profit targets, not entry signals */}
                  <div className="mt-1 rounded-xl bg-amber-500/5 border border-amber-500/20 p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">Take-Profit Targets</span>
                      <span className="text-[7px] text-[#4B5675]">price draws to these levels</span>
                    </div>
                    <p className="text-[11px] text-[#CBD5E1] leading-snug">{analysis.signals.liquidity}</p>
                    {analysis.signals.bslPrice != null && analysis.signals.sslPrice != null && (
                      <div className="flex gap-2 mt-1.5">
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">↑ Target ${analysis.signals.bslPrice.toFixed(2)}</span>
                        <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">↓ Support ${analysis.signals.sslPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {/* Session gap / immediate rebalance */}
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
                    <div className="mt-1 pt-2 border-t border-[#252345]">
                      <p className="text-[9px] text-[#4B5675] mb-1">Confluence note</p>
                      <p className="text-[11px] text-white leading-snug">{analysis.signals.setup}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Depth */}
            {quoteData.price && quoteData.high && quoteData.low && (
              <MarketDepth price={quoteData.price} high={quoteData.high} low={quoteData.low} symbol={symbol} />
            )}

            {/* Volume Profile */}
            {volumeProfile && (
              <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Volume Profile (60-day)</p>

                {/* Key levels */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: "POC", value: `$${volumeProfile.poc.toFixed(2)}`, color: "text-yellow-400", desc: "Highest volume" },
                    { label: "VAH", value: `$${volumeProfile.vah.toFixed(2)}`, color: "text-emerald-400", desc: "Value area top" },
                    { label: "VAL", value: `$${volumeProfile.val.toFixed(2)}`, color: "text-rose-400",   desc: "Value area bottom" },
                  ].map(({ label, value, color, desc }) => (
                    <div key={label} className="bg-[#0D0B1A] rounded-xl p-2.5 text-center">
                      <p className={`text-xs font-black ${color}`}>{label}</p>
                      <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">{value}</p>
                      <p className="text-[9px] text-[#4B5675] mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>

                {/* Price position relative to value area */}
                {quoteData.price && (
                  <div className="mb-4 p-3 rounded-xl bg-[#0D0B1A] border border-[#252345]">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Current Price Position</p>
                    <p className={`text-xs font-bold ${
                      quoteData.price > volumeProfile.vah ? "text-rose-400" :
                      quoteData.price < volumeProfile.val ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {quoteData.price > volumeProfile.vah
                        ? `▲ Trading ABOVE value area — premium zone (${((quoteData.price - volumeProfile.vah) / volumeProfile.vah * 100).toFixed(1)}% above VAH)`
                        : quoteData.price < volumeProfile.val
                        ? `▼ Trading BELOW value area — discount zone (${((volumeProfile.val - quoteData.price) / volumeProfile.val * 100).toFixed(1)}% below VAL)`
                        : "◆ Trading INSIDE value area — balanced market"}
                    </p>
                  </div>
                )}

                {/* HVN / LVN nodes */}
                <div className="space-y-1.5">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-2">Key Volume Nodes</p>
                  {volumeProfile.nodes
                    .filter(n => n.type !== "normal")
                    .sort((a, b) => b.price - a.price)
                    .slice(0, 6)
                    .map(node => (
                      <div key={node.price} className="flex items-center gap-2">
                        <span className={`text-[9px] font-black w-8 shrink-0 ${node.type === "HVN" ? "text-emerald-400" : "text-rose-400"}`}>
                          {node.type}
                        </span>
                        <span className="text-[11px] text-[#F1F5F9] font-mono w-16 shrink-0">${node.price.toFixed(2)}</span>
                        <div className="flex-1 flex gap-0.5">
                          {Array.from({ length: 8 }).map((_, i) => {
                            const maxVol = volumeProfile.nodes.reduce((m, n) => Math.max(m, n.volume), 1);
                            const pct = node.volume / maxVol;
                            const filled = Math.round(pct * 8) > i;
                            return (
                              <div key={i} className={`flex-1 h-1.5 rounded-sm ${filled ? node.type === "HVN" ? "bg-emerald-500/60" : "bg-rose-500/40" : "bg-[#0D0B1A]"}`} />
                            );
                          })}
                        </div>
                        <span className="text-[9px] text-[#4B5675] shrink-0">
                          {node.type === "HVN" ? "Support/Resistance" : "Fast move zone"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* News feed */}
            <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
              <p className="text-sm font-semibold mb-3">Latest News</p>
              {newsLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-3 bg-[#252345] rounded w-full mb-1" />
                      <div className="h-2.5 bg-[#252345] rounded w-2/3" />
                    </div>
                  ))}
                </div>
              ) : news.length === 0 ? (
                <p className="text-xs text-[#4B5675]">No recent news found.</p>
              ) : (
                <ul className="space-y-3">
                  {news.map((item, i) => (
                    <li key={i}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <p className="text-xs text-[#F1F5F9] leading-snug group-hover:text-emerald-400 transition-colors line-clamp-2">{item.title}</p>
                        <p className="text-[10px] text-[#4B5675] mt-0.5">
                          {item.source}
                          {item.pubDate ? ` · ${new Date(item.pubDate).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* AI Deep Dive */}
            <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345] space-y-3">
              <div className="flex items-center gap-2">
                <span>🔍</span>
                <p className="text-sm font-bold text-[#F1F5F9]">AI Deep Dive</p>
              </div>
              <p className="text-xs text-[#4B5675] leading-relaxed">
                Full breakdown across all timeframes — key levels, price gaps, entry zone, stop, and two complete trade setups.
              </p>

              {/* Standard deep analysis */}
              <button
                type="button"
                onClick={runDeepAnalysis}
                disabled={loadingDeep}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all text-white"
              >
                {loadingDeep ? DEEP_STEPS[deepStep] : deepAnalysis ? "↺ Run Again" : "Run Deep Analysis"}
              </button>
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
              {deepError && <p className="text-xs text-rose-400 text-center">{deepError}</p>}

              {/* Advanced check — runs additional risk gates */}
              <div className="pt-2 border-t border-[#1C1933]">
                <p className="text-[10px] text-[#4B5675] mb-2">Advanced — checks risk gates, volatility, and position sizing before you enter</p>
                <button
                  type="button"
                  onClick={runProAnalysis}
                  disabled={loadingPro}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-[#1C1933] hover:bg-[#252345] border border-[#252345] disabled:opacity-50 transition-all text-[#7B8DB4] hover:text-[#F1F5F9]"
                >
                  {loadingPro ? PRO_STEPS[proStep] : proAnalysis ? "↺ Re-run Advanced Check" : "Run Advanced Check"}
                </button>
                {loadingPro && (
                  <div className="mt-2 space-y-1.5">
                    {PRO_STEPS.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${i < proStep ? "bg-violet-500" : i === proStep ? "bg-violet-400 animate-pulse" : "bg-[#252345]"}`} />
                        <span className={`text-[9px] transition-all ${i < proStep ? "text-violet-600 line-through" : i === proStep ? "text-[#CBD5E1]" : "text-[#252345]"}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {proError && <p className="text-xs text-rose-400 text-center">{proError}</p>}
              </div>
            </div>
          </div>

          {/* ── Deep Market Analysis Results (full width) ── */}
          {deepAnalysis && <DeepMarketPanel data={deepAnalysis} symbol={symbol} />}

          {/* ── Pro Analysis Results (full width) ── */}
          {proAnalysis && <ProAnalysisPanel data={proAnalysis} symbol={symbol} />}
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
