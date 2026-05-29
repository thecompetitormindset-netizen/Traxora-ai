"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import dynamic from "next/dynamic";
const StockChart = dynamic(() => import("@/app/components/StockChart"), {
  ssr: false,
});
import MarketStatus from "@/app/components/MarketStatus";
import { getPortfolio } from "@/app/lib/trading";
import type { AIAnalysis, DeepICT } from "@/app/components/analysis/types";
import { signalStyle, riskStyle, confidenceStyle } from "@/app/components/analysis/types";
import DeepMarketPanel from "@/app/components/analysis/DeepMarketPanel";
import MarketDepth from "@/app/components/analysis/MarketDepth";

// ── Main Analysis Component ───────────────────────────────────────────────────

function AnalysisContent() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [deepICT, setDeepICT] = useState<DeepICT | null>(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

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

  // Keep the quick-signal panel in sync with the deep ICT result so they never contradict
  useEffect(() => {
    if (!deepICT) return;
    const mapped: "BUY" | "HOLD" | "SELL" =
      deepICT.overallBias === "BULLISH" ? "BUY" :
      deepICT.overallBias === "BEARISH" ? "SELL" : "HOLD";
    setAnalysis(prev =>
      prev
        ? { ...prev, signal: mapped, confidence: deepICT.confidence }
        : { signal: mapped, confidence: deepICT.confidence, summary: deepICT.biasReasoning, keyPoints: [], risk: "Medium" as const }
    );
  }, [deepICT]);

  async function runDeepICT() {
    setLoadingDeep(true);
    setDeepError(null);
    setDeepICT(null);
    try {
      const res = await fetch("/api/ai/ict-analysis", {
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
      setDeepICT(data as DeepICT);
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingDeep(false);
    }
  }

  const [expandChart, setExpandChart] = useState(false);

  const [quoteData, setQuoteData] = useState<{
    price: number | null;
    previousClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
  }>({ price: null, previousClose: null, open: null, high: null, low: null });

  useEffect(() => {
    setAnalysis(null);
    setQuoteData({
      price: null,
      previousClose: null,
      open: null,
      high: null,
      low: null,
    });

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
          if (result?.signal) setAnalysis(result);
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
                    const url = window.location.href;
                    const text = `Traxora AI just fired a ${analysis.signal} signal on ${symbol.replace(".US", "").replace(".COMM", "")} with ${analysis.confidence} confidence.\n\nFree smart money signals → ${window.location.origin}`;
                    navigator.clipboard
                      .writeText(`${text}\n\n${url}`)
                      .then(() => {
                        const btn = document.getElementById("share-btn");
                        if (btn) {
                          btn.textContent = "Copied!";
                          setTimeout(() => {
                            btn.textContent = "Share Signal";
                          }, 2000);
                        }
                      });
                  }}
                  id="share-btn"
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                >
                  Share Signal
                </button>
              )}
            </div>
          </div>

          {/* ── Chart — always full width ── */}
          <div className="mt-6 relative">
            <StockChart symbol={symbol} height={expandChart ? 680 : 460} defaultInterval="D" />
            <button
              type="button"
              onClick={() => setExpandChart(e => !e)}
              title={expandChart ? "Collapse chart" : "Expand chart"}
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-[#13112A]/90 border border-[#252345] hover:border-emerald-500/40 text-[#7B8DB4] hover:text-emerald-400 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all backdrop-blur-sm"
            >
              {expandChart ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                  </svg>
                  Collapse
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                  Expand
                </>
              )}
            </button>
          </div>

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

              {/* Paper Trade CTA */}
              {!loadingAnalysis && analysis && analysis.signal !== "HOLD" && (
                <a
                  href={`/paper?symbol=${encodeURIComponent(symbol.replace(".US","").replace(".COMM",""))}&side=${analysis.signal === "BUY" ? "BUY" : "SELL"}`}
                  className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                    analysis.signal === "BUY" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-rose-600 hover:bg-rose-500 text-white"
                  }`}
                >
                  {holding
                    ? analysis.signal === "BUY" ? "Add to Position" : "Close / Sell Position"
                    : analysis.signal === "BUY" ? "Buy Long on Paper" : "Sell Short on Paper"}
                </a>
              )}
            </div>

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

            {/* ICT Smart Money */}
            {analysis?.ict && (
              <div className="bg-[#13112A] rounded-2xl p-5 border border-[#252345]">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Smart Money Structure</p>
                <div className="flex gap-2 mb-3">
                  {[
                    { label: "Structure", val: analysis.ict.marketStructure },
                    { label: "Bias",      val: analysis.ict.dailyBias       },
                    { label: "Zone",      val: analysis.ict.priceZone       },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex-1 bg-[#0D0B1A] rounded-xl p-2.5">
                      <p className="text-[9px] text-[#4B5675] mb-1">{label}</p>
                      <p className={`text-xs font-bold ${val === "Bullish" || val === "Discount" ? "text-emerald-400" : val === "Bearish" || val === "Premium" ? "text-rose-400" : "text-amber-400"}`}>{val}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { tag: "OB",  color: "text-teal-400", text: analysis.ict.orderBlock    },
                    { tag: "FVG", color: "text-blue-400",   text: analysis.ict.fairValueGap  },
                    { tag: "LIQ", color: "text-yellow-400", text: analysis.ict.liquidity     },
                    { tag: "OTE", color: "text-cyan-400",   text: analysis.ict.ote           },
                  ].filter(r => r.text).map(({ tag, color, text }) => (
                    <div key={tag} className="flex gap-2">
                      <span className={`text-[10px] font-black w-7 shrink-0 mt-0.5 ${color}`}>{tag}</span>
                      <p className="text-[11px] text-[#CBD5E1] leading-snug">{text}</p>
                    </div>
                  ))}
                  {analysis.ict.setup && (
                    <div className="mt-2 pt-2 border-t border-[#252345]">
                      <p className="text-[9px] text-[#4B5675] mb-1">Primary Setup</p>
                      <p className="text-[11px] text-white leading-snug">{analysis.ict.setup}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Depth */}
            {quoteData.price && quoteData.high && quoteData.low && (
              <MarketDepth price={quoteData.price} high={quoteData.high} low={quoteData.low} symbol={symbol} />
            )}

            {/* Deep ICT Analysis trigger */}
            <div className="bg-[#13112A] rounded-2xl p-5 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <span>🎯</span>
                <p className="text-sm font-bold text-[#F1F5F9]">Deep Market Analysis</p>
              </div>
              <p className="text-xs text-[#4B5675] leading-relaxed mb-4">
                Full institutional breakdown — OBs, FVGs, liquidity, OTE zones, and two trade setups with exact entry/SL/TP.
              </p>
              <button
                type="button"
                onClick={runDeepICT}
                disabled={loadingDeep}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all text-white flex items-center justify-center gap-2"
              >
                {loadingDeep ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Analyzing…
                  </>
                ) : deepICT ? "Re-run Deep Analysis" : "Run Deep Market Analysis"}
              </button>
              {deepError && <p className="text-xs text-rose-400 mt-2 text-center">{deepError}</p>}
            </div>
          </div>

          {/* ── Deep ICT Analysis Results (full width) ── */}
          {deepICT && <DeepMarketPanel data={deepICT} symbol={symbol} />}
        </div>
      </main>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen text-[#F1F5F9] items-center justify-center">
          <div className="text-[#4B5675] text-sm">Loading analysis…</div>
        </div>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}
