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
const CACHE_TTL = 6 * 60 * 60 * 1000;

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

const STAT_INFO = {
  accuracy:   "Out of every 10 signals, how many went the right direction (up for BUY, down for SELL) 3 days later.",
  expectancy: "If you risked $100 on each signal, how much would you expect to gain on average per trade.",
  payoff:     "Average winning trade ÷ average losing trade. Above 1.0 means winners are bigger than losers.",
};

export default function SignalPerformance() {
  const [report,   setReport]   = useState<EvalReport | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [tip,      setTip]      = useState<keyof typeof STAT_INFO | null>(null);

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
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#4B5675] uppercase tracking-widest mb-1">Signal Track Record</p>
            <p className="text-sm font-semibold text-[#F1F5F9] mb-0.5">How accurate are your AI analyses?</p>
            <p className="text-xs text-[#4B5675] leading-relaxed mt-2">{msg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const MIN_RELIABLE = 20;
  const isReliable   = report.actedTrades >= MIN_RELIABLE;

  const acc      = report.directionalAccuracy;
  const accColor = acc >= 0.6 ? "text-emerald-400" : acc >= 0.5 ? "text-amber-400" : "text-rose-400";
  const accBg    = acc >= 0.6 ? "bg-emerald-500/8 border-emerald-500/20" : acc >= 0.5 ? "bg-amber-500/8 border-amber-500/20" : "bg-rose-500/8 border-rose-500/20";

  const expectancyVal = report.expectancyPct.replace(/\s+per\s+trade.*/i, "").trim();

  return (
    <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">

      {/* ── Header (always visible) ── */}
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full px-5 py-4 text-left">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-1">Signal Track Record</p>
            <p className="text-sm font-semibold text-[#F1F5F9]">How accurate are your AI analyses?</p>
            <p className="text-xs text-[#4B5675] mt-0.5">{report.actedTrades} signals checked · price 3 days after entry</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`shrink-0 mt-1 text-[#4B5675] transition-transform ${expanded ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {/* ── 3 stat tiles ── */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Accuracy */}
          <div
            className={`rounded-xl border px-3 py-2.5 ${accBg} relative`}
            onMouseEnter={() => setTip("accuracy")} onMouseLeave={() => setTip(null)}
          >
            <p className={`text-xl font-black font-mono leading-none ${accColor}`}>{pct(acc)}</p>
            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mt-1.5 font-medium">Direction accuracy</p>
            {tip === "accuracy" && (
              <div className="absolute left-0 top-full mt-1.5 z-20 w-52 bg-[#1C1933] border border-[#252345] rounded-xl px-3 py-2.5 text-[11px] text-[#7B8DB4] leading-relaxed shadow-xl">
                {STAT_INFO.accuracy}
              </div>
            )}
          </div>

          {/* Expectancy */}
          {isReliable ? (
            <div
              className="rounded-xl border border-[#252345] px-3 py-2.5 relative"
              onMouseEnter={() => setTip("expectancy")} onMouseLeave={() => setTip(null)}
            >
              <p className="text-xl font-black font-mono leading-none text-[#F1F5F9]">{expectancyVal}</p>
              <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mt-1.5 font-medium">Expected return</p>
              {tip === "expectancy" && (
                <div className="absolute left-0 top-full mt-1.5 z-20 w-52 bg-[#1C1933] border border-[#252345] rounded-xl px-3 py-2.5 text-[11px] text-[#7B8DB4] leading-relaxed shadow-xl">
                  {STAT_INFO.expectancy}
                </div>
              )}
            </div>
          ) : (
            <div className="col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 flex items-center">
              <p className="text-[10px] text-amber-400 leading-snug">
                Expected return unlocks after {MIN_RELIABLE} signals — {MIN_RELIABLE - report.actedTrades} more to go
              </p>
            </div>
          )}

          {/* Payoff */}
          {isReliable && report.payoffRatio != null && (
            <div
              className="rounded-xl border border-[#252345] px-3 py-2.5 relative"
              onMouseEnter={() => setTip("payoff")} onMouseLeave={() => setTip(null)}
            >
              <p className="text-xl font-black font-mono leading-none text-[#F1F5F9]">{report.payoffRatio.toFixed(2)}x</p>
              <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mt-1.5 font-medium">Win / loss size</p>
              {tip === "payoff" && (
                <div className="absolute right-0 top-full mt-1.5 z-20 w-52 bg-[#1C1933] border border-[#252345] rounded-xl px-3 py-2.5 text-[11px] text-[#7B8DB4] leading-relaxed shadow-xl">
                  {STAT_INFO.payoff}
                </div>
              )}
            </div>
          )}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-[#1C1933] pt-4 space-y-4">

          {/* Win/loss breakdown */}
          <div>
            <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-2.5">Trade breakdown</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label:"Win rate",    val: pct(report.winRate),               desc:"% of trades that were profitable",       color:"text-emerald-400" },
                { label:"Avg winner",  val: pct(report.avgWin),                desc:"Average gain on a winning trade",         color:"text-emerald-400" },
                { label:"Avg loser",   val: pct(Math.abs(report.avgLoss)),     desc:"Average loss on a losing trade",          color:"text-rose-400"    },
                { label:"95% range",   val: `${pct(report.accuracy95CI[0])}–${pct(report.accuracy95CI[1])}`, desc:"Statistical confidence range for your accuracy", color:"text-amber-400" },
              ].map(s => (
                <div key={s.label} className="bg-[#0D0B1A] rounded-xl p-3">
                  <p className={`text-sm font-black font-mono ${s.color}`}>{s.val}</p>
                  <p className="text-[9px] font-bold text-[#4B5675] uppercase tracking-widest mt-1">{s.label}</p>
                  <p className="text-[10px] text-[#333368] mt-0.5 leading-snug">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* By confidence level */}
          {Object.entries(report.byConfidence).filter(([, v]) => v.n > 0).length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-2.5">Accuracy by confidence level</p>
              <div className="space-y-2">
                {Object.entries(report.byConfidence).filter(([, v]) => v.n > 0).map(([conf, v]) => (
                  <div key={conf} className="flex items-center gap-3">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border w-16 text-center shrink-0 ${
                      conf === "High"   ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" :
                      conf === "Medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/25" :
                                         "text-rose-400 bg-rose-500/10 border-rose-500/25"
                    }`}>{conf}</span>
                    <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="flex-1 h-1.5 rounded-full overflow-hidden" aria-hidden>
                      <rect x="0" y="0" width="100" height="6" rx="3" fill="#1C1933" />
                      <rect x="0" y="0" width={v.accuracy * 100} height="6" rx="3"
                        fill={v.accuracy >= 0.6 ? "#10B981" : v.accuracy >= 0.5 ? "#F59E0B" : "#F23645"} />
                    </svg>
                    <span className="text-[11px] font-mono text-[#7B8DB4] w-20 text-right shrink-0">
                      {pct(v.accuracy)} <span className="text-[#4B5675]">({v.n})</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#333368] mt-2 leading-relaxed">High-confidence signals should outperform Low — if they don&apos;t, the AI confidence score isn&apos;t calibrated for your symbols yet.</p>
            </div>
          )}

          {/* AI Verdict */}
          <div className="bg-[#0D0B1A] rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-2">AI verdict on your track record</p>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{report.verdict}</p>
          </div>

          {!isReliable && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
              <p className="text-[10px] text-amber-400 leading-relaxed">
                ⚠ {report.actedTrades} signals is a small sample. Expected return and win/loss size become reliable at {MIN_RELIABLE}+ signals. Keep running analyses to build your track record.
              </p>
            </div>
          )}

          <button type="button" onClick={evaluate} className="text-[10px] text-[#4B5675] hover:text-[#7B8DB4] transition-colors font-mono">
            ↻ Re-evaluate signals
          </button>
        </div>
      )}
    </div>
  );
}
