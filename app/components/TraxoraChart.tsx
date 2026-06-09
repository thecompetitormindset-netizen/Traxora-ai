"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, ColorType, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type CandlestickData,
  type CandlestickSeriesPartialOptions, type IPriceLine,
  type Time,
} from "lightweight-charts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Interval = "1H" | "1D" | "1W";
type RawBar   = { time: number; open: number; high: number; low: number; close: number; volume: number };
type OhlcBar  = { time: Time; open: number; high: number; low: number; close: number };
type VolBar   = { time: Time; value: number; color: string };
type LineBar  = { time: Time; value: number };

type Tooltip = {
  x: number; y: number; time: string;
  open: number; high: number; low: number; close: number; volume: number;
  ema9: number | null; ema50: number | null;
  vwap: number | null; rsi: number | null;
} | null;

export type ChartSignal = {
  signal:     "BUY" | "SELL";
  confidence: "High" | "Medium" | "Low";
  entry:      string;   // e.g. "$210.00 – $211.50"
  stop:       string;   // e.g. "$207.80"
  target:     string;   // e.g. "$218.00"
  rrRatio?:   string;
  summary?:   string;
};

// ── Timeframes ────────────────────────────────────────────────────────────────

const INTERVALS: { label: string; value: Interval; apiInterval: string; apiRange: string }[] = [
  { label: "1H", value: "1H", apiInterval: "1h", apiRange: "30d"  },
  { label: "1D", value: "1D", apiInterval: "1d", apiRange: "365d" },
  { label: "1W", value: "1W", apiInterval: "1w", apiRange: "730d" },
];

// ── Colors ────────────────────────────────────────────────────────────────────

const C_DARK = {
  bg:       "#0D0B1A",
  panel:    "#13112A",
  border:   "#1C1933",
  borderH:  "#252345",
  dim:      "#4B5675",
  mid:      "#7B8DB4",
  bright:   "#CBD5E1",
  bull:     "#10B981",
  bear:     "#F43F5E",
  bullDim:  "#10B98118",
  bearDim:  "#F43F5E18",
  trend:    "#22D3EE",
  longT:    "#A78BFA",
  fair:     "#F59E0B",
  momentum: "#E879F9",
  entry:    "#F59E0B",
  stop:     "#F43F5E",
  target:   "#10B981",
};

const C_LIGHT = {
  bg:       "#FAFBFE",
  panel:    "#F2F5FA",
  border:   "#E1E8F4",
  borderH:  "#C8D4E8",
  dim:      "#94A3B8",
  mid:      "#64748B",
  bright:   "#0F172A",
  bull:     "#059669",
  bear:     "#E11D48",
  bullDim:  "#05966916",
  bearDim:  "#E11D4816",
  trend:    "#0891B2",
  longT:    "#7C3AED",
  fair:     "#D97706",
  momentum: "#C026D3",
  entry:    "#D97706",
  stop:     "#E11D48",
  target:   "#059669",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ema(bars: OhlcBar[], period: number): LineBar[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  let val = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  const out: LineBar[] = [{ time: bars[period - 1].time, value: +val.toFixed(5) }];
  for (let i = period; i < bars.length; i++) {
    val = bars[i].close * k + val * (1 - k);
    out.push({ time: bars[i].time, value: +val.toFixed(5) });
  }
  return out;
}

function vwap(bars: RawBar[]): LineBar[] {
  const out: LineBar[] = [];
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    cumPV += ((b.high + b.low + b.close) / 3) * b.volume;
    cumV  += b.volume;
    if (cumV > 0) out.push({ time: toTime(b.time), value: +(cumPV / cumV).toFixed(5) });
  }
  return out;
}

function rsiCalc(bars: OhlcBar[], period = 14): LineBar[] {
  if (bars.length < period + 1) return [];
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d > 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  const out: LineBar[] = [{ time: bars[period].time, value: +(l === 0 ? 100 : 100 - 100 / (1 + g / l)).toFixed(2) }];
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    g = (g * (period - 1) + (d > 0 ? d : 0)) / period;
    l = (l * (period - 1) + (d < 0 ? -d : 0)) / period;
    out.push({ time: bars[i].time, value: +(l === 0 ? 100 : 100 - 100 / (1 + g / l)).toFixed(2) });
  }
  return out;
}

