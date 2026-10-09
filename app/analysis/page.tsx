"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data-loading effects reset state on symbol change */

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
import DeepMarketPanel from "@/app/components/analysis/DeepMarketPanel";
import ProAnalysisPanel from "@/app/components/analysis/ProAnalysisPanel";
import type { ProAnalysisResult } from "@/app/api/ai/pro-analysis/route";
import PaywallGuard from "@/app/components/PaywallGuard";
import AnalystRatings from "@/app/components/AnalystRatings";
import TechnicalsCard from "@/app/components/TechnicalsCard";

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


  // Plain-language reading of the signal for everyone; the technical
  // breakdown stays available under "More details".
  const firstNum = (s?: string) => { const m = s?.match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  const plan = analysis?.trade && analysis.signal !== "HOLD" ? analysis.trade as TradePlan : null;
  const verdict = !analysis ? null
    : analysis.signal === "BUY"  ? { word: "Leaning buy",  line: "Our checks lean towards the price going up from here." }
    : analysis.signal === "SELL" ? { word: "Leaning sell", line: "Our checks lean towards the price going down from here." }
    : { word: "Wait for now", line: "There’s no clear direction right now. Waiting is a fine choice." };
  const practiceHref = plan
    ? `/paper?symbol=${encodeURIComponent(ticker)}&side=${analysis!.signal}` +
      (firstNum(plan.stopLoss) ? `&stop=${firstNum(plan.stopLoss)}` : "") +
      (firstNum(plan.takeProfit) ? `&target=${firstNum(plan.takeProfit)}` : "")
    : `/paper?symbol=${encodeURIComponent(ticker)}`;
  const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-5xl mx-auto w-full space-y-5">

            {/* Price */}
            <header>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-mono text-[22px]">{ticker}</h1>
                <MarketStatus />
              </div>
              <div className="mt-2 flex items-end gap-3 flex-wrap">
                {quoteData.price
                  ? <p className="font-mono text-[40px] sm:text-[48px] leading-none tracking-[-0.02em]">${quoteData.price.toFixed(2)}</p>
                  : <div className="h-12 w-48 rounded-[10px] bg-[var(--mx-raised)] animate-pulse" />}
                {dayChange !== null && dollarChange !== null && (
                  <p className={`mb-1 text-[15px] ${dayChange >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"}`}>
                    {dayChange >= 0 ? "+" : "−"}${Math.abs(dollarChange).toFixed(2)} ({dayChange >= 0 ? "+" : "−"}{Math.abs(dayChange).toFixed(2)}%) today
                  </p>
                )}
              </div>
            </header>

            {/* Our read */}
            <section className={`${card} p-5 sm:p-6`} aria-labelledby="read-h">
              <p id="read-h" className="text-[13px] text-[var(--mx-text-3)]">Our read</p>
              {loadingAnalysis || (!analysis && showGuide) ? (
                <div className="mt-3 space-y-3 animate-pulse">
                  <div className="h-8 w-48 rounded bg-[var(--mx-raised)]" />
                  <div className="h-4 w-3/4 rounded bg-[var(--mx-raised)]" />
                </div>
              ) : !analysis || !verdict ? (
                <p className="mt-2 text-[15px] text-[var(--mx-text-2)]">We couldn’t read this stock right now. Market data may be unavailable — try again shortly.</p>
              ) : (
                <>
                  <p className="mt-2 text-[28px] sm:text-[32px] leading-tight tracking-[-0.02em]" style={{ fontWeight: 450 }}>{verdict.word}</p>
                  <p className="mt-2 text-[15px] text-[var(--mx-text-2)]">{verdict.line}</p>
                  <p className="mt-1 text-[13.5px] text-[var(--mx-text-3)]">
                    How sure: {analysis.confidence.toLowerCase()} · Risk: {analysis.risk.toLowerCase()}
                  </p>

                  {plan && (
                    <div className="mt-5 grid sm:grid-cols-3 gap-3">
                      {[
                        { k: analysis.signal === "BUY" ? "Buy around" : "Sell around", v: plan.entryZone, h: "The price range to get in." },
                        { k: "Safety level", v: plan.stopLoss, h: "Get out here to keep a loss small." },
                        { k: "Goal", v: plan.takeProfit, h: "Take your profit here." },
                      ].map(x => (
                        <div key={x.k} className="rounded-[10px] border border-[var(--mx-line)] p-3.5">
                          <p className="text-[13px] text-[var(--mx-text-3)]">{x.k}</p>
                          <p className="mt-1 font-mono text-[15px]">{x.v}</p>
                          <p className="mt-1 text-[12px] text-[var(--mx-text-3)]">{x.h}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {holding && quoteData.price && (
                    <p className="mt-4 text-[13.5px] text-[var(--mx-text-2)]">
                      You hold {holding.quantity} shares at ${holding.avgPrice.toFixed(2)} ({quoteData.price >= holding.avgPrice ? "+" : "−"}${Math.abs((quoteData.price - holding.avgPrice) * holding.quantity).toFixed(2)}).
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a href={practiceHref} className="h-11 px-5 inline-flex items-center rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">
                      Practise this trade
                    </a>
                    <span className="text-[12.5px] text-[var(--mx-text-3)]">Uses pretend money. Not financial advice.</span>
                  </div>
                </>
              )}
              {overrideInfo && (
                <p className="mt-4 text-[13px] text-[var(--mx-text-3)]">The deeper check changed this read from {overrideInfo.from} to {overrideInfo.to}.</p>
              )}
            </section>

            {/* Chart */}
            <section aria-label={`${ticker} chart`}>
              <TraxoraChart
                symbol={symbol}
                height={chartHeight}
                isExpanded={expandChart}
                onExpandToggle={() => setExpandChart(e => !e)}
                signalData={analysis && analysis.signal !== "HOLD" && analysis.trade ? {
                  signal: analysis.signal, confidence: analysis.confidence,
                  entry: analysis.trade.entryZone, stop: analysis.trade.stopLoss, target: analysis.trade.takeProfit,
                  rrRatio: analysis.trade.rrRatio, summary: analysis.summary,
                } : null}
              />
            </section>

            {/* News */}
            <section className={`${card} p-5`} aria-labelledby="news-h">
              <h2 id="news-h" className="text-[15px]">Latest news</h2>
              {newsLoading ? (
                <div className="mt-3 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded bg-[var(--mx-raised)] animate-pulse" />)}</div>
              ) : news.length === 0 ? (
                <p className="mt-2 text-[14px] text-[var(--mx-text-3)]">No recent news found.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--mx-line)]">
                  {news.slice(0, 5).map((item, i) => (
                    <li key={i}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="block py-3 group">
                        <p className="text-[14px] leading-snug group-hover:underline">{item.title}</p>
                        <p className="mt-1 text-[12px] text-[var(--mx-text-3)]">{item.source}{item.pubDate ? ` · ${new Date(item.pubDate).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Everything technical, folded away */}
            <details className={`${card} group`}>
              <summary className="cursor-pointer list-none flex items-center justify-between p-5 text-[15px]">
                <span>More details <span className="text-[13px] text-[var(--mx-text-3)]">— indicators, analysts and the full reasoning</span></span>
                <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
              </summary>
              <div className="px-5 pb-5 space-y-4">
                {analysis?.summary && <p className="text-[14px] leading-relaxed text-[var(--mx-text-2)]">{analysis.summary}</p>}
                {plan && (
                  <ul className="space-y-1.5 text-[13px] text-[var(--mx-text-2)]">
                    <li><span className="text-[var(--mx-text-3)]">Why this entry:</span> {plan.entryReason}</li>
                    <li><span className="text-[var(--mx-text-3)]">Why this safety level:</span> {plan.stopReason}</li>
                    <li><span className="text-[var(--mx-text-3)]">Why this goal:</span> {plan.tpReason}</li>
                    <li><span className="text-[var(--mx-text-3)]">Reward vs risk:</span> {plan.rrRatio}</li>
                  </ul>
                )}
                {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
                  <ul className="space-y-1.5 text-[13px] text-[var(--mx-text-2)] list-disc pl-5">
                    {analysis.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                )}
                <AnalystRatings symbol={symbol} currentPrice={quoteData.price} />
                <TechnicalsCard symbol={symbol} />

                <div className="pt-4 border-t border-[var(--mx-line)]">
                  <p className="text-[14px]">Want a deeper look?</p>
                  <p className="mt-1 text-[12.5px] text-[var(--mx-text-3)]">These use an AI model and need you to sign in.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={runDeepAnalysis} disabled={loadingDeep}
                      className="h-9 px-4 rounded-full border border-[var(--mx-line-strong)] text-[13px] disabled:opacity-50">
                      {loadingDeep ? DEEP_STEPS[deepStep] : deepAnalysis ? "Run again" : "Deep analysis"}
                    </button>
                    <button type="button" onClick={runProAnalysis} disabled={loadingPro}
                      className="h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] disabled:opacity-50">
                      {loadingPro ? PRO_STEPS[proStep] : proAnalysis ? "Run again" : "Second opinion"}
                    </button>
                  </div>
                  {deepError && <p className="mt-3 text-[13px] text-[var(--mx-down)]">{deepError}</p>}
                  {proError && <p className="mt-3 text-[13px] text-[var(--mx-down)]">{proError}</p>}
                </div>
                {deepAnalysis && <DeepMarketPanel data={deepAnalysis} symbol={symbol} />}
                {proAnalysis && <ProAnalysisPanel data={proAnalysis} symbol={symbol} />}
              </div>
            </details>
          </div>
        </main>
      </div>
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
