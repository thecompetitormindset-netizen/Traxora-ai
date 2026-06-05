"use client";

import { useState } from "react";
import type { ProAnalysisResult } from "@/app/api/ai/pro-analysis/route";

function safeFixed(val: unknown, dec = 2): string {
  const n = typeof val === "string" ? parseFloat(val) : Number(val);
  return isNaN(n) ? "—" : n.toFixed(dec);
}

function safeDate(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function ScoreBar({ label, value, max = 18 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex justify-between text-[9px] text-[#4B5675] mb-1">
        <span className="uppercase tracking-widest font-semibold">{label}</span>
        <span className="font-mono font-bold text-[#F1F5F9]">{value}</span>
      </div>
      <div className="h-px bg-[#252345] relative flex items-center">
        <div className={`absolute h-2.5 w-2.5 rounded-full ${color}`} style={{ left: `calc(${pct}% - 5px)`, boxShadow: `0 0 6px currentColor` }} />
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const cls =
    level === "Low"      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
    level === "Moderate" ? "bg-amber-500/10   text-amber-400   border-amber-500/25"   :
    level === "High"     ? "bg-rose-500/10    text-rose-400    border-rose-500/25"     :
                           "bg-rose-700/20    text-rose-300    border-rose-600/40";
  return <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${cls}`}>{level} Risk</span>;
}

function DirectionBadge({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  if (d === "no_trade") return (
    <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-2.5">
      <span className="text-rose-400 text-lg font-black">⛔ NO TRADE</span>
    </div>
  );
  const cls = d === "long"
    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
    : "bg-rose-500/10 border-rose-500/25 text-rose-400";
  const arrow = d === "long" ? "▲" : "▼";
  return (
    <div className={`flex items-center gap-2 border rounded-xl px-4 py-2.5 ${cls}`}>
      <span className="text-lg font-black">{arrow} {d.toUpperCase()}</span>
    </div>
  );
}

function LensRow({ label, value }: { label: string; value: string }) {
  const isPsych = label.toLowerCase().includes("psychology");
  const pass    = isPsych && value.toLowerCase().startsWith("pass");
  const fail    = isPsych && value.toLowerCase().startsWith("fail");
  return (
    <div className="border-b border-[#252345] last:border-0 py-3">
      <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isPsych ? (pass ? "text-emerald-400" : fail ? "text-rose-400" : "text-[#4B5675]") : "text-[#4B5675]"}`}>
        {label}
      </p>
      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{value}</p>
    </div>
  );
}

const LENS_LABELS: Record<string, string> = {
  microstructure:    "L1 · Microstructure",
  auction_profile:   "L2 · Auction / Market Profile",
  trend_intermarket: "L3 · Trend & Intermarket",
  volatility_edge:   "L4 · Volatility Edge",
  pricing_greeks:    "L5 · Derivatives / Greeks",
  futures_fundamentals: "L6 · Futures & Fundamentals",
  psychology_gate:   "L7 · Psychology Gate",
  survival_risk:     "L8 · Survival / Risk",
};

export default function ProAnalysisPanel({ data, symbol }: { data: ProAnalysisResult; symbol: string }) {
  const [lensOpen, setLensOpen] = useState(false);
  const clean = symbol.replace(/\.(US|COMM)$/, "");

  const setup    = data.setups?.[0];
  const ranking  = data.rankings?.[0];
  const noTrades = data.no_trade ?? [];
  const isNoTrade = !setup || setup.direction === "no_trade" || noTrades.length > 0;

  return (
    <div className="bg-[#0D0B1A] border border-violet-500/20 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#252345]">
        <div className="flex items-center gap-2.5">
          <span className="text-violet-400 text-lg">⚡</span>
          <div>
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Pro Analysis — {clean}</p>
            <p className="text-[10px] text-[#333368] mt-0.5">8-lens institutional framework · {safeDate(data.as_of_utc)}</p>
          </div>
        </div>
        {ranking && <RiskBadge level={ranking.risk_level} />}
      </div>

      <div className="p-5 space-y-5">

        {/* Regime summary */}
        {data.regime_summary && (
          <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
            <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold mb-1">Regime</p>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">{data.regime_summary}</p>
          </div>
        )}

        {/* NO TRADE block */}
        {isNoTrade && noTrades.map((nt, i) => (
          <div key={i} className="bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-rose-400 font-black text-sm">⛔ NO TRADE</span>
              {nt.symbol && <span className="text-[10px] text-[#4B5675]">{nt.symbol}</span>}
            </div>
            <p className="text-[11px] text-rose-300 leading-relaxed">{nt.reason}</p>
          </div>
        ))}

        {/* Setup details — only if there's a valid trade */}
        {setup && !isNoTrade && (
          <>
            {/* Direction + scores */}
            <div className="flex items-center gap-3 flex-wrap">
              <DirectionBadge direction={setup.direction} />
              <div className="flex items-center gap-3 ml-auto">
                <div className="text-center">
                  <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Score</p>
                  <p className="text-xl font-black font-mono text-violet-400">{setup.opportunity_score}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Confidence</p>
                  <p className="text-xl font-black font-mono text-emerald-400">{setup.confidence}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">R:R</p>
                  <p className="text-xl font-black font-mono text-amber-400">{safeFixed(setup.rr_to_t1, 1)}:1</p>
                </div>
              </div>
            </div>

            {/* Score bars */}
            <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3 space-y-3">
              <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold mb-2">Scoring Breakdown</p>
              <ScoreBar label="Trend alignment"      value={setup.scores.trend}             max={18} />
              <ScoreBar label="Auction / Structure"  value={setup.scores.auction_structure}  max={18} />
              <ScoreBar label="Volatility edge"      value={setup.scores.volatility}         max={16} />
              <ScoreBar label="Risk / Reward"        value={setup.scores.rr}                 max={14} />
              <ScoreBar label="Microstructure"       value={setup.scores.microstructure}     max={12} />
              <ScoreBar label="Macro / News"         value={setup.scores.macro_news}         max={10} />
              <ScoreBar label="Technical"            value={setup.scores.technical}          max={12} />
            </div>

            {/* Trade plan */}
            <div className="bg-[#13112A] border border-[#252345] rounded-xl overflow-hidden">
              <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold px-4 py-3 border-b border-[#252345]">Trade Plan</p>
              <div className="divide-y divide-[#252345]">
                <div className="grid grid-cols-2 gap-0 divide-x divide-[#252345]">
                  <div className="px-4 py-3">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Entry Zone</p>
                    <p className="text-sm font-mono font-bold text-amber-400">
                      ${safeFixed(setup.entry_zone?.[0])} – ${safeFixed(setup.entry_zone?.[1])}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Stop Loss</p>
                    <p className="text-sm font-mono font-bold text-rose-400">${safeFixed(setup.stop_loss)}</p>
                  </div>
                </div>
                {(setup.targets ?? []).map((t, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Target {i + 1}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-mono font-bold text-emerald-400">${safeFixed(t.level)}</p>
                      <p className="text-[10px] text-[#4B5675]">{t.reason}</p>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Invalidation</p>
                  <p className="text-[11px] text-rose-300">{setup.invalidation}</p>
                </div>
              </div>
            </div>

            {/* Edge statement */}
            {setup.edge_statement && (
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3">
                <p className="text-[9px] text-violet-400 uppercase tracking-widest font-semibold mb-1">Edge</p>
                <p className="text-[11px] text-[#CBD5E1] leading-relaxed">{setup.edge_statement}</p>
              </div>
            )}

            {/* Thesis */}
            {setup.thesis && (
              <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold mb-1">Thesis</p>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">{setup.thesis}</p>
              </div>
            )}

            {/* Position sizing */}
            {setup.sizing && (
              <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold mb-2">Position Sizing</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {[
                    { label: "Risk $",         value: `$${safeFixed(setup.sizing.risk_dollars)}` },
                    { label: "Contracts",      value: setup.sizing.recommended_contracts },
                    { label: "Risk / contract",value: `$${safeFixed(setup.sizing.risk_per_contract)}` },
                    { label: "Margin used",    value: `${safeFixed(setup.sizing.margin_utilization_pct, 1)}%` },
                  ].map(s => (
                    <div key={s.label} className="bg-[#0D0B1A] border border-[#252345] rounded-lg px-3 py-2">
                      <p className="text-[#4B5675] text-[8px] uppercase tracking-widest">{s.label}</p>
                      <p className="font-mono font-bold text-[#F1F5F9] mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
                {setup.sizing.calc && (
                  <p className="text-[9px] text-[#333368] mt-2 font-mono leading-relaxed">{setup.sizing.calc}</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Lens reads — collapsible */}
        {setup?.lens_reads && (
          <div className="bg-[#13112A] border border-[#252345] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLensOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1A1838] transition-colors"
            >
              <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold">8-Lens Reads</p>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round"
                className={`text-[#4B5675] transition-transform ${lensOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {lensOpen && (
              <div className="px-4 pb-3 border-t border-[#252345]">
                {Object.entries(setup.lens_reads).map(([key, value]) => (
                  <LensRow key={key} label={LENS_LABELS[key] ?? key} value={value} />
                ))}
                {setup.dominant_lens && (
                  <div className="mt-3 pt-3 border-t border-[#252345]">
                    <p className="text-[9px] text-violet-400 uppercase tracking-widest font-semibold mb-1">Dominant Lens</p>
                    <p className="text-[11px] text-[#94A3B8]">{setup.dominant_lens}</p>
                  </div>
                )}
                {(setup.conflicts ?? []).filter(Boolean).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#252345]">
                    <p className="text-[9px] text-amber-400 uppercase tracking-widest font-semibold mb-1">Conflicts</p>
                    {(setup.conflicts ?? []).map((c, i) => (
                      <p key={i} className="text-[11px] text-amber-300/70 leading-relaxed">• {c}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Assumptions + data gaps */}
        {setup && (((setup.assumptions ?? []).filter(Boolean).length > 0) || ((setup.data_gaps ?? []).filter(Boolean).length > 0)) && (
          <div className="space-y-2">
            {(setup.assumptions ?? []).filter(Boolean).length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
                <p className="text-[9px] text-amber-400 uppercase tracking-widest font-semibold mb-1.5">Assumptions</p>
                {(setup.assumptions ?? []).filter(Boolean).map((a, i) => (
                  <p key={i} className="text-[10px] text-amber-300/70">• {a}</p>
                ))}
              </div>
            )}
            {(setup.data_gaps ?? []).filter(Boolean).length > 0 && (
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3">
                <p className="text-[9px] text-rose-400 uppercase tracking-widest font-semibold mb-1.5">Data Gaps</p>
                {(setup.data_gaps ?? []).filter(Boolean).map((g, i) => (
                  <p key={i} className="text-[10px] text-rose-300/70">• {g}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[9px] text-[#333368] text-center pt-1">{data.disclaimer}</p>
      </div>
    </div>
  );
}
