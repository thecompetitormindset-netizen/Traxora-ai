"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cell = {
  label:  string;
  etf:    string;
  change: number | null;
  price:  number | null;
};

const SECTORS: { label: string; etf: string }[] = [
  { label: "Technology",      etf: "XLK"  },
  { label: "Healthcare",      etf: "XLV"  },
  { label: "Financials",      etf: "XLF"  },
  { label: "Consumer Disc.",  etf: "XLY"  },
  { label: "Comm. Services",  etf: "XLC"  },
  { label: "Industrials",     etf: "XLI"  },
  { label: "Energy",          etf: "XLE"  },
  { label: "Consumer Staples",etf: "XLP"  },
  { label: "Utilities",       etf: "XLU"  },
  { label: "Real Estate",     etf: "XLRE" },
  { label: "Materials",       etf: "XLB"  },
];

const INDICES: { label: string; etf: string }[] = [
  { label: "S&P 500",  etf: "SPY" },
  { label: "NASDAQ",   etf: "QQQ" },
  { label: "Dow",      etf: "DIA" },
  { label: "Russell",  etf: "IWM" },
];

// Maps |change%| to a background color opacity
function cellStyle(change: number | null): string {
  if (change === null) return "bg-[#1A1838] border-[#252345]";
  const abs = Math.abs(change);
  if (change >= 0) {
    if (abs >= 3)   return "bg-emerald-600/40 border-emerald-500/40";
    if (abs >= 2)   return "bg-emerald-600/25 border-emerald-500/30";
    if (abs >= 1)   return "bg-emerald-600/15 border-emerald-500/20";
    return                 "bg-emerald-600/8  border-emerald-500/15";
  } else {
    if (abs >= 3)   return "bg-rose-600/40 border-rose-500/40";
    if (abs >= 2)   return "bg-rose-600/25 border-rose-500/30";
    if (abs >= 1)   return "bg-rose-600/15 border-rose-500/20";
    return                 "bg-rose-600/8  border-rose-500/15";
  }
}

function textColor(change: number | null): string {
  if (change === null) return "text-[#4B5675]";
  const abs = Math.abs(change);
  if (change >= 0) return abs >= 2 ? "text-emerald-300" : "text-emerald-400";
  return abs >= 2 ? "text-rose-300" : "text-rose-400";
}

function HeatCell({ cell, size }: { cell: Cell; size: "lg" | "sm" }) {
  const bg  = cellStyle(cell.change);
  const txt = textColor(cell.change);
  const big = size === "lg";

  return (
    <Link
      href={`/analysis?symbol=${encodeURIComponent(cell.etf + ".US")}`}
      className={`flex flex-col justify-between rounded-xl border p-3 transition-all hover:brightness-115 ${bg} ${big ? "min-h-[76px]" : "min-h-[60px]"}`}
    >
      <p className={`font-bold leading-tight ${big ? "text-[11px]" : "text-[10px]"} text-[#CBD5E1]`}>
        {cell.label}
      </p>
      <div>
        <p className={`font-black font-mono tabular-nums ${big ? "text-lg" : "text-sm"} ${txt}`}>
          {cell.change !== null
            ? `${cell.change >= 0 ? "+" : ""}${cell.change.toFixed(2)}%`
            : "—"}
        </p>
        <p className="text-[9px] text-[#4B5675] font-mono">{cell.etf}</p>
      </div>
    </Link>
  );
}

function SkeletonCell({ big }: { big?: boolean }) {
  return (
    <div className={`rounded-xl border border-[#252345] bg-[#1A1838] p-3 animate-pulse ${big ? "min-h-[76px]" : "min-h-[60px]"}`}>
      <div className="h-2.5 bg-[#252345] rounded w-16 mb-2" />
      <div className="h-5 bg-[#252345] rounded w-10 mt-auto" />
    </div>
  );
}

export default function SectorHeatmap() {
  const [cells,   setCells]   = useState<Cell[]>([]);
  const [indices, setIndices] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const syms = [...INDICES, ...SECTORS].map(s => s.etf).join(",");
        const res = await fetch(`/api/market/heatmap?symbols=${encodeURIComponent(syms)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data: { symbol: string; price: number | null; change: number | null }[] = await res.json();

        const map = new Map(data.map(d => [d.symbol, d]));

        setIndices(INDICES.map(s => ({
          label:  s.label,
          etf:    s.etf,
          price:  map.get(s.etf)?.price  ?? null,
          change: map.get(s.etf)?.change ?? null,
        })));
        setCells(SECTORS.map(s => ({
          label:  s.label,
          etf:    s.etf,
          price:  map.get(s.etf)?.price  ?? null,
          change: map.get(s.etf)?.change ?? null,
        })));
        setUpdatedAt(new Date().toISOString());
      } catch { /* silently fail */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const timeStr = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-4">
      {/* Major indices row */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-[#4B5675] mb-2">Major Indices</p>
        <div className="grid grid-cols-4 gap-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCell key={i} big />)
            : indices.map(c => <HeatCell key={c.etf} cell={c} size="lg" />)
          }
        </div>
      </div>

      {/* Sector grid */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-[#4B5675] mb-2">Sectors (S&P 500 ETFs)</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
          {loading
            ? Array.from({ length: 11 }).map((_, i) => <SkeletonCell key={i} />)
            : cells.map(c => <HeatCell key={c.etf} cell={c} size="sm" />)
          }
        </div>
      </div>

      <p className="text-[9px] text-[#333368]">
        Sector ETFs (XLK, XLV…) · 15-min delayed{timeStr ? ` · Updated ${timeStr}` : ""} · Not financial advice
      </p>
    </div>
  );
}
