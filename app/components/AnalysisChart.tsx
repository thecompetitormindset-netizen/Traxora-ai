"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
} from "lightweight-charts";

type AnalysisChartProps = {
  symbol: string;
};

type BarItem = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function AnalysisChart({ symbol }: AnalysisChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: ReturnType<typeof createChart> | null = null;
    let isActive = true;

    async function loadData() {
      if (!chartContainerRef.current || !isActive) return;

      const res = await fetch(
        `/api/eod-bars?symbol=${encodeURIComponent(symbol)}`,
      );
      const bars = await res.json();

      if (
        !Array.isArray(bars) ||
        bars.length === 0 ||
        !chartContainerRef.current
      ) {
        return;
      }

      chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 520,
        layout: {
          background: { type: ColorType.Solid, color: "#111827" },
          textColor: "#D1D5DB",
        },
        grid: {
          vertLines: { color: "#1F2937" },
          horzLines: { color: "#1F2937" },
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22C55E",
        downColor: "#EF4444",
        borderVisible: false,
        wickUpColor: "#22C55E",
        wickDownColor: "#EF4444",
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "",
      });

      candleSeries.setData(
        bars.map((bar: BarItem) => ({
          time: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      );

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.75,
          bottom: 0,
        },
      });

      volumeSeries.setData(
        bars.map((bar: BarItem) => ({
          time: bar.date,
          value: bar.volume,
          color: bar.close >= bar.open ? "#22C55E88" : "#EF444488",
        })),
      );

      chart.timeScale().fitContent();
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

  return <div ref={chartContainerRef} className="w-full" />;
}
