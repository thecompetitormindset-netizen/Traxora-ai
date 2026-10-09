"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
} from "lightweight-charts";
import { appFontFamily } from "../lib/appFont";

type AnalysisChartProps = {
  symbol: string;
};

export default function AnalysisChart({ symbol }: AnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [provider, setProvider] = useState("");

  useEffect(() => {
    let active = true;
    let chart: ReturnType<typeof createChart> | null = null;

    async function load() {
      if (!containerRef.current) return;

      containerRef.current.innerHTML = "";
      setLoading(true);
      setError(false);
      setProvider("");

      // Create chart immediately into the visible container
      chart = createChart(containerRef.current, {
        autoSize: true,
        height: 520,
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
        // Try candlestick data from EODHD first
        const eodRes = await fetch(`/api/eod-bars?symbol=${encodeURIComponent(symbol)}`);
        const bars = await eodRes.json();

        if (!active) return;

        if (Array.isArray(bars) && bars.length > 0) {
          const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: "#10B981",
            downColor: "#F43F5E",
            borderVisible: false,
            wickUpColor: "#10B981",
            wickDownColor: "#F43F5E",
          });

          const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "",
          });

          candleSeries.setData(
            bars.map((b: { date: string; open: number; high: number; low: number; close: number }) => ({
              time: b.date,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            })),
          );

          volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

          volumeSeries.setData(
            bars.map((b: { date: string; close: number; open: number; volume: number }) => ({
              time: b.date,
              value: b.volume,
              color: b.close >= b.open ? "#10B98188" : "#F43F5E88",
            })),
          );

          chart.timeScale().fitContent();
          setProvider("EODHD");
          setLoading(false);
          return;
        }

        // Fallback: line chart from /api/stock (Yahoo Finance)
        const stockRes = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`);
        const stockJson = await stockRes.json();

        if (!active) return;

        const points = stockJson?.points;
        if (Array.isArray(points) && points.length > 0) {
          const lineSeries = chart.addSeries(LineSeries, {
            color: "#10B981",
            lineWidth: 2,
          });
          lineSeries.setData(points);
          chart.timeScale().fitContent();
          setProvider(stockJson?.provider ?? "Yahoo Finance");
          setLoading(false);
          return;
        }

        setLoading(false);
        setError(true);
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
      <div ref={containerRef} className="w-full h-[520px]" />

      {loading && (
        <div className="absolute inset-0 h-[520px] flex items-center justify-center bg-[#13112A] rounded-xl">
          <span className="text-[#4B5675] text-sm animate-pulse">Loading chart…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 h-[520px] flex items-center justify-center bg-[#13112A] rounded-xl border border-[#252345]">
          <span className="text-[#4B5675] text-sm">Chart unavailable</span>
        </div>
      )}

      {!loading && !error && provider && (
        <p className="text-[10px] text-[#4B5675] mt-1 text-right">via {provider}</p>
      )}
    </div>
  );
}