function bbCalc(bars: OhlcBar[], period = 20, mult = 2) {
  const upper: LineBar[] = [], mid: LineBar[] = [], lower: LineBar[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const sl = bars.slice(i - period + 1, i + 1);
    const mean = sl.reduce((s, b) => s + b.close, 0) / period;
    const sd = Math.sqrt(sl.reduce((s, b) => s + (b.close - mean) ** 2, 0) / period);
    mid.push({ time: bars[i].time, value: +mean.toFixed(5) });
    upper.push({ time: bars[i].time, value: +(mean + mult * sd).toFixed(5) });
    lower.push({ time: bars[i].time, value: +(mean - mult * sd).toFixed(5) });
  }
  return { upper, mid, lower };
}

function aggregateWeekly(bars: RawBar[]): RawBar[] {
  const m = new Map<string, RawBar>();
  for (const b of bars) {
    const d = new Date(b.time * 1000), day = d.getUTCDay();
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    const key = mon.toISOString().slice(0, 10);
    const cur = m.get(key);
    if (!cur) m.set(key, { ...b, time: Math.floor(mon.getTime() / 1000) });
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume; }
  }
  return [...m.values()].sort((a, b) => a.time - b.time);
}

function toTime(ts: number): Time { return Math.floor(ts) as Time; }

