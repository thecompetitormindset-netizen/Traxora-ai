"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type QuoteResult = {
  symbol: string;
  label: string;
  category: string;
  price: number | null;
  dayChange: number | null;
  loading: boolean;
};

const BENCHMARKS: { symbol: string; label: string; category: string }[] = [
  { symbol: "ES.COMM",  label: "E-mini S&P 500",    category: "Index Futures" },
  { symbol: "NQ.COMM",  label: "E-mini NASDAQ-100",  category: "Index Futures" },
  { symbol: "YM.COMM",  label: "E-mini Dow Jones",   category: "Index Futures" },
  { symbol: "RTY.COMM", label: "E-mini Russell 2000", category: "Index Futures" },
  { symbol: "GC.COMM",  label: "Gold",               category: "Metals" },
  { symbol: "SI.COMM",  label: "Silver",              category: "Metals" },
  { symbol: "CL.COMM",  label: "Crude Oil (WTI)",    category: "Energy" },
  { symbol: "NG.COMM",  label: "Natural Gas",         category: "Energy" },
];

function changeColor(v: number | null) {
  if (v === null) return "text-gray-500";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

function bar(v: number | null, max: number) {
  if (v === null || max === 0) return 0;
  return Math.min(100, (Math.abs(v) / max) * 100);
}

type Props = {
  currentSymbol: string;
  currentLabel: string;
  currentDayChange: number | null;
};

export default function ComparisonPanel({ currentSymbol, currentLabel, currentDayChange }: Props) {
  const [benchmarks, setBenchmarks] = useState<QuoteResult[]>(
    BENCHMARKS.map((b) => ({ ...b, price: null, dayChange: null, loading: true }))
  );

  useEffect(() => {
    BENCHMARKS.forEach(async ({ symbol, label, category }, i) => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price = data?.price ?? null;
        const prev = data?.previousClose ?? null;
        const dayChange = price && prev ? ((price - prev) / prev) * 100 : null;
        setBenchmarks((prev) =>
          prev.map((b, idx) => (idx === i ? { ...b, price, dayChange, loading: false } : b))
        );
      } catch {
        setBenchmarks((prev) =>
          prev.map((b, idx) => (idx === i ? { ...b, loading: false } : b))
        );
      }
    });
  }, []);

  const allRows: { symbol: string; label: string; category: string; dayChange: number | null; isCurrent: boolean }[] = [
    { symbol: currentSymbol, label: currentLabel, category: "Selected", dayChange: currentDayChange, isCurrent: true },
    ...benchmarks.map((b) => ({ symbol: b.symbol, label: b.label, category: b.category, dayChange: b.dayChange, isCurrent: false })),
  ];

  const values = allRows.map((r) => r.dayChange).filter((v): v is number => v !== null);
  const maxAbs = values.length > 0 ? Math.max(...values.map(Math.abs)) : 1;

  const sorted = [...allRows].sort((a, b) => {
    if (a.dayChange === null && b.dayChange === null) return 0;
    if (a.dayChange === null) return 1;
    if (b.dayChange === null) return -1;
    return b.dayChange - a.dayChange;
  });

  const categories = Array.from(new Set(BENCHMARKS.map((b) => b.category)));

  return (
    <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937] mt-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Performance Comparison</p>
          <p className="text-sm text-gray-400 mt-0.5">Today's change — {currentLabel.replace(".US", "")} vs benchmarks</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-2 mb-6">
        {sorted.map((row, rank) => (
          <Link
            key={row.symbol}
            href={`/analysis?symbol=${encodeURIComponent(row.symbol)}`}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition hover:border-blue-500/40 ${
              row.isCurrent
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-[#1F2937] hover:bg-[#1F2937]/40"
            }`}
          >
            <span className={`w-6 text-xs font-bold shrink-0 ${rank === 0 ? "text-yellow-400" : "text-gray-600"}`}>
              #{rank + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white truncate">{row.label}</p>
                {row.isCurrent && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-md shrink-0">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600">{row.category}</p>
            </div>

            {/* Bar */}
            <div className="w-24 h-1.5 bg-[#1F2937] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full transition-all ${
                  row.dayChange !== null && row.dayChange >= 0 ? "bg-green-500" : "bg-red-500"
                }`}
                style={{ width: `${bar(row.dayChange, maxAbs)}%` }}
              />
            </div>

            <span className={`text-sm font-bold w-16 text-right shrink-0 ${changeColor(row.dayChange)}`}>
              {row.dayChange !== null
                ? `${row.dayChange >= 0 ? "+" : ""}${row.dayChange.toFixed(2)}%`
                : benchmarks.find((b) => b.symbol === row.symbol)?.loading
                ? "..."
                : "N/A"}
            </span>
          </Link>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="border-t border-[#1F2937] pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">By Category</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map((cat) => {
            const rows = benchmarks.filter((b) => b.category === cat && b.dayChange !== null);
            const avg = rows.length > 0
              ? rows.reduce((sum, b) => sum + (b.dayChange ?? 0), 0) / rows.length
              : null;
            return (
              <div key={cat} className="bg-[#0B0F19] rounded-xl p-3 border border-[#1F2937]">
                <p className="text-xs text-gray-500 mb-1">{cat}</p>
                <p className={`text-sm font-bold ${changeColor(avg)}`}>
                  {avg !== null ? `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%` : "—"}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">avg today</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
