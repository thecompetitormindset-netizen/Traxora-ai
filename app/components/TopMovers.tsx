"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MoversData, MoverRow } from "@/app/api/market/movers/route";

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MoverRow({ row, side }: { row: MoverRow; side: "gainer" | "loser" }) {
  const up    = (row.change ?? 0) >= 0;
  const color = up ? "text-emerald-400" : "text-rose-400";
  const bg    = up ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15";
  const sym   = row.symbol.replace(/-USD$/, "");

  return (
    <Link
      href={`/analysis?symbol=${encodeURIComponent(row.symbol + (row.symbol.includes("-") ? "" : ".US"))}`}
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${bg} hover:brightness-110 transition-all group`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Change badge */}
        <span className={`shrink-0 text-[11px] font-black font-mono w-14 text-center py-1 rounded-lg ${
          side === "gainer" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
        }`}>
          {up ? "+" : ""}{(row.change ?? 0).toFixed(2)}%
        </span>
        <p className="font-black text-sm text-[#F1F5F9] font-mono truncate">{sym}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold font-mono ${color}`}>
          {row.price !== null ? `$${row.price >= 100 ? row.price.toFixed(1) : row.price.toFixed(2)}` : "—"}
        </p>
        {row.volume !== null && (
          <p className="text-[9px] text-[#4B5675] font-mono">
            {row.volume >= 1_000_000 ? `${(row.volume / 1_000_000).toFixed(1)}M` : `${(row.volume / 1_000).toFixed(0)}K`} shares traded
          </p>
        )}
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {["Gainers", "Losers"].map(h => (
        <div key={h}>
          <div className="h-3 bg-[#252345] rounded w-20 mb-3 animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-[#1A1838] border border-[#252345] rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TopMovers() {
  const [data,    setData]    = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/market/movers", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d as MoversData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#4B5675] mt-0.5">The six biggest risers and fallers today among about 30 well-known stocks</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors disabled:opacity-40"
        >
          {loading ? (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : "Refresh ↺"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      {loading && !data && <Skeleton />}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Gainers */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Up the most
              </p>
              <div className="space-y-2">
                {data.gainers.map(r => <MoverRow key={r.symbol} row={r} side="gainer" />)}
              </div>
            </div>

            {/* Losers */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                Down the most
              </p>
              <div className="space-y-2">
                {data.losers.map(r => <MoverRow key={r.symbol} row={r} side="loser" />)}
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#333368]">
            Prices can be up to 15 minutes behind · Updated {timeStr(data.updatedAt)} · Not financial advice
          </p>
        </>
      )}
    </div>
  );
}
