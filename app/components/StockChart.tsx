"use client";

import { useEffect, useRef, useState } from "react";

// TradingView widget type — loaded from external script
declare global {
  interface Window {
    TradingView?: { widget: new (config: object) => void };
  }
}

// ── Symbol mapping ────────────────────────────────────────────────────────────
const NYSE_STOCKS = new Set([
  "JPM","BAC","GS","MS","C","WFC","V","MA","XOM","CVX","WMT","KO","PG",
  "JNJ","UNH","MRK","PFE","HD","CAT","MMM","VZ","T","IBM","GE","F","GM",
  "BA","RTX","LMT","DE","UPS","FDX","BRK.B","LLY","COST","NKE",
]);

const FUTURES_MAP: Record<string, string> = {
  ES: "CME_MINI:ES1!", NQ: "CME_MINI:NQ1!", YM: "CBOT_MINI:YM1!",
  RTY:"CME_MINI:RTY1!", GC: "COMEX:GC1!",  SI: "COMEX:SI1!",
  CL: "NYMEX:CL1!",   NG: "NYMEX:NG1!",
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
  symbol: string;
  defaultInterval?: Interval;
  height?: number;
  showIntervalPicker?: boolean;
}

export default function StockChart({
  symbol,
  defaultInterval = "D",
  height = 420,
  showIntervalPicker = true,
}: StockChartProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState<Interval>(defaultInterval);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);

    // Generate a unique container ID so each render gets a fresh widget
    const id = `tv_${Math.random().toString(36).slice(2, 9)}`;
    containerRef.current.innerHTML = `<div id="${id}" style="height:${height}px;width:100%"></div>`;

    function createWidget() {
      const el = document.getElementById(id);
      if (!window.TradingView || !el) return;

      new window.TradingView.widget({
        autosize:             true,
        symbol:               toTVSymbol(symbol),
        interval,
        timezone:             "America/New_York",
        theme:                "dark",
        style:                "1",       // candlestick
        locale:               "en",
        enable_publishing:    false,
        allow_symbol_change:  false,
        container_id:         id,
        hide_top_toolbar:     false,
        hide_side_toolbar:    true,
        withdateranges:       true,
        save_image:           false,
        details:              false,
        hotlist:              false,
        calendar:             false,
        loading_screen: { backgroundColor: "#060A14", foregroundColor: "#818CF8" },
        overrides: {
          "paneProperties.background":                     "#060A14",
          "paneProperties.backgroundType":                 "solid",
          "paneProperties.vertGridProperties.color":       "#111827",
          "paneProperties.horzGridProperties.color":       "#111827",
          "mainSeriesProperties.candleStyle.upColor":      "#10B981",
          "mainSeriesProperties.candleStyle.downColor":    "#F43F5E",
          "mainSeriesProperties.candleStyle.wickUpColor":  "#10B981",
          "mainSeriesProperties.candleStyle.wickDownColor":"#F43F5E",
          "mainSeriesProperties.candleStyle.borderUpColor":"#10B981",
          "mainSeriesProperties.candleStyle.borderDownColor":"#F43F5E",
          "scalesProperties.textColor":                    "#4B5675",
          "scalesProperties.backgroundColor":              "#060A14",
          "symbolWatermarkProperties.transparency":        95,
        },
      });
      setLoading(false);
    }

    // Load tv.js once; reuse if already present
    const existing = document.getElementById("tv-script");
    if (existing) {
      if (window.TradingView) createWidget();
      else existing.addEventListener("load", createWidget, { once: true });
    } else {
      const script = document.createElement("script");
      script.id  = "tv-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.onload = createWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, height]);

  return (
    <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl overflow-hidden">
      {/* Interval picker */}
      {showIntervalPicker && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1C2333]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mr-1">
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
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-[#4B5675] hover:text-[#94A3B8] hover:bg-white/[0.04]"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div className="relative" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#060A14] z-10 gap-3">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-[11px] text-[#4B5675]">Loading chart…</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
