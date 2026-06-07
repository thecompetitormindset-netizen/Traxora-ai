"use client";

import { useEffect, useState } from "react";
import { scopedKey } from "@/app/lib/userState";

type EvalReport = {
  directionalAccuracy: number;
  accuracy95CI:        [number, number];
  winRate:             number;
  avgWin:              number;
  avgLoss:             number;
  payoffRatio:         number | null;
  expectancyPct:       string;
  actedTrades:         number;
  byConfidence:        Record<string, { n: number; accuracy: number; ci95: [number, number] }>;
  verdict:             string;
};

const CACHE_KEY = "traxora_eval_cache";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function loadCache(): { ts: number; report: EvalReport } | null {
  try {
    const raw = localStorage.getItem(scopedKey(CACHE_KEY));
    if (!raw) return null;
    const { ts, report } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return { ts, report };
  } catch { /* ignore */ }
  return null;
}

function saveCache(report: EvalReport) {
  try { localStorage.setItem(scopedKey(CACHE_KEY), JSON.stringify({ ts: Date.now(), report })); } catch { /* ignore */ }
}

export default function SignalPerformance() {
  const [report,  setReport]  = useState<EvalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const cached = loadCache();
    if (cached) { setReport(cached.report); return; }
    evaluate();
  }, []);

  async function evaluate() {
    setLoading(true);
    setMsg(null);
    try {
      const raw = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]") as {
        symbol: string; signal: string; price: number; confidence: string; time: number;
      }[];

      const signals = raw
        .filter(s => s.signal === "BUY" || s.signal === "SELL")
        .map(s => ({ symbol: s.symbol, signal: s.signal as "BUY" | "SELL", confidence: s.confidence, price: s.price, time: s.time }));

      if (signals.length === 0) { setMsg("No signals tracked yet — run some analyses first."); setLoading(false); return; }

      const res  = await fetch("/api/signal-evaluate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ signals }),
      });
      const data = await res.json() as { report: EvalReport | null; message?: string };

      if (data.report) {
        setReport(data.report);
        saveCache(data.report);
      } else {
        setMsg(data.message ?? "Not enough data yet — need at least 3 signals that are 3+ trading days old.");
      }
    } catch {
      setMsg("Evaluation unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4 flex items-center gap-3">
        <svg className="animate-spin shrink-0 text-emerald-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span className="text-xs text-[#4B5675]">Evaluating signal history…</span>
      </div>
    );
  }

  if (msg && !report) {
    return (
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#4B5675] uppercase tracking-wider mb-0.5">Signal Track Record</p>
          <p className="text-xs text-[#2D3A52]">{msg}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const acc      = report.directionalAccuracy;
  const accColor = acc >= 0.6 ? "text-emerald-400" : acc >= 0.5 ? "text-amber-400" : "text-rose-400";
  const accBg    = acc >= 0.6 ? "bg-emerald-500/10 border-emerald-500/25" : acc >= 0.5 ? "bg-amber-500/10 border-amber-500/25" : "bg-rose-500/10 border-rose-500/25";

  return (
    <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-[#4B5675] font-semibold uppercase tracking-widest mb-0.5">Signal Track Record</p>
            <p className="text-xs text-[#4B5675]">{report.actedTrades} signals evaluated · T+3 day exit</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-xl border text-center ${accBg}`}>
              <p className={`text-xl font-black font-mono ${accColor}`}>{pct(acc)}</p>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Accuracy</p>
            </div>
            <div className="px-3 py-1.5 rounded-xl border border-[#252345] text-center">
              <p className="text-xl font-black font-mono text-[#F1F5F9]">{report.expectancyPct}</p>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Expectancy</p>
            </div>
            {report.payoffRatio != null && (
              <div className="px-3 py-1.5 rounded-xl border border-[#252345] text-center">
                <p className="text-xl font-black font-mono text-[#F1F5F9]">{report.payoffRatio.toFixed(2)}x</p>
                <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Payoff</p>
              </div>
            )}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-[#1C1933] pt-4 space-y-4">
          {/* Win/loss stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Win Rate",   val: pct(report.winRate),  color: "text-emerald-400" },
              { label: "Avg Win",    val: pct(report.avgWin),   color: "text-emerald-400" },
              { label: "Avg Loss",   val: pct(Math.abs(report.avgLoss)), color: "text-rose-400" },
              { label: "95% CI",     val: `${pct(report.accuracy95CI[0])}–${pct(report.accuracy95CI[1])}`, color: "text-amber-400" },
            ].map(s => (
              <div key={s.label} className="bg-[#0D0B1A] rounded-xl p-3 text-center">
                <p className={`text-sm font-black font-mono ${s.color}`}>{s.val}</p>
                <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* By confidence */}
          {Object.entries(report.byConfidence).filter(([, v]) => v.n > 0).map(([conf, v]) => (
            <div key={conf} className="flex items-center gap-3">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded border w-16 text-center ${
                conf === "High"   ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" :
                conf === "Medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/25" :
                                    "text-rose-400 bg-rose-500/10 border-rose-500/25"
              }`}>{conf}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[#1C1933] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${v.accuracy * 100}%`, background: v.accuracy >= 0.6 ? "#10B981" : v.accuracy >= 0.5 ? "#F59E0B" : "#F23645" }} />
              </div>
              <span className="text-[10px] font-mono text-[#7B8DB4] w-12 text-right">{pct(v.accuracy)} <span className="text-[#4B5675]">({v.n})</span></span>
            </div>
          ))}

          {/* Verdict */}
          <div className="bg-[#0D0B1A] rounded-xl p-3">
            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">AI Verdict</p>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{report.verdict}</p>
          </div>

          <button type="button" onClick={evaluate}
            className="text-[9px] text-[#4B5675] hover:text-[#7B8DB4] transition-colors font-mono">
            ↻ Re-evaluate signals
          </button>
        </div>
      )}
    </div>
  );
}