function fmtP(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 10)    return n.toFixed(2);
  return n.toFixed(4);
}
function fmtV(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function parsePrice(s: string): number | null {
  const m = s.match(/[\d]+\.?\d*/);
  const n = m ? parseFloat(m[0]) : NaN;
  return isNaN(n) ? null : n;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TraxoraChartProps {
  symbol:          string;
  height?:         number;
  isExpanded?:     boolean;
  onExpandToggle?: () => void;
  signalData?:     ChartSignal | null;
}

export default function TraxoraChart({ symbol, height = 480, isExpanded, onExpandToggle, signalData }: TraxoraChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Theme awareness ───────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    update();
    window.addEventListener("theme-changed", update);
    return () => window.removeEventListener("theme-changed", update);
  }, []);
  const C = isDark ? C_DARK : C_LIGHT;
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Ref      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref     = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref     = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiOsRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLoRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const closeLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Signal price lines
  const entryLineRef  = useRef<IPriceLine | null>(null);
  const stopLineRef   = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);

  const [interval,    setIntervalState] = useState<Interval>("1D");
  const [loading,     setLoading]       = useState(true);
  const [error,       setError]         = useState(false);
  const [lastPrice,   setLastPrice]     = useState<number | null>(null);
  const [lastChg,     setLastChg]       = useState<number | null>(null);
  const [lastBar,     setLastBar]       = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);
  const [tooltip,     setTooltip]       = useState<Tooltip>(null);
  const [fullscreen,  setFullscreen]    = useState(false);
  const [chartType,   setChartType]     = useState<"candle" | "line">("candle");
  const allBarsRef                      = useRef<RawBar[]>([]);

  const [showTrend,    setShowTrend]    = useState(false);
  const [showLongT,    setShowLongT]    = useState(false);
  const [showFair,     setShowFair]     = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);
  const [showBB,       setShowBB]       = useState(false);
  const [showSignals,  setShowSignals]  = useState(true);

  const isIntraday = interval === "1H";
  const clean      = symbol.replace(".US", "").replace(".COMM", "");
  const isFutures  = symbol.endsWith(".COMM");

  // ESC exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [fullscreen]);

  // ── Signal price lines ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return;
    // Remove old lines
    if (entryLineRef.current)  { try { candleRef.current.removePriceLine(entryLineRef.current);  } catch { /* ok */ } entryLineRef.current  = null; }
    if (stopLineRef.current)   { try { candleRef.current.removePriceLine(stopLineRef.current);   } catch { /* ok */ } stopLineRef.current   = null; }
    if (targetLineRef.current) { try { candleRef.current.removePriceLine(targetLineRef.current); } catch { /* ok */ } targetLineRef.current = null; }

    if (!signalData || !showSignals) return;

    const entryP  = parsePrice(signalData.entry);
    const stopP   = parsePrice(signalData.stop);
    const targetP = parsePrice(signalData.target);

    if (entryP)  entryLineRef.current  = candleRef.current.createPriceLine({ price: entryP,  color: C.entry,  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Entry" });
    if (stopP)   stopLineRef.current   = candleRef.current.createPriceLine({ price: stopP,   color: C.stop,   lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Stop"  });
    if (targetP) targetLineRef.current = candleRef.current.createPriceLine({ price: targetP, color: C.target, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Target"});
  }, [signalData, showSignals]);

  // ── Toggle candle / line visibility ──────────────────────────────────────────
  useEffect(() => {
    candleRef.current?.applyOptions({ visible: chartType === "candle" });
    closeLineRef.current?.applyOptions({ visible: chartType === "line" });
  }, [chartType]);

  // ── Create chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor:  C.mid,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize:   11,
      },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: {
        mode: 1,
        vertLine: { color: C.borderH, width: 1, style: 2, labelBackgroundColor: C.panel },
        horzLine: { color: C.borderH, width: 1, style: 2, labelBackgroundColor: C.panel },
      },
      rightPriceScale: { borderColor: C.borderH, scaleMargins: { top: 0.08, bottom: 0.20 }, textColor: C.mid },
      timeScale: { borderColor: C.borderH, timeVisible: true, secondsVisible: false, barSpacing: 10, minBarSpacing: 3 },
    });

    chartRef.current = chart;

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: C.bull, downColor: C.bear,
      borderUpColor: C.bull, borderDownColor: C.bear,
      wickUpColor: C.bull + "BB", wickDownColor: C.bear + "BB",
    } as CandlestickSeriesPartialOptions);

    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    ema9Ref.current  = chart.addSeries(LineSeries, { color: C.trend,       lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: C.trend + "80",lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: C.longT,        lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    vwapRef.current  = chart.addSeries(LineSeries, { color: C.fair,         lineWidth: 2, lineStyle: 1, priceLineVisible: false, lastValueVisible: true,  crosshairMarkerVisible: false });

    bbUpRef.current  = chart.addSeries(LineSeries, { color: C.longT + "70", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbMidRef.current = chart.addSeries(LineSeries, { color: C.longT + "40", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbLoRef.current  = chart.addSeries(LineSeries, { color: C.longT + "70", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    rsiRef.current   = chart.addSeries(LineSeries, { color: C.momentum, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,  crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiObRef.current = chart.addSeries(LineSeries, { color: C.bear + "40", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiOsRef.current = chart.addSeries(LineSeries, { color: C.bull + "40", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 }, borderColor: C.border, textColor: C.bright });

    // Line chart series — hidden by default; shown when chartType === "line"
    closeLineRef.current = chart.addSeries(LineSeries, {
      color: C.bull, lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
      visible: false,
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) { setTooltip(null); return; }
      const ts   = param.time as number;
      const bar  = allBarsRef.current.find(b => toTime(b.time) === ts);
      if (!bar) { setTooltip(null); return; }
      const dt   = new Date(ts * 1000);
      const timeLabel = isIntraday
        ? dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
        : dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      const getLine = (ref: React.RefObject<ISeriesApi<"Line"> | null>) =>
        ref.current ? ((param.seriesData.get(ref.current) as { value?: number } | undefined)?.value ?? null) : null;
      setTooltip({ x: param.point.x, y: param.point.y, time: timeLabel, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, ema9: getLine(ema9Ref), ema50: getLine(ema50Ref), vwap: getLine(vwapRef), rsi: getLine(rsiRef) });
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 }));
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect(); chart.remove();
      chartRef.current = candleRef.current = volRef.current = closeLineRef.current = null;
      ema9Ref.current = ema21Ref.current = ema50Ref.current = vwapRef.current = null;
      bbUpRef.current = bbMidRef.current = bbLoRef.current = null;
      rsiRef.current = rsiObRef.current = rsiOsRef.current = null;
      entryLineRef.current = stopLineRef.current = targetLineRef.current = null;
    };
  }, [isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true); setError(false); setTooltip(null);

    try {
      let raw: RawBar[] = [];
      if (interval === "1H") {
        const res  = await fetch(`/api/intraday-bars?symbol=${encodeURIComponent(symbol)}&interval=1h&range=30d`);
        const data = await res.json();
        raw = data.bars ?? [];
      } else {
        const res  = await fetch(`/api/eod-bars?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          raw = data.map((b: { date: string; open: number; high: number; low: number; close: number; volume: number }) => ({
            time: Math.floor(new Date(b.date).getTime() / 1000),
            open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0,
          }));
          if (interval === "1W") raw = aggregateWeekly(raw);
        }
      }

      if (!raw.length) { setError(true); setLoading(false); return; }
      const seen = new Set<number>();
      raw = raw.filter(b => { if (seen.has(b.time)) return false; seen.add(b.time); return true; });
      raw.sort((a, b) => a.time - b.time);
      allBarsRef.current = raw;

      const candles: OhlcBar[] = raw.map(b => ({ time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close }));
      const volumes: VolBar[]  = raw.map(b => ({ time: toTime(b.time), value: b.volume, color: b.close >= b.open ? C.bullDim : C.bearDim }));

      const lineData: LineBar[] = raw.map(b => ({ time: toTime(b.time), value: b.close }));
      candleRef.current?.setData(candles as CandlestickData[]);
      closeLineRef.current?.setData(lineData);
      volRef.current?.setData(volumes);
      ema9Ref.current?.setData(showTrend  ? ema(candles, 9)  : []);
      ema21Ref.current?.setData(showTrend ? ema(candles, 21) : []);
      ema50Ref.current?.setData(showLongT ? ema(candles, 50) : []);
      vwapRef.current?.setData(showFair && isIntraday ? vwap(raw) : []);

      if (showBB && candles.length >= 20) {
        const bb = bbCalc(candles);
        bbUpRef.current?.setData(bb.upper); bbMidRef.current?.setData(bb.mid); bbLoRef.current?.setData(bb.lower);
      } else { bbUpRef.current?.setData([]); bbMidRef.current?.setData([]); bbLoRef.current?.setData([]); }

      if (showMomentum && candles.length > 15) {
        const r = rsiCalc(candles);
        rsiRef.current?.setData(r);
        const t0 = candles[0].time, t1 = candles[candles.length - 1].time;
        rsiObRef.current?.setData([{ time: t0, value: 70 }, { time: t1, value: 70 }]);
        rsiOsRef.current?.setData([{ time: t0, value: 30 }, { time: t1, value: 30 }]);
      } else { rsiRef.current?.setData([]); rsiObRef.current?.setData([]); rsiOsRef.current?.setData([]); }

      chartRef.current?.timeScale().fitContent();
      const last = raw[raw.length - 1], prev = raw[raw.length - 2];
      setLastPrice(last.close);
      setLastBar({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
      setLastChg(prev ? ((last.close - prev.close) / prev.close) * 100 : null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [symbol, interval, showTrend, showLongT, showFair, showMomentum, showBB, isIntraday, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const isBull   = lastChg != null ? lastChg >= 0 : true;
  const rsiVal   = tooltip?.rsi ?? null;
  const rsiColor = rsiVal == null ? C.momentum : rsiVal > 70 ? C.bear : rsiVal < 30 ? C.bull : C.momentum;

  const TIP_W = 168;
  const tipX  = tooltip ? Math.max(4, Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 600) - TIP_W - 4)) : 0;
  const tipY  = tooltip ? Math.max(8, tooltip.y - 110) : 0;

  function Chip({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border"
        style={active
          ? { color: "#E2E8F0", background: color + "18", borderColor: color + "40" }
          : { color: C.dim, background: "transparent", borderColor: "transparent" }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? color : C.border }} />
        {label}
      </button>
    );
  }

  // ── Signal parsed prices ──────────────────────────────────────────────────────
  const entryP  = signalData ? parsePrice(signalData.entry)  : null;
  const stopP   = signalData ? parsePrice(signalData.stop)   : null;
  const targetP = signalData ? parsePrice(signalData.target) : null;
  const signalBull = signalData?.signal === "BUY";

  return (
    <>
    {/* Backdrop */}
    {fullscreen && <div className="fixed inset-0 z-[199] bg-black/70 backdrop-blur-sm" onClick={() => setFullscreen(false)} />}

    <div
      className={`overflow-hidden select-none transition-all duration-300 ${
        fullscreen
          ? "fixed inset-0 sm:inset-3 z-[200] sm:rounded-2xl shadow-2xl shadow-black/80 flex flex-col"
          : "rounded-2xl"
      }`}
      style={{ background: C.bg, border: `1px solid ${C.borderH}` }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>

        {/* Row 1: symbol + price + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-2 h-2">
                <span className="absolute inset-0 rounded-full" style={{ background: C.bull }} />
                <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: C.bull }} />
              </div>
              <span className="font-black tracking-tight text-sm" style={{ color: C.bright }}>{clean}</span>
              {isFutures && <span className="text-[7px] font-black px-1.5 py-0.5 rounded" style={{ background: "#7C3AED18", color: C.longT, border: `1px solid ${C.longT}30` }}>FUT</span>}
            </div>
            {lastPrice != null && !loading && (
              <div className="flex items-center gap-2">
                <span className="text-xl font-black font-mono" style={{ color: isBull ? C.bull : C.bear }}>${fmtP(lastPrice)}</span>
                {lastChg != null && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg font-mono"
                    style={{ color: isBull ? C.bull : C.bear, background: isBull ? C.bullDim : C.bearDim }}>
                    {lastChg >= 0 ? "+" : ""}{lastChg.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            {loading && <div className="h-6 w-28 rounded-lg animate-pulse" style={{ background: C.border }} />}

            {/* OHLCV bar — always show in fullscreen, hover-only otherwise */}
            {lastBar && !loading && fullscreen && (
              <div className="flex items-center gap-3 pl-2 border-l" style={{ borderColor: C.border }}>
                {[
                  { l: "O", v: lastBar.o, c: C.mid },
                  { l: "H", v: lastBar.h, c: C.bull },
                  { l: "L", v: lastBar.l, c: C.bear },
                  { l: "C", v: lastBar.c, c: lastBar.c >= lastBar.o ? C.bull : C.bear },
                ].map(r => (
                  <span key={r.l} className="text-[10px] font-mono">
                    <span style={{ color: C.dim }}>{r.l} </span>
                    <span style={{ color: r.c }} className="font-bold">{fmtP(r.v)}</span>
                  </span>
                ))}
                {lastBar.v > 0 && (
                  <span className="text-[10px] font-mono">
                    <span style={{ color: C.dim }}>VOL </span>
                    <span style={{ color: C.mid }} className="font-bold">{fmtV(lastBar.v)}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Chart type toggle */}
            <div className="flex items-center gap-px p-1 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setChartType("candle")} title="Candlestick"
                className="px-2 py-1 rounded-lg transition-all flex items-center justify-center"
                style={chartType === "candle" ? { background: C.borderH, color: C.bull } : { color: C.dim }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="8" width="5" height="10" rx="1"/><line x1="5.5" y1="4" x2="5.5" y2="8"/><line x1="5.5" y1="18" x2="5.5" y2="21"/>
                  <rect x="16" y="5" width="5" height="10" rx="1"/><line x1="18.5" y1="2" x2="18.5" y2="5"/><line x1="18.5" y1="15" x2="18.5" y2="20"/>
                </svg>
              </button>
              <button type="button" onClick={() => setChartType("line")} title="Line"
                className="px-2 py-1 rounded-lg transition-all flex items-center justify-center"
                style={chartType === "line" ? { background: C.borderH, color: C.bull } : { color: C.dim }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 17 8 10 13 13 21 5"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-px p-1 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              {INTERVALS.map(iv => (
                <button key={iv.value} type="button" onClick={() => setIntervalState(iv.value)}
                  className="px-3 py-1 rounded-lg text-[10px] font-bold transition-all"
                  style={interval === iv.value ? { background: C.borderH, color: C.bull } : { color: C.dim }}>
                  {iv.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setFullscreen(v => !v)} title={fullscreen ? "Exit (Esc)" : "Full screen"}
              className="p-2 sm:p-1.5 rounded-lg transition-all min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
              style={{ background: fullscreen ? C.borderH : C.panel, border: `1px solid ${fullscreen ? C.borderH : C.border}`, color: fullscreen ? C.bright : C.dim }}>
              {fullscreen
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Indicator chips */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <Chip active={showTrend}    color={C.trend}    label="Trend"        onClick={() => setShowTrend(v => !v)} />
          <Chip active={showLongT}    color={C.longT}    label="Long Trend"   onClick={() => setShowLongT(v => !v)} />
          {isIntraday && <Chip active={showFair} color={C.fair} label="Fair Price" onClick={() => setShowFair(v => !v)} />}
          <Chip active={showMomentum} color={C.momentum} label="Momentum"     onClick={() => setShowMomentum(v => !v)} />
          {/* BB only in fullscreen — takes up space otherwise */}
          {fullscreen && <Chip active={showBB} color={C.longT} label="Volatility" onClick={() => setShowBB(v => !v)} />}
          {/* Signal lines toggle */}
          {signalData && (
            <Chip active={showSignals} color={signalBull ? C.bull : C.bear} label="Signal Lines" onClick={() => setShowSignals(v => !v)} />
          )}
        </div>
      </div>

      {/* ── Chart area + optional signal panel ── */}
      <div className={`flex-1 flex min-h-0 ${fullscreen ? "flex-col sm:flex-row" : ""}`}>

        {/* Chart canvas */}
        <div className={`relative flex-1 min-w-0 ${fullscreen ? "min-h-0" : ""}`}>
          <div
            ref={containerRef}
            className={fullscreen ? "w-full h-full" : ""}
            style={fullscreen ? undefined : { height }}
          />

          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[28px] font-black tracking-[0.45em] uppercase" style={{ color: "#110F20" }}>TRAXORA</span>
          </div>

          {/* Floating tooltip */}
          {tooltip && (
            <div className="absolute pointer-events-none z-10 rounded-xl px-3 py-2.5 text-[10px] font-mono"
              style={{ left: tipX, top: tipY, minWidth: TIP_W, background: C.panel + "F0", border: `1px solid ${C.borderH}`, backdropFilter: "blur(8px)" }}>
              <p className="font-semibold mb-2" style={{ color: C.bright }}>{tooltip.time}</p>
              <div className="space-y-0.5">
                {[
                  { l: "Open",  v: tooltip.open,  c: C.bright },
                  { l: "High",  v: tooltip.high,  c: C.bull   },
                  { l: "Low",   v: tooltip.low,   c: C.bear   },
                  { l: "Close", v: tooltip.close, c: tooltip.close >= tooltip.open ? C.bull : C.bear },
                ].map(r => (
                  <div key={r.l} className="flex justify-between gap-4">
                    <span style={{ color: C.dim }}>{r.l}</span>
                    <span style={{ color: r.c }} className="font-bold">${fmtP(r.v)}</span>
                  </div>
                ))}
              </div>
              {((showTrend && tooltip.ema9) || (showLongT && tooltip.ema50) || (showFair && tooltip.vwap) || (showMomentum && rsiVal)) && (
                <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: `1px solid ${C.border}` }}>
                  {showTrend    && tooltip.ema9  && <div className="flex justify-between gap-4"><span style={{ color: C.trend    }}>Trend</span><span style={{ color: C.trend    }} className="font-bold">${fmtP(tooltip.ema9)}</span></div>}
                  {showLongT    && tooltip.ema50 && <div className="flex justify-between gap-4"><span style={{ color: C.longT    }}>Long Trend</span><span style={{ color: C.longT    }} className="font-bold">${fmtP(tooltip.ema50)}</span></div>}
                  {showFair     && tooltip.vwap  && <div className="flex justify-between gap-4"><span style={{ color: C.fair     }}>Fair Price</span><span style={{ color: C.fair     }} className="font-bold">${fmtP(tooltip.vwap)}</span></div>}
                  {showMomentum && rsiVal        && <div className="flex justify-between gap-4"><span style={{ color: rsiColor   }}>Momentum</span><span style={{ color: rsiColor   }} className="font-bold">{rsiVal.toFixed(0)}{rsiVal > 70 ? " — high" : rsiVal < 30 ? " — low" : ""}</span></div>}
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: C.bg }}>
              <div className="flex items-end gap-[3px] h-10">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-2 rounded-sm"
                    style={{ height: `${16 + Math.abs(Math.sin(i * 0.75)) * 24}px`, background: i % 3 === 2 ? C.bear + "30" : C.bull + "28", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 70}ms` }} />
                ))}
              </div>
              <p className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: C.dim }}>Loading {clean}…</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: C.bg }}>
              <p className="text-sm" style={{ color: C.bright }}>Chart unavailable</p>
              <button type="button" onClick={loadData} className="text-[10px] font-bold font-mono" style={{ color: C.bull }}>RETRY →</button>
            </div>
          )}
        </div>

        {/* ── Signal panel — only in fullscreen with signal data, hidden on mobile portrait ── */}
        {fullscreen && signalData && (
          <div className="hidden sm:flex sm:w-52 shrink-0 flex-col gap-3 p-4 overflow-y-auto" style={{ borderLeft: `1px solid ${C.borderH}` }}>
            {/* Signal badge */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.dim }}>AI Signal</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-black px-3 py-1 rounded-lg border"
                  style={signalBull
                    ? { color: C.bull, background: C.bullDim, borderColor: C.bull + "40" }
                    : { color: C.bear, background: C.bearDim, borderColor: C.bear + "40" }}>
                  {signalData.signal}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: signalData.confidence === "High" ? C.bull : signalData.confidence === "Low" ? C.bear : C.fair }}>
                  {signalData.confidence}
                </span>
              </div>
              {signalData.rrRatio && <p className="text-[10px]" style={{ color: C.dim }}>R:R <span className="font-bold" style={{ color: C.bright }}>{signalData.rrRatio}</span></p>}
            </div>

            {/* Price levels */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: C.dim }}>Price Levels</p>
              {[
                { label: "Entry",  value: signalData.entry,  color: C.entry,  dot: true  },
                { label: "Stop",   value: signalData.stop,   color: C.stop,   dot: true  },
                { label: "Target", value: signalData.target, color: C.target, dot: true  },
              ].map(r => (
                <div key={r.label} className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: r.color }} />
                    <span className="text-[10px]" style={{ color: C.dim }}>{r.label}</span>
                  </div>
                  <span className="text-[10px] font-bold font-mono text-right" style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Risk visualizer */}
            {entryP && stopP && targetP && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.dim }}>Risk / Reward</p>
                <div className="rounded-xl overflow-hidden h-2 mb-2" style={{ background: C.border }}>
                  {signalBull ? (
                    <div className="h-full flex">
                      <div style={{ flex: Math.abs(entryP - stopP), background: C.bear + "80" }} />
                      <div style={{ flex: Math.abs(targetP - entryP), background: C.bull + "80" }} />
                    </div>
                  ) : (
                    <div className="h-full flex">
                      <div style={{ flex: Math.abs(targetP - entryP), background: C.bull + "80" }} />
                      <div style={{ flex: Math.abs(entryP - stopP), background: C.bear + "80" }} />
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-[8px]" style={{ color: C.bear }}>Risk {fmtP(Math.abs(entryP - stopP))}</span>
                  <span className="text-[8px]" style={{ color: C.bull }}>Reward {fmtP(Math.abs(targetP - entryP))}</span>
                </div>
              </div>
            )}

            {/* Summary */}
            {signalData.summary && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: C.dim }}>Why</p>
                <p className="text-[10px] leading-relaxed" style={{ color: C.mid }}>{signalData.summary.slice(0, 200)}{signalData.summary.length > 200 ? "…" : ""}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-1.5 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        <span className="text-[7px] font-black tracking-widest uppercase" style={{ color: "#191630" }}>Traxora AI</span>
        <span className="text-[7px] font-mono" style={{ color: "#191630" }}>Not financial advice</span>
      </div>
    </div>
    </>
  );
}
