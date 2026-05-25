"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";

type ChartProps = {
  symbol: string;
};

export default function Chart({ symbol }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");

  useEffect(() => {
    let chart: ReturnType<typeof createChart> | null = null;
    let isActive = true;

    async function loadData() {
      if (!chartContainerRef.current || !isActive) return;

      setError("");
      setProvider("");

      try {
        const res = await fetch(
          `/api/stock?symbol=${encodeURIComponent(symbol)}`,
        );
        const json = await res.json();

        if (!isActive || !chartContainerRef.current) return;

        if (!res.ok || json?.error) {
          setError("Chart unavailable. Both providers failed.");
          return;
        }

        const points = json?.points;
        if (!Array.isArray(points) || points.length === 0) {
          setError("No chart data available.");
          return;
        }

        setProvider(json?.provider ?? "");

        chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 380,
          layout: {
            background: { type: ColorType.Solid, color: "#111827" },
            textColor: "#D1D5DB",
          },
          grid: {
            vertLines: { color: "#1F2937" },
            horzLines: { color: "#1F2937" },
          },
        });

        const lineSeries = chart.addSeries(LineSeries, {
          color: "#22C55E",
          lineWidth: 2,
        });

        lineSeries.setData(points);
        chart.timeScale().fitContent();
      } catch {
        setError("Failed to load chart.");
      }
    }

    function handleResize() {
      if (!chart || !chartContainerRef.current) return;
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    }

    loadData();
    window.addEventListener("resize", handleResize);

    return () => {
      isActive = false;
      window.removeEventListener("resize", handleResize);
      if (chart) chart.remove();
    };
  }, [symbol]);

  if (error) {
    return (
      <div className="w-full h-[380px] flex flex-col items-center justify-center text-gray-400 border border-[#1F2937] rounded-2xl">
        <div>{error}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {provider && (
        <div className="text-xs text-gray-500 mb-2">
          Data provider: {provider}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
