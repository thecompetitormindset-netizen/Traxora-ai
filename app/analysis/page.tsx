"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import AnalysisChart from "@/app/components/AnalysisChart";
import ComparisonPanel from "@/app/components/ComparisonPanel";

type ICTAnalysis = {
  marketStructure: "Bullish" | "Bearish" | "Ranging";
  dailyBias: "Bullish" | "Bearish" | "Neutral";
  priceZone: "Premium" | "Discount" | "Equilibrium";
  orderBlock: string | null;
  fairValueGap: string | null;
  liquidity: string;
  ote: string | null;
  setup: string | null;
};

type AIAnalysis = {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  summary: string;
  keyPoints: string[];
  risk: "Low" | "Medium" | "High";
  ict?: ICTAnalysis;
};

function signalStyle(signal: string) {
  if (signal === "BUY") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (signal === "SELL") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

function riskStyle(risk: string) {
  if (risk === "Low") return "text-green-400";
  if (risk === "High") return "text-red-400";
  return "text-yellow-400";
}

function confidenceStyle(confidence: string) {
  if (confidence === "High") return "text-green-400";
  if (confidence === "Low") return "text-red-400";
  return "text-yellow-400";
}

export default function AnalysisPage() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [quoteData, setQuoteData] = useState<{
    price: number | null;
    previousClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
  }>({ price: null, previousClose: null, open: null, high: null, low: null });

  useEffect(() => {
    setAnalysis(null);
    setQuoteData({ price: null, previousClose: null, open: null, high: null, low: null });

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
      ? ((quoteData.price - quoteData.previousClose) / quoteData.previousClose) * 100
      : null;

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />
      <main className="flex-1 p-6 xl:p-8">
        <Topbar />

        <div className="mt-6">
          <h1 className="text-4xl font-bold">
            {symbol.replace(".US", "")} Analysis
          </h1>
          <p className="text-gray-400 mt-2">
            AI-powered investment signal with chart patterns for {symbol}
          </p>
        </div>

        <div className="mt-6 flex flex-col xl:flex-row gap-6">
          {/* Chart — left */}
          <div className="flex-1 bg-[#111827] rounded-3xl p-6 border border-[#1F2937] min-w-0">
            <AnalysisChart symbol={symbol} />
          </div>

          {/* AI Panel — right */}
          <div className="xl:w-[340px] shrink-0 flex flex-col gap-4">
            {/* Signal Card */}
            <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Kairos AI Signal</p>

              {loadingAnalysis && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-12 bg-[#1F2937] rounded-xl" />
                  <div className="h-4 bg-[#1F2937] rounded w-3/4" />
                  <div className="h-4 bg-[#1F2937] rounded w-1/2" />
                </div>
              )}

              {!loadingAnalysis && analysis && (
                <>
                  <span
                    className={`inline-block text-2xl font-bold px-4 py-2 rounded-xl border ${signalStyle(analysis.signal)}`}
                  >
                    {analysis.signal}
                  </span>

                  <div className="flex items-center gap-6 mt-4">
                    <div>
                      <p className="text-xs text-gray-500">Confidence</p>
                      <p className={`text-sm font-semibold mt-0.5 ${confidenceStyle(analysis.confidence)}`}>
                        {analysis.confidence}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Risk Level</p>
                      <p className={`text-sm font-semibold mt-0.5 ${riskStyle(analysis.risk)}`}>
                        {analysis.risk}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mt-4 leading-relaxed">{analysis.summary}</p>
                </>
              )}

              {!loadingAnalysis && !analysis && (
                <p className="text-sm text-gray-500">
                  Unable to generate signal. Market data may be unavailable.
                </p>
              )}
            </div>

            {/* Key Observations */}
            {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
              <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Key Observations</p>
                <ul className="space-y-2">
                  {analysis.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ICT Smart Money Concepts */}
            {analysis?.ict && (
              <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">
                  ICT Smart Money
                </p>

                {/* Market Structure + Bias row */}
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 bg-[#0B0F19] rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Structure</p>
                    <p className={`text-sm font-bold ${
                      analysis.ict.marketStructure === "Bullish" ? "text-green-400" :
                      analysis.ict.marketStructure === "Bearish" ? "text-red-400" :
                      "text-yellow-400"
                    }`}>{analysis.ict.marketStructure}</p>
                  </div>
                  <div className="flex-1 bg-[#0B0F19] rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Daily Bias</p>
                    <p className={`text-sm font-bold ${
                      analysis.ict.dailyBias === "Bullish" ? "text-green-400" :
                      analysis.ict.dailyBias === "Bearish" ? "text-red-400" :
                      "text-yellow-400"
                    }`}>{analysis.ict.dailyBias}</p>
                  </div>
                  <div className="flex-1 bg-[#0B0F19] rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Zone</p>
                    <p className={`text-sm font-bold ${
                      analysis.ict.priceZone === "Discount" ? "text-green-400" :
                      analysis.ict.priceZone === "Premium" ? "text-red-400" :
                      "text-yellow-400"
                    }`}>{analysis.ict.priceZone}</p>
                  </div>
                </div>

                {/* ICT Details */}
                <div className="space-y-2.5">
                  {analysis.ict.orderBlock && (
                    <div className="flex gap-2">
                      <span className="text-xs text-purple-400 font-semibold w-8 shrink-0 mt-0.5">OB</span>
                      <p className="text-xs text-gray-300">{analysis.ict.orderBlock}</p>
                    </div>
                  )}
                  {analysis.ict.fairValueGap && (
                    <div className="flex gap-2">
                      <span className="text-xs text-blue-400 font-semibold w-8 shrink-0 mt-0.5">FVG</span>
                      <p className="text-xs text-gray-300">{analysis.ict.fairValueGap}</p>
                    </div>
                  )}
                  {analysis.ict.liquidity && (
                    <div className="flex gap-2">
                      <span className="text-xs text-yellow-400 font-semibold w-8 shrink-0 mt-0.5">LIQ</span>
                      <p className="text-xs text-gray-300">{analysis.ict.liquidity}</p>
                    </div>
                  )}
                  {analysis.ict.ote && (
                    <div className="flex gap-2">
                      <span className="text-xs text-cyan-400 font-semibold w-8 shrink-0 mt-0.5">OTE</span>
                      <p className="text-xs text-gray-300">{analysis.ict.ote}</p>
                    </div>
                  )}
                  {analysis.ict.setup && (
                    <div className="mt-3 pt-3 border-t border-[#1F2937]">
                      <p className="text-xs text-gray-500 mb-1">Primary Setup</p>
                      <p className="text-xs text-white leading-relaxed">{analysis.ict.setup}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Price Snapshot */}
            <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Price Snapshot</p>
              {quoteData.price ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Current</span>
                    <span className="text-white font-semibold">${quoteData.price.toFixed(2)}</span>
                  </div>
                  {dayChange !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Day Change</span>
                      <span className={dayChange >= 0 ? "text-green-400" : "text-red-400"}>
                        {dayChange >= 0 ? "+" : ""}{dayChange.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {quoteData.open && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Open</span>
                      <span className="text-white">${quoteData.open.toFixed(2)}</span>
                    </div>
                  )}
                  {quoteData.high && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">High</span>
                      <span className="text-white">${quoteData.high.toFixed(2)}</span>
                    </div>
                  )}
                  {quoteData.low && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Low</span>
                      <span className="text-white">${quoteData.low.toFixed(2)}</span>
                    </div>
                  )}
                  {quoteData.previousClose && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Prev. Close</span>
                      <span className="text-white">${quoteData.previousClose.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 animate-pulse">Loading price data…</p>
              )}
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-gray-600 leading-relaxed px-1">
              AI signals are for informational purposes only and do not constitute financial advice.
              Always do your own research before investing.
            </p>
          </div>
        </div>

        {/* Comparison vs E-mini S&P 500 and key benchmarks */}
        <ComparisonPanel
          currentSymbol={symbol}
          currentLabel={symbol.replace(".US", "").replace(".COMM", "")}
          currentDayChange={dayChange}
        />
      </main>
    </div>
  );
}
