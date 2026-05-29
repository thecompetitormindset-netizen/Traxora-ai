"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";

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
      {/* Container must have explicit CSS height when autoSize:true is used */}
      <div ref={containerRef} className="w-full h-[380px]" />

      {/* Overlays */}
      {loading && (
        <div className="absolute inset-0 h-[380px] flex items-center justify-center bg-[#13112A] rounded-xl">
          <span className="text-[#4B5675] text-sm animate-pulse">Loading chart…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 h-[380px] flex items-center justify-center bg-[#13112A] rounded-xl border border-[#252345]">
          <span className="text-[#4B5675] text-sm">Chart unavailable</span>
        </div>
      )}

      {!loading && !error && provider && (
        <p className="text-[10px] text-[#4B5675] mt-1 text-right">via {provider}</p>
      )}
    </div>
  );
}
