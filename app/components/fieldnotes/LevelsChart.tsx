"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { THEME_EVENT } from "../../lib/theme";
import { fmtLevel, fmtNum } from "./format";
import { appFontFamily } from "../../lib/appFont";

export type ChartLevel = { price: number; label: string; group: OverlayGroup; tone: "pos" | "neg" | "copper" | "info" | "muted"; style: "solid" | "dashed" | "dotted" };
export type OverlayGroup = "plan" | "levels" | "strikes" | "expected";
type Bar = { date: string; open: number; high: number; low: number; close: number };

const GROUP_LABEL: Record<OverlayGroup, string> = {
  plan: "Target & invalidation", levels: "Support & resistance", strikes: "Strikes", expected: "Expected move",
};

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#888";
}

export default function LevelsChart({ bars, levels, todayLabel, dataLabel }: {
  bars: Bar[];
  levels: ChartLevel[];
  todayLabel: string | null;  // e.g. "latest bar is today's session in progress"
  dataLabel: string;          // "Delayed", "Historical", "Your"
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const available = [...new Set(levels.map(l => l.group))];
  const [on, setOn] = useState<Record<OverlayGroup, boolean>>({ plan: true, levels: true, strikes: true, expected: false });
  const [themeTick, setThemeTick] = useState(0);
  // On narrow charts, in-chart titles would cover the candles; the axis label
  // still shows each price and the table below names every level.
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const h = () => setThemeTick(t => t + 1);
    window.addEventListener(THEME_EVENT, h);
    return () => window.removeEventListener(THEME_EVENT, h);
  }, []);

  // Build the chart once per theme; price lines are updated separately so an
  // overlay toggle never rebuilds the chart.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || bars.length === 0) return;
    // Theme attribute flips synchronously before the event; read vars next frame.
    const id = requestAnimationFrame(() => {
      const text = cssVar(host, "--fn-text-2"), rule = cssVar(host, "--fn-rule"), surface = cssVar(host, "--fn-surface");
      const pos = cssVar(host, "--fn-pos"), neg = cssVar(host, "--fn-neg"), muted = cssVar(host, "--fn-muted");
      const chart = createChart(host, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: surface }, textColor: text, fontSize: 12, fontFamily: appFontFamily(), attributionLogo: false },
        grid: { vertLines: { color: rule }, horzLines: { color: rule } },
        crosshair: {
          mode: CrosshairMode.Normal,
          // The horizontal crosshair label would sit on the price axis on top of
          // level labels (including invalidation) — keep it off.
          horzLine: { color: muted, labelVisible: false, style: LineStyle.Dotted },
          vertLine: { color: muted, style: LineStyle.Dotted },
        },
        rightPriceScale: { borderColor: rule },
        timeScale: { borderColor: rule },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: pos, downColor: neg, borderUpColor: pos, borderDownColor: neg, wickUpColor: pos, wickDownColor: neg,
        priceLineVisible: false, lastValueVisible: true,
      });
      series.setData(bars.map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));
      chart.timeScale().fitContent();
      chartRef.current = chart;
      seriesRef.current = series;
      drawLines();
    });
    return () => {
      cancelAnimationFrame(id);
      linesRef.current = [];
      seriesRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, themeTick]);

  function drawLines() {
    const series = seriesRef.current, host = hostRef.current;
    if (!series || !host) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    const color = { pos: cssVar(host, "--fn-pos"), neg: cssVar(host, "--fn-neg"), copper: cssVar(host, "--fn-copper"), info: cssVar(host, "--fn-info"), muted: cssVar(host, "--fn-muted") };
    for (const l of levels) {
      if (!on[l.group]) continue;
      linesRef.current.push(series.createPriceLine({
        price: l.price,
        color: color[l.tone],
        lineWidth: l.group === "plan" ? 2 : 1,
        lineStyle: l.style === "solid" ? LineStyle.Solid : l.style === "dashed" ? LineStyle.Dashed : LineStyle.Dotted,
        axisLabelVisible: true,
        title: narrow && l.group !== "plan" ? "" : l.label,
      }));
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { drawLines(); }, [on, levels, narrow]);

  if (bars.length === 0) {
    return <p className="fn-meta">Price history unavailable for this analysis.</p>;
  }

  const last = bars[bars.length - 1];
  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
        <p className="fn-meta">
          <span className="fn-label" style={{ color: "var(--fn-text)" }}>Daily</span> · last {bars.length} sessions ·{" "}
          <span className="fn-caution">{dataLabel}</span> data{todayLabel ? ` · ${todayLabel}` : ""}
        </p>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Chart overlays">
            {available.map(g => (
              <button key={g} type="button" className="fn-chip" aria-pressed={on[g]} onClick={() => setOn(s => ({ ...s, [g]: !s[g] }))}>
                {GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        )}
      </div>
      {narrow && <p className="fn-meta" style={{ marginBottom: 8 }}>Level names are listed in the table below the chart.</p>}
      <div className="fn-corners">
        {/* The canvas is not keyboard-focusable; the same data is in the table below. */}
        <div ref={hostRef} style={{ height: 320, width: "100%" }} aria-hidden="true" />
      </div>
      <details className="fn-details" style={{ marginTop: 10 }}>
        <summary>Chart data as a table</summary>
        <div className="fn-scroll-x" tabIndex={0} role="region" aria-label="Chart levels and recent bars">
          <table className="fn-ledger" style={{ marginTop: 6 }}>
            <caption className="fn-sr-only">Levels drawn on the chart</caption>
            <thead><tr><th scope="col">Level</th><th scope="col" className="fn-r">Price</th><th scope="col">Shown</th></tr></thead>
            <tbody>
              {[...levels].sort((a, b) => b.price - a.price).map(l => (
                <tr key={`${l.label}-${l.price}`}><td>{l.label}</td><td className="fn-r">{fmtLevel(l.price)}</td><td>{on[l.group] ? "Yes" : "Hidden"}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="fn-ledger" style={{ marginTop: 12 }}>
            <caption className="fn-sr-only">Last 10 daily bars</caption>
            <thead><tr><th scope="col">Date</th><th scope="col" className="fn-r">Open</th><th scope="col" className="fn-r">High</th><th scope="col" className="fn-r">Low</th><th scope="col" className="fn-r">Close</th></tr></thead>
            <tbody>
              {bars.slice(-10).reverse().map(b => (
                <tr key={b.date}><td className="fn-numcell">{b.date}{b === last && todayLabel ? " (in progress)" : ""}</td><td className="fn-r">{fmtNum(b.open)}</td><td className="fn-r">{fmtNum(b.high)}</td><td className="fn-r">{fmtNum(b.low)}</td><td className="fn-r">{fmtNum(b.close)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
