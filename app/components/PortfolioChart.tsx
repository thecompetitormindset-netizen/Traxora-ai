"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import { getPortfolio, STARTING_BALANCE, PORTFOLIO_UPDATED_EVENT, type Trade } from "../lib/trading";

type Point = { time: UTCTimestamp; value: number };

// Reconstruct equity curve from trade history.
// Works at cost-basis: equity = cash + holdings valued at their avg purchase price.
// This gives a true record of each trade's impact without needing live prices.
function buildEquityCurve(trades: Trade[]): Point[] {
  if (trades.length === 0) return [];

  // trades[] is newest-first — reverse for chronological order
  const sorted = [...trades].reverse();

  let cash = STARTING_BALANCE;
  const holdings: Record<string, { qty: number; avgPrice: number }> = {};
  const points: Point[] = [];

  // Anchor: starting balance one day before the first trade
  const firstMs = new Date(sorted[0].time).getTime();
  points.push({
    time: Math.floor((firstMs - 86_400_000) / 1000) as UTCTimestamp,
    value: STARTING_BALANCE,
  });

  let lastTs = points[0].time as number;

  for (const t of sorted) {
    if (t.side === "BUY") {
      cash -= t.quantity * t.price;
      const h = holdings[t.symbol];
      if (h) {
        const cost = h.avgPrice * h.qty + t.price * t.quantity;
        h.qty += t.quantity;
        h.avgPrice = cost / h.qty;
      } else {
        holdings[t.symbol] = { qty: t.quantity, avgPrice: t.price };
      }
    } else {
      const h = holdings[t.symbol];
      if (h) {
        cash += t.quantity * t.price;
        h.qty -= t.quantity;
        if (h.qty <= 0) delete holdings[t.symbol];
      }
    }

    const invested = Object.values(holdings).reduce(
      (s, h) => s + h.qty * h.avgPrice,
      0,
    );
    const equity = cash + invested;

    // Guarantee strictly increasing timestamps (lightweight-charts requirement)
    let ts = Math.floor(new Date(t.time).getTime() / 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;

    points.push({ time: ts as UTCTimestamp, value: equity });
  }

  return points;
}

export default function PortfolioChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [tradeCount, setTradeCount] = useState(0);

  // Load on mount and on every portfolio update
  useEffect(() => {
    function load() {
      const p = getPortfolio();
      setTradeCount(p.trades.length);
      setPoints(buildEquityCurve(p.trades));
    }
    load();
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, load);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, load);
  }, []);

  // Draw / redraw the chart whenever points change
  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;

    const latest = points[points.length - 1].value;
    const isProfit = latest >= STARTING_BALANCE;
    const lineColor = isProfit ? "#10B981" : "#F43F5E";
    const topColor  = isProfit ? "#10B98128" : "#F43F5E28";

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#4B5675",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#111827" },
        horzLines: { color: "#111827" },
      },
      crosshair: {
        vertLine: { color: "#4B5675", labelBackgroundColor: "#1C2333" },
        horzLine: { color: "#4B5675", labelBackgroundColor: "#1C2333" },
      },
      rightPriceScale: {
        borderColor: "#1C2333",
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#1C2333",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const area = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor: "transparent",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    area.setData(points);

    // Dashed baseline at the starting $10 000
    area.createPriceLine({
      price:               STARTING_BALANCE,
      color:               "#4B5675",
      lineWidth:           1,
      lineStyle:           2,        // dashed
      axisLabelVisible:    true,
      title:               `Start $${STARTING_BALANCE.toLocaleString()}`,
    });

    chart.timeScale().fitContent();

    return () => { chart.remove(); };
  }, [points]);

  // ── Empty states ─────────────────────────────────────────────────────────────
  if (tradeCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-52 text-center gap-2">
        <p className="text-4xl">📈</p>
        <p className="text-sm font-semibold text-[#F1F5F9]">No trades yet</p>
        <p className="text-xs text-[#4B5675] max-w-xs">
          Execute a paper trade and your portfolio equity curve will appear here.
        </p>
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-52 text-center gap-2">
        <p className="text-xs text-[#4B5675]">Need at least 2 trades to draw the curve.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-56" />;
}
