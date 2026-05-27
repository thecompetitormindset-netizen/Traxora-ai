"use client";

import { useEffect, useRef, useState } from "react";
import { getPortfolio, PORTFOLIO_UPDATED_EVENT } from "../lib/trading";
import { scopedKey } from "../lib/userState";

const MILESTONE_EVERY = 10; // every 10 trades
const LAST_COACHED_KEY = "traxora-last-coached";

let _autoCoachStarted = false;

function calcWinRate(trades: Array<{ side: string; symbol: string; price: number }>) {
  const buys: Record<string, number[]> = {};
  let wins = 0, losses = 0;
  for (const t of trades) {
    if (t.side === "BUY") {
      if (!buys[t.symbol]) buys[t.symbol] = [];
      buys[t.symbol].push(t.price);
    } else {
      const bp = buys[t.symbol];
      if (bp && bp.length > 0) {
        const avg = bp.reduce((a, b) => a + b, 0) / bp.length;
        t.price > avg ? wins++ : losses++;
      }
    }
  }
  return { wins, losses, winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0 };
}

export default function AutoCoach() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport]   = useState<string | null>(null);
  const lastCountRef          = useRef<number | null>(null);

  useEffect(() => {
    if (_autoCoachStarted) { console.warn("[AutoCoach] duplicate mount — skipping"); return; }
    _autoCoachStarted = true;

    const initial = getPortfolio();
    lastCountRef.current = initial.trades.length;

    async function check() {
      const portfolio = getPortfolio();
      const count     = portfolio.trades.length;
      const lastCoached = Number(localStorage.getItem(scopedKey(LAST_COACHED_KEY)) ?? "0");

      // Fire at every MILESTONE_EVERY-th trade
      if (count > 0 && count % MILESTONE_EVERY === 0 && count !== lastCoached) {
        localStorage.setItem(scopedKey(LAST_COACHED_KEY), String(count));
        const { wins, losses, winRate } = calcWinRate(portfolio.trades);
        setLoading(true);
        setVisible(true);
        setReport(null);

        try {
          const res = await fetch("/api/ai/coach", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trades: portfolio.trades, wins, losses, winRate }),
          });
          const data = await res.json() as { report?: string; reason?: string };
          if (!res.ok || data.reason === "AI_UNAVAILABLE") {
            setReport("AI features temporarily unavailable — please check back shortly.");
          } else {
            setReport(data.report ?? null);
          }
        } catch {
          setReport("Could not generate coaching report — check your API key.");
        } finally {
          setLoading(false);
        }
      }
    }

    window.addEventListener(PORTFOLIO_UPDATED_EVENT, check);
    return () => {
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, check);
      _autoCoachStarted = false;
    };
  }, []);

  if (!visible) return null;

  // Parse structured report
  function parseReport(raw: string) {
    const assessment = raw.match(/ASSESSMENT:\s*([\s\S]+?)(?=\nWEAKNESS:|$)/)?.[1]?.trim();
    const weakness   = raw.match(/WEAKNESS:\s*([\s\S]+?)(?=\nSTRENGTH:|$)/)?.[1]?.trim();
    const strength   = raw.match(/STRENGTH:\s*([\s\S]+?)(?=\nTIPS:|$)/)?.[1]?.trim();
    const tipsBlock  = raw.match(/TIPS:\s*([\s\S]+)$/)?.[1]?.trim();
    const tips       = tipsBlock
      ? tipsBlock.split(/\n/).map(l => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean)
      : [];
    return { assessment, weakness, strength, tips };
  }

  const parsed = report ? parseReport(report) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#0C1017] border border-[#1C2333] rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C2333] bg-gradient-to-r from-violet-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="font-bold text-[#F1F5F9]">Coaching Report</p>
              <p className="text-[10px] text-[#4B5675]">
                {getPortfolio().trades.length} trades completed · Traxora AI Coach
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Close coaching report"
            className="w-8 h-8 rounded-xl bg-[#1C2333] hover:bg-[#2D3A50] flex items-center justify-center text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 mb-4">
                <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <p className="text-sm text-[#7B8DB4]">Traxora AI is reviewing your trading history...</p>
              </div>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className={`h-3 rounded-full bg-[#1C2333] animate-pulse ${i % 3 === 0 ? "w-2/3" : "w-full"}`} />
              ))}
            </div>
          ) : parsed ? (
            <div className="space-y-5">
              {/* Assessment */}
              {parsed.assessment && (
                <div className="bg-[#060A14] border border-indigo-500/20 rounded-2xl p-4">
                  <p className="text-[9px] text-indigo-400 uppercase tracking-widest font-semibold mb-1.5">Overall Assessment</p>
                  <p className="text-sm text-[#CBD5E1] leading-relaxed">{parsed.assessment}</p>
                </div>
              )}

              {/* Weakness + Strength */}
              <div className="grid grid-cols-2 gap-3">
                {parsed.weakness && (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                    <p className="text-[9px] text-rose-400 uppercase tracking-widest font-semibold mb-1.5">⚠ Weakness</p>
                    <p className="text-xs text-[#7B8DB4] leading-relaxed">{parsed.weakness}</p>
                  </div>
                )}
                {parsed.strength && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-semibold mb-1.5">✓ Strength</p>
                    <p className="text-xs text-[#7B8DB4] leading-relaxed">{parsed.strength}</p>
                  </div>
                )}
              </div>

              {/* Tips */}
              {parsed.tips.length > 0 && (
                <div>
                  <p className="text-[9px] text-violet-400 uppercase tracking-widest font-semibold mb-3">3 Tactical Tips</p>
                  <div className="space-y-2.5">
                    {parsed.tips.map((tip, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-violet-500/15 border border-violet-500/20 text-[9px] font-black text-violet-400 flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-xs text-[#7B8DB4] leading-relaxed">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#4B5675] text-center py-6">{report}</p>
          )}
        </div>

        <div className="px-6 pb-5 pt-2 border-t border-[#1C2333] flex justify-between items-center">
          <p className="text-[10px] text-[#2D3A50]">Next report after {Math.ceil(getPortfolio().trades.length / MILESTONE_EVERY) * MILESTONE_EVERY + MILESTONE_EVERY} trades</p>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="bg-violet-600 hover:bg-violet-500 transition-colors px-5 py-2 rounded-xl text-xs font-bold"
          >
            Keep Trading →
          </button>
        </div>
      </div>
    </div>
  );
}
