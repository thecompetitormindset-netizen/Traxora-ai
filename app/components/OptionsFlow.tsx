"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FlowRow } from "@/app/api/market/options-flow/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function biasColor(b: FlowRow["bias"]): string {
  if (b === "bullish") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (b === "bearish") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  return "text-amber-400 bg-amber-500/10 border-amber-500/20";
}

function biasLabel(b: FlowRow["bias"]): string {
  if (b === "bullish") return "🐂 Call Heavy";
  if (b === "bearish") return "🐻 Put Heavy";
  return "⚖️ Neutral";
}

// ── Row ───────────────────────────────────────────────────────────────────────

function FlowRowCard({ row }: { row: FlowRow }) {
  const totalVol = row.callVol + row.putVol;
  const callPct  = totalVol > 0 ? (row.callVol / totalVol) * 100 : 50;

  return (
    <div className="grid grid-cols-[80px_1fr_1fr_80px_80px_80px_80px] items-center gap-3 px-5 py-3.5 border-b border-[#1A1838] last:border-0 hover:bg-white/[0.02] transition-colors min-w-[700px]">

      {/* Symbol */}
      <div>
        <Link href={`/analysis?symbol=${encodeURIComponent(row.symbol + ".US")}`}
          className="font-black font-mono text-sm text-[#F1F5F9] hover:text-emerald-400 transition-colors">
          {row.symbol}
        </Link>
        <p className="text-[9px] text-[#4B5675] font-mono">{row.price ? `$${row.price.toFixed(2)}` : "—"}</p>
      </div>

      {/* Call/Put Volume bar */}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden mb-1">
          <div className="bg-emerald-500/60" style={{ width: `${callPct}%` }} />
          <div className="bg-rose-500/60 flex-1" />
        </div>
        <div className="flex justify-between text-[8px]">
          <span className="text-emerald-400 font-mono">{fmtVol(row.callVol)} C</span>
          <span className="text-rose-400 font-mono">{fmtVol(row.putVol)} P</span>
        </div>
      </div>

      {/* P/C Ratio */}
      <div className="text-center">
        <p className="text-xs font-mono font-bold text-[#F1F5F9]">{row.pcRatio?.toFixed(2) ?? "—"}</p>
        <p className="text-[8px] text-[#4B5675]">P/C Ratio</p>
      </div>

      {/* Vol/OI */}
      <div className="text-center">
        <p className={`text-xs font-mono font-bold ${(row.volOIRatio ?? 0) >= 0.5 ? "text-amber-400" : "text-[#4B5675]"}`}>
          {row.volOIRatio?.toFixed(2) ?? "—"}
        </p>
        <p className="text-[8px] text-[#4B5675]">Vol/OI</p>
      </div>

      {/* IV */}
      <div className="text-center">
        <p className="text-xs font-mono font-bold text-violet-400">{row.ivAtm !== null ? `${row.ivAtm}%` : "—"}</p>
        <p className="text-[8px] text-[#4B5675]">IV ATM</p>
      </div>

      {/* Expiry */}
      <div className="text-center">
        <p className="text-[10px] font-mono text-[#CBD5E1]">{row.expiry ?? "—"}</p>
        <p className="text-[8px] text-[#4B5675]">{row.dte !== null ? `${row.dte}d` : ""}</p>
      </div>

      {/* Bias */}
      <div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${biasColor(row.bias)}`}>
          {biasLabel(row.bias)}
        </span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OptionsFlow() {
  const [rows,      setRows]      = useState<FlowRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter,    setFilter]    = useState<"all" | "bullish" | "bearish" | "unusual">("all");

  useEffect(() => {
    setLoading(true); setError("");
    fetch("/api/market/options-flow", { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(`Error ${r.status}`))
      .then(d => { setRows(d.rows ?? []); setUpdatedAt(d.updatedAt ?? null); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    if (filter === "bullish")  return r.bias === "bullish";
    if (filter === "bearish")  return r.bias === "bearish";
    if (filter === "unusual")  return (r.volOIRatio ?? 0) >= 0.3;
    return true;
  });

  const bullCount = rows.filter(r => r.bias === "bullish").length;
  const bearCount = rows.filter(r => r.bias === "bearish").length;

  return (
    <div className="space-y-4">

      {/* Header stats */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-[#13112A] border border-[#252345]">
            <div className="text-center">
              <p className="text-sm font-black text-emerald-400">{bullCount}</p>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-wider">Call Heavy</p>
            </div>
            <div className="w-px h-8 bg-[#252345]" />
            <div className="text-center">
              <p className="text-sm font-black text-rose-400">{bearCount}</p>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-wider">Put Heavy</p>
            </div>
            <div className="w-px h-8 bg-[#252345]" />
            <div className="text-center">
              <p className="text-sm font-black text-amber-400">{rows.length - bullCount - bearCount}</p>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-wider">Neutral</p>
            </div>
          </div>

          {/* Market bias */}
          <div className={`px-4 py-2.5 rounded-xl border text-sm font-bold ${
            bullCount > bearCount
              ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
              : bearCount > bullCount
              ? "bg-rose-500/8 border-rose-500/20 text-rose-400"
              : "bg-amber-500/8 border-amber-500/20 text-amber-400"
          }`}>
            Overall: {bullCount > bearCount ? "🐂 Call Bias" : bearCount > bullCount ? "🐻 Put Bias" : "⚖️ Mixed"}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          { key: "all",     label: "All" },
          { key: "bullish", label: "🐂 Call Heavy" },
          { key: "bearish", label: "🐻 Put Heavy" },
          { key: "unusual", label: "⚡ Unusual (Vol/OI ≥0.3)" },
        ] as const).map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
              filter === key
                ? "bg-violet-600 text-white"
                : "bg-[#1A1838] border border-[#252345] text-[#4B5675] hover:text-[#F1F5F9]"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass surface-sheen border border-[#252345] rounded-2xl overflow-hidden">

        {/* Column headers */}
        <div className="grid grid-cols-[80px_1fr_1fr_80px_80px_80px_80px] items-center gap-3 px-5 py-2.5 border-b border-[#252345] bg-[#0D0B1A] min-w-[700px]">
          {["Symbol", "Call / Put Volume", "P/C Ratio", "Vol/OI", "IV ATM", "Expiry", "Bias"].map(h => (
            <p key={h} className="text-[8px] font-black uppercase tracking-widest text-[#4B5675]">{h}</p>
          ))}
        </div>

        <div className="overflow-x-auto">
          {loading && (
            <div className="space-y-0 min-w-[700px]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr_1fr_80px_80px_80px_80px] gap-3 px-5 py-3.5 border-b border-[#1A1838] animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="h-4 bg-[#1A1838] rounded" />
                  ))}
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#4B5675]">No data matches the current filter.</p>
            </div>
          )}

          {!loading && filtered.map(row => <FlowRowCard key={row.symbol} row={row} />)}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-[#333368]">
        <span>Options flow from CBOE delayed quotes (15-min delay) · {rows.length} symbols scanned · Not financial advice</span>
        {updatedAt && <span>{new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
    </div>
  );
}
