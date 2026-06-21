"use client";

import { useEffect, useState } from "react";
import type { Technicals } from "@/app/api/market/technicals/route";

// ── Gauge bar ─────────────────────────────────────────────────────────────────

function GaugeBar({ pct, label, zones }: {
  pct: number | null;
  label: string;
  zones: { pct: number; color: string; text: string }[];
}) {
  if (pct === null) return (
    <div>
      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">{label}</p>
      <div className="h-2 bg-[#0D0B1A] rounded-full" />
    </div>
  );

  const clamped = Math.max(0, Math.min(100, pct));
  const zone = zones.find(z => clamped <= z.pct) ?? zones[zones.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">{label}</p>
        <span className={`text-[9px] font-bold ${zone.color}`}>{zone.text}</span>
      </div>
      <div className="relative h-2 bg-[#0D0B1A] rounded-full overflow-visible">
        <div className="h-full rounded-full" style={{
          width: `${clamped}%`,
          background: clamped <= 30 ? "#F87171" : clamped >= 70 ? "#F59E0B" : "#34D399",
        }} />
        {/* tick marks */}
        <div className="absolute top-0 bottom-0 border-l border-[#252345]" style={{ left: "30%" }} />
        <div className="absolute top-0 bottom-0 border-l border-[#252345]" style={{ left: "70%" }} />
      </div>
    </div>
  );
}

// ── Signal badge ──────────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${color}`}>{text}</span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TechnicalsCard({ symbol }: { symbol: string }) {
  const [data,    setData]    = useState<Technicals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true); setError(false); setData(null);
    fetch(`/api/market/technicals?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!d.error) setData(d); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="card-shine glass surface-sheen rounded-2xl border border-[#252345] p-5 space-y-3 animate-pulse">
        <div className="h-3 bg-[#252345] rounded w-36" />
        {[1,2,3,4].map(i => <div key={i} className="h-5 bg-[#252345] rounded" />)}
      </div>
    );
  }

  if (error || !data) return null;

  const rsiPct = data.rsi14 ?? 50;

  // Directional summary
  let bullishCount = 0, bearishCount = 0;
  if (data.macdCross === "bullish")     bullishCount++;
  if (data.macdCross === "bearish")     bearishCount++;
  if (data.rsiSignal === "oversold")    bullishCount++;
  if (data.rsiSignal === "overbought")  bearishCount++;
  if (data.bbSignal  === "oversold")    bullishCount++;
  if (data.bbSignal  === "overbought")  bearishCount++;
  if (data.aboveSma50)                  bullishCount++;
  else if (data.aboveSma50 === false)   bearishCount++;
  if (data.aboveSma200)                 bullishCount++;
  else if (data.aboveSma200 === false)  bearishCount++;
  if (data.smaCross === "golden")       bullishCount++;
  if (data.smaCross === "death")        bearishCount++;

  const total   = bullishCount + bearishCount;
  const score   = total > 0 ? Math.round((bullishCount / total) * 100) : 50;
  const overall = score >= 60 ? { label: "Bullish", cls: "text-emerald-400" }
                : score <= 40 ? { label: "Bearish", cls: "text-rose-400"    }
                :               { label: "Neutral",  cls: "text-amber-400"  };

  return (
    <div className="card-shine glass surface-sheen rounded-2xl border border-[#252345] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest">Technical Indicators</p>
        <span className={`text-xs font-black ${overall.cls}`}>{overall.label}</span>
      </div>

      <div className="space-y-3.5">

        {/* RSI */}
        <div>
          <GaugeBar
            pct={rsiPct}
            label={`RSI (14) · ${data.rsi14?.toFixed(1) ?? "—"}`}
            zones={[
              { pct: 30, color: "text-emerald-400", text: "Oversold" },
              { pct: 70, color: "text-[#4B5675]",   text: "Neutral"  },
              { pct: 100,color: "text-amber-400",   text: "Overbought" },
            ]}
          />
        </div>

        {/* MACD */}
        {data.macd !== null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">MACD (12,26,9)</p>
              {data.macdCross && (
                <Badge
                  text={data.macdCross === "bullish" ? "Bullish Cross" : data.macdCross === "bearish" ? "Bearish Cross" : "Neutral"}
                  color={data.macdCross === "bullish" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : data.macdCross === "bearish" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}
                />
              )}
            </div>
            <div className="flex items-center gap-4">
              {[
                { label: "MACD",   val: data.macd },
                { label: "Signal", val: data.signal },
                { label: "Hist",   val: data.histogram },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-[8px] text-[#4B5675]">{label}</p>
                  <p className={`text-[11px] font-mono font-bold ${val !== null && val >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {val !== null ? (val >= 0 ? "+" : "") + val.toFixed(3) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bollinger Bands */}
        {data.bbPct !== null && (
          <div>
            <GaugeBar
              pct={data.bbPct}
              label={`BB%B · ${data.bbPct.toFixed(0)}%`}
              zones={[
                { pct: 10,  color: "text-emerald-400", text: "Below Lower Band" },
                { pct: 90,  color: "text-[#4B5675]",   text: "Normal Range"     },
                { pct: 100, color: "text-amber-400",   text: "Above Upper Band" },
              ]}
            />
            <div className="flex justify-between text-[8px] font-mono text-[#333368] mt-0.5">
              <span>${data.bbLower?.toFixed(2)}</span>
              <span className="text-[#252345]">${data.bbMiddle?.toFixed(2)} MA</span>
              <span>${data.bbUpper?.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Moving Averages */}
        <div>
          <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Moving Averages</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "50D SMA", val: data.sma50, above: data.aboveSma50 },
              { label: "200D SMA", val: data.sma200, above: data.aboveSma200 },
            ].map(({ label, val, above }) => (
              <div key={label} className={`flex-1 min-w-[90px] flex items-center justify-between px-3 py-2 rounded-xl border ${
                above === true  ? "bg-emerald-500/5 border-emerald-500/20" :
                above === false ? "bg-rose-500/5    border-rose-500/20"    :
                                  "bg-[#0D0B1A]     border-[#252345]"
              }`}>
                <div>
                  <p className="text-[8px] text-[#4B5675]">{label}</p>
                  <p className="text-[11px] font-mono font-bold text-[#F1F5F9]">{val !== null ? `$${val}` : "—"}</p>
                </div>
                {above !== null && (
                  <span className={`text-[9px] font-black ${above ? "text-emerald-400" : "text-rose-400"}`}>
                    {above ? "▲" : "▼"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {data.smaCross && (
            <p className={`mt-1.5 text-[9px] font-bold ${data.smaCross === "golden" ? "text-emerald-400" : data.smaCross === "death" ? "text-rose-400" : "text-[#4B5675]"}`}>
              {data.smaCross === "golden" ? "✦ Golden Cross — 50D above 200D (bullish)" : data.smaCross === "death" ? "✦ Death Cross — 50D below 200D (bearish)" : ""}
            </p>
          )}
        </div>

        {/* Summary score */}
        <div className="pt-2 border-t border-[#1A1838]">
          <div className="flex items-center justify-between">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Indicator Agreement</p>
            <span className={`text-xs font-black ${overall.cls}`}>{bullishCount} Bull · {bearishCount} Bear</span>
          </div>
          <div className="mt-1.5 h-1.5 bg-[#0D0B1A] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${score}%`, background: score >= 60 ? "#34D399" : score <= 40 ? "#F87171" : "#F59E0B" }} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-[9px] text-[#333368]">
        Calculated from 1 year of daily closes · Not financial advice
      </p>
    </div>
  );
}
