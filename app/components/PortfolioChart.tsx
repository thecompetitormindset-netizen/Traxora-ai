"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import { getPortfolio, STARTING_BALANCE, PORTFOLIO_UPDATED_EVENT, type Trade } from "../lib/trading";
import { appFontFamily } from "../lib/appFont";
import { Glyph } from "./Icon";

type Point = { time: UTCTimestamp; value: number };

// Build equity curve from trade history at cost basis for historical points.
// currentEquity is the live-priced value for today's endpoint.
function buildEquityCurve(trades: Trade[], currentEquity: number | null): Point[] {
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

    const invested = Object.values(holdings).reduce((s, h) => s + h.qty * h.avgPrice, 0);
    const equity   = cash + invested;

    // Guarantee strictly increasing timestamps (lightweight-charts requirement)
    let ts = Math.floor(new Date(t.time).getTime() / 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;

    points.push({ time: ts as UTCTimestamp, value: equity });
  }

  // Replace the final point with live-priced current equity so the chart's
  // endpoint matches the "Account Value" shown on the portfolio page.
  if (currentEquity !== null) {
    const nowTs = Math.max(Math.floor(Date.now() / 1000), lastTs + 1);
    // Only add if it's meaningfully different (avoids duplicate at same second)
    if (nowTs > lastTs) {
      points.push({ time: nowTs as UTCTimestamp, value: currentEquity });
    } else {
      // Replace last point
      points[points.length - 1] = { time: (lastTs + 1) as UTCTimestamp, value: currentEquity };
    }
  }

  return points;
}

export default function PortfolioChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints]         = useState<Point[]>([]);
  const [tradeCount, setTradeCount] = useState(0);
  // Live-priced current equity — matches portfolio page "Account Value"
  const [liveEquity, setLiveEquity] = useState<number | null>(null);

  // Fetch live prices for all open holdings to compute current equity
  async function fetchLiveEquity() {
    const p = getPortfolio();
    if (p.holdings.length === 0) {
      setLiveEquity(p.cash);
      return;
    }
    try {
      const results = await Promise.allSettled(
        p.holdings.map(async (h) => {
          const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(h.symbol)}`, { cache: "no-store" });
          const data = await res.json();
          const price = typeof data.price === "number" ? data.price : h.avgPrice;
          return price * h.quantity;
        }),
      );
      const marketValue = results.reduce((s, r) => s + (r.status === "fulfilled" ? r.value : 0), 0);
      setLiveEquity(p.cash + marketValue);
    } catch {
      // Fall back to cost basis
      const costValue = p.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
      setLiveEquity(p.cash + costValue);
    }
  }

  useEffect(() => {
    function load() {
      const p = getPortfolio();
      setTradeCount(p.trades.length);
      // Build curve first (will be rebuilt again once liveEquity arrives)
      setPoints(buildEquityCurve(p.trades, null));
    }
    load();
    fetchLiveEquity();
    function onUpdate() { load(); fetchLiveEquity(); }
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once live equity arrives, rebuild points with the live endpoint
  useEffect(() => {
    if (liveEquity === null) return;
    const p = getPortfolio();
    setPoints(buildEquityCurve(p.trades, liveEquity));
  }, [liveEquity]);

  // Draw / redraw the chart whenever points change
  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;

    const latest  = points[points.length - 1].value;
    const isProfit = latest >= STARTING_BALANCE;
    const lineColor = isProfit ? "#10B981" : "#F43F5E";
    const topColor  = isProfit ? "#10B98128" : "#F43F5E28";

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        fontFamily: appFontFamily(),
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#4B5675",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1A1838" },
        horzLines: { color: "#1A1838" },
      },
      crosshair: {
        vertLine: { color: "#4B5675", labelBackgroundColor: "#252345" },
        horzLine: { color: "#4B5675", labelBackgroundColor: "#252345" },
      },
      rightPriceScale: {
        borderColor: "#252345",
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#252345",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale:  true,
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

    // Dashed baseline at starting balance
    area.createPriceLine({
      price:            STARTING_BALANCE,
      color:            "#4B5675",
      lineWidth:        1,
      lineStyle:        2, // dashed
      axisLabelVisible: true,
      title:            `Start $${STARTING_BALANCE.toLocaleString()}`,
    });

    chart.timeScale().fitContent();

    return () => { chart.remove(); };
  }, [points]);

  if (tradeCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-52 text-center gap-2">
        <p className="text-4xl"><Glyph e="📈" /></p>
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
        <p className="text-xs text-[#4B5675]">Need at least 2 data points to draw the curve.</p>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="w-full h-56" />
      <p className="text-[9px] text-[#333368] mt-1 px-1">
        Historical points at cost basis · rightmost point at live market price
      </p>
    </div>
  );
}
