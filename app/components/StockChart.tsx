"use client";

import { useState } from "react";

// ── Symbol mapping ────────────────────────────────────────────────────────────
const NYSE_STOCKS = new Set([
  "JPM","BAC","GS","MS","C","WFC","V","MA","XOM","CVX","WMT","KO","PG",
  "JNJ","UNH","MRK","PFE","HD","CAT","MMM","VZ","T","IBM","GE","F","GM",
  "BA","RTX","LMT","DE","UPS","FDX","BRK.B","LLY","COST","NKE",
]);

const FUTURES_MAP: Record<string, string> = {
  ES:  "CME_MINI:ES1!",  NQ:  "CME_MINI:NQ1!",  YM:  "CBOT_MINI:YM1!",
  RTY: "CME_MINI:RTY1!", GC:  "COMEX:GC1!",      SI:  "COMEX:SI1!",
  CL:  "NYMEX:CL1!",     NG:  "NYMEX:NG1!",
};

function toTVSymbol(sym: string): string {
  const clean = sym.replace(".US","").replace(".COMM","").toUpperCase();
  if (sym.includes(".COMM")) return FUTURES_MAP[clean] ?? `NYMEX:${clean}1!`;
  if (NYSE_STOCKS.has(clean)) return `NYSE:${clean}`;
  return `NASDAQ:${clean}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Interval = "5" | "15" | "60" | "240" | "D" | "W";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

// ── Component ─────────────────────────────────────────────────────────────────
interface StockChartProps {
  symbol:              string;
  defaultInterval?:    Interval;
  height?:             number;
  showIntervalPicker?: boolean;
}

export default function StockChart({
  symbol,
  defaultInterval     = "D",
  height              = 420,
  showIntervalPicker  = true,
}: StockChartProps) {
  const [interval, setInterval] = useState<Interval>(defaultInterval);

  const tvSymbol = toTVSymbol(symbol);
  const src = [
    "https://s.tradingview.com/widgetembed/",
    `?symbol=${encodeURIComponent(tvSymbol)}`,
    `&interval=${interval}`,
    "&theme=dark",
    "&style=1",
    "&locale=en",
    "&timezone=America%2FNew_York",
    "&hide_top_toolbar=0",
    "&hide_side_toolbar=1",
    "&withdateranges=1",
    "&allow_symbol_change=0",
    "&save_image=0",
    "&calendar=0",
    "&hotlist=0",
    "&details=0",
  ].join("");

  return (
    <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl overflow-hidden">
      {showIntervalPicker && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1C2333]">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest">
              {symbol.replace(".US","").replace(".COMM","")}
            </span>
            <span className="text-[10px] text-[#2D3A50]">·</span>
            <span className="text-[10px] text-[#4B5675]">TradingView</span>
          </div>
          <div className="flex gap-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                type="button"
                onClick={() => setInterval(iv.value)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  interval === iv.value
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-[#4B5675] hover:text-[#94A3B8] hover:bg-white/[0.04]"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* key forces iframe remount when symbol or interval changes */}
      <iframe
        key={`${tvSymbol}-${interval}`}
        src={src}
        width="100%"
        height={height}
        className="block border-0"
        title={`${symbol.replace(".US","").replace(".COMM","")} chart`}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
