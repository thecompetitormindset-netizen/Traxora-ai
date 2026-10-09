"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import { appFontFamily } from "../lib/appFont";

type ChartProps = {
  symbol: string;
};

export default function Chart({ symbol }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [provider, setProvider] = useState("");

  useEffect(() => {
    let active = true;
    let chart: ReturnType<typeof createChart> | null = null;

    async function load() {
      if (!containerRef.current) return;

      // Remove previous chart canvas if any
      containerRef.current.innerHTML = "";
      setLoading(true);
      setError(false);
      setProvider("");

      // Create chart immediately so the container is measured while visible
      chart = createChart(containerRef.current, {
        autoSize: true,
        height: 380,
        layout: {
          fontFamily: appFontFamily(),
          background: { type: ColorType.Solid, color: "#13112A" },
          textColor: "#94A3B8",
        },
        grid: {
          vertLines: { color: "#252345" },
          horzLines: { color: "#252345" },
        },
        crosshair: {
          vertLine: { color: "#4B5675" },
          horzLine: { color: "#4B5675" },
        },
        rightPriceScale: { borderColor: "#252345" },
        timeScale: { borderColor: "#252345" },
      });

      try {
        const res = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`);
        const json = await res.json();

        if (!active) return;

        const points = json?.points;
        if (!res.ok || json?.error || !Array.isArray(points) || points.length === 0) {
          setLoading(false);
          setError(true);
          return;
        }

        const series = chart.addSeries(LineSeries, {
          color: "#10B981",
          lineWidth: 2,
        });

        series.setData(points);
        chart.timeScale().fitContent();

        setProvider(json?.provider ?? "");
        setLoading(false);
      } catch {
        if (active) {
          setLoading(false);
          setError(true);
        }
      }
    }

    load();

    return () => {
      active = false;
      if (chart) {
        chart.remove();
        chart = null;
      }
    };
  }, [symbol]);

  return (
    <div className="w-full relative">
      {/* Shimmer skeleton while loading */}
      {loading && (
        <div className="chart-shimmer w-full h-[380px]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin text-emerald-500/40" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span className="text-[11px] text-[#4B5675]">Loading chart…</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart canvas — hidden while loading so measurements work */}
      <div
        ref={containerRef}
        className={`w-full h-[380px] transition-opacity duration-300 ${loading ? "opacity-0 absolute inset-0" : "chart-appear"}`}
      />

      {error && (
        <div className="absolute inset-0 h-[380px] flex items-center justify-center bg-[#13112A] rounded-xl border border-[#252345]">
          <div className="flex flex-col items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-[#4B5675] text-sm">Chart unavailable</span>
          </div>
        </div>
      )}

      {!loading && !error && provider && (
        <p className="text-[10px] text-[#4B5675] mt-1 text-right">via {provider}</p>
      )}
    </div>
  );
}
