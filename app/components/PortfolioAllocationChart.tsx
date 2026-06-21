"use client";

import { useEffect, useState } from "react";
import { loadTrades } from "@/app/lib/paperTrades";
import Link from "next/link";

// ── Static sector map (symbols without suffix) ────────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  AAPL:"Technology", MSFT:"Technology", NVDA:"Technology", AMD:"Technology",
  AVGO:"Technology", ORCL:"Technology", QCOM:"Technology", AMAT:"Technology",
  MU:"Technology",   INTC:"Technology", NOW:"Technology",  CRM:"Technology",
  GOOGL:"Communication", META:"Communication", NFLX:"Communication",
  DIS:"Communication", T:"Communication",
  AMZN:"Consumer", TSLA:"Consumer", WMT:"Consumer", COST:"Consumer",
  MCD:"Consumer",  TGT:"Consumer",  NKE:"Consumer",
  JPM:"Finance",   V:"Finance",     MA:"Finance",    BAC:"Finance",
  GS:"Finance",    MS:"Finance",    PYPL:"Finance",
  LLY:"Healthcare", UNH:"Healthcare", JNJ:"Healthcare", ABBV:"Healthcare",
  MRK:"Healthcare",  TMO:"Healthcare",  PFE:"Healthcare",
  XOM:"Energy",  CVX:"Energy",  OXY:"Energy",  SLB:"Energy",
  CAT:"Industrials", HON:"Industrials", BA:"Industrials", UPS:"Industrials",
  LIN:"Materials", FCX:"Materials",
  SPY:"ETF", QQQ:"ETF", IWM:"ETF",
  ES:"Futures",  NQ:"Futures",  YM:"Futures",  RTY:"Futures",
  GC:"Futures",  SI:"Futures",  CL:"Futures",  NG:"Futures",
};

function sectorOf(raw: string): string {
  const sym = raw.replace(/\.(US|COMM)$/, "").toUpperCase();
  return SECTOR_MAP[sym] ?? "Other";
}

const PALETTE = [
  "#34D399","#818CF8","#F59E0B","#F87171","#60A5FA",
  "#A78BFA","#FB923C","#4ADE80","#E879F9","#94A3B8",
];

// ── SVG Donut ─────────────────────────────────────────────────────────────────

type Slice = { label: string; value: number; pct: number; color: string };

function Donut({ slices }: { slices: Slice[] }) {
  const R = 36, CX = 50, CY = 50, C = 2 * Math.PI * R;
  let cumulative = 0;

  return (
    <svg width="100%" viewBox="0 0 100 100" className="w-full max-w-[160px]">
      {/* Background ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1A1838" strokeWidth="14" />

      {slices.map((s, i) => {
        const dash   = (s.pct / 100) * C;
        const offset = -(cumulative / 100) * C;
        cumulative  += s.pct;
        return (
          <circle key={i} cx={CX} cy={CY} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="13"
            strokeDasharray={`${dash} ${C}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${CX} ${CY})`}
            strokeLinecap="butt"
          />
        );
      })}

      {/* Centre text */}
      <text x={CX} y={CY - 4}  textAnchor="middle" fontSize="10" fontWeight="900" fill="#F1F5F9">{slices.length}</text>
      <text x={CX} y={CY + 7}  textAnchor="middle" fontSize="5.5" fill="#4B5675">SECTORS</text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PortfolioAllocationChart() {
  const [slices, setSlices] = useState<Slice[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [posCount, setPosCount] = useState(0);

  useEffect(() => {
    const open = loadTrades().filter(t => t.status === "OPEN");
    setPosCount(open.length);

    // Group by sector
    const map = new Map<string, number>();
    let total = 0;
    for (const t of open) {
      const val  = t.entryPrice * t.shares;
      const sec  = sectorOf(t.symbol);
      map.set(sec, (map.get(sec) ?? 0) + val);
      total += val;
    }
    setTotalValue(total);

    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    setSlices(sorted.map(([label, value], i) => ({
      label,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    })));
  }, []);

  if (posCount === 0) {
    return (
      <div className="card-shine glass surface-sheen border border-[#252345] rounded-2xl p-5">
        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Portfolio Allocation</p>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-2xl">📊</p>
          <p className="text-xs text-[#4B5675]">No open positions yet.</p>
          <Link href="/paper" className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
            Open a paper trade →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card-shine glass surface-sheen border border-[#252345] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest">Portfolio Allocation</p>
        <p className="text-[10px] text-[#4B5675]">{posCount} position{posCount !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex items-center gap-5">
        {/* Donut */}
        <div className="shrink-0 w-[120px]">
          <Donut slices={slices} />
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-2">
          {slices.map(s => (
            <div key={s.label} className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-[#CBD5E1] truncate flex-1">{s.label}</span>
              <span className="text-[11px] font-black font-mono text-[#F1F5F9] shrink-0">{s.pct.toFixed(0)}%</span>
              <span className="text-[10px] font-mono text-[#4B5675] shrink-0">${s.value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {totalValue > 0 && (
        <div className="mt-4 pt-3 border-t border-[#1A1838] flex items-center justify-between">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Total Deployed</p>
          <p className="text-sm font-black font-mono text-[#F1F5F9]">${totalValue.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
