"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, ColorType,
  CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type CandlestickData,
  type CandlestickSeriesPartialOptions,
  type Time,
} from "lightweight-charts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Interval = "1H" | "1D" | "1W";
type RawBar  = { time: number; open: number; high: number; low: number; close: number; volume: number };
type OhlcBar = { time: Time; open: number; high: number; low: number; close: number };
type VolBar  = { time: Time; value: number; color: string };
type LineBar = { time: Time; value: number };

type Tooltip = {
  x: number; y: number;
  time: string;
  open: number; high: number; low: number; close: number;
  volume: number;
  ema9: number | null; ema50: number | null;
  vwap: number | null; rsi: number | null;
} | null;

// ── Timeframes ────────────────────────────────────────────────────────────────

const INTERVALS: { label: string; value: Interval; apiInterval: string; apiRange: string }[] = [
  { label: "1H",  value: "1H",  apiInterval: "1h",  apiRange: "30d"  },
  { label: "1D",  value: "1D",  apiInterval: "1d",  apiRange: "365d" },
  { label: "1W",  value: "1W",  apiInterval: "1w",  apiRange: "730d" },
];

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg:      "#0D0B1A",   // matches card dark bg (#0D0B1A)
  panel:   "#13112A",   // matches card surface (#13112A)
  border:  "#1C1933",   // subtle inner borders
  borderH: "#252345",   // main card borders (#252345)
  dim:     "#4B5675",   // dim labels — exact site value
  mid:     "#7B8DB4",   // mid text — exact site value
  bright:  "#CBD5E1",   // bright values — exact site value
  bull:    "#10B981",   // emerald-500 — matches BUY badges
  bear:    "#F43F5E",   // rose-500 — matches SELL badges
  bullDim: "#10B98118",
  bearDim: "#F43F5E18",
  trend:   "#22D3EE",   // cyan-400
  longT:   "#A78BFA",   // violet-400
  fair:    "#F59E0B",   // amber-500
  momentum:"#E879F9",   // fuchsia-400
};

// ── Math helpers ──────────────────────────────────────────────────────────────

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

function rsi(bars: OhlcBar[], period = 14): LineBar[] {
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

// ── Component ─────────────────────────────────────────────────────────────────

interface TraxoraChartProps {
  symbol:          string;
  height?:         number;
  isExpanded?:     boolean;
  onExpandToggle?: () => void;
}

export default function TraxoraChart({ symbol, height = 480, isExpanded, onExpandToggle }: TraxoraChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const [interval,  setIntervalState] = useState<Interval>("1D");
  const [loading,   setLoading]       = useState(true);
  const [error,     setError]         = useState(false);
  const [lastPrice, setLastPrice]     = useState<number | null>(null);
  const [lastChg,   setLastChg]       = useState<number | null>(null);
  const [tooltip,   setTooltip]       = useState<Tooltip>(null);
  const allBarsRef                    = useRef<RawBar[]>([]);

  // All off by default — clean chart first
  const [showTrend,    setShowTrend]    = useState(false);
  const [showLongT,    setShowLongT]    = useState(false);
  const [showFair,     setShowFair]     = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);

  const isIntraday = interval === "1H";
  const clean      = symbol.replace(".US", "").replace(".COMM", "");
  const isFutures  = symbol.endsWith(".COMM");

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
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: C.borderH, width: 1, style: 2, labelBackgroundColor: C.panel },
        horzLine: { color: C.borderH, width: 1, style: 2, labelBackgroundColor: C.panel },
      },
      rightPriceScale: {
        borderColor:  C.borderH,
        scaleMargins: { top: 0.08, bottom: 0.20 },
        textColor:    C.mid,
      },
      timeScale: {
        borderColor:    C.borderH,
        timeVisible:    true,
        secondsVisible: false,
        barSpacing:     10,
        minBarSpacing:  3,
      },
    });

    chartRef.current = chart;

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: C.bull, downColor: C.bear,
      borderUpColor: C.bull, borderDownColor: C.bear,
      wickUpColor: C.bull + "BB", wickDownColor: C.bear + "BB",
    } as CandlestickSeriesPartialOptions);

    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Trend lines (EMA 9 + 21, same color — they're one "Trend" concept)
    ema9Ref.current  = chart.addSeries(LineSeries, { color: C.trend, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: C.trend + "90", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // Long trend (EMA 50)
    ema50Ref.current = chart.addSeries(LineSeries, { color: C.longT, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // Fair price (VWAP)
    vwapRef.current = chart.addSeries(LineSeries, { color: C.fair, lineWidth: 2, lineStyle: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });

    // Momentum (RSI)
    rsiRef.current   = chart.addSeries(LineSeries, { color: C.momentum, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiObRef.current = chart.addSeries(LineSeries, { color: "#F2364540", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiOsRef.current = chart.addSeries(LineSeries, { color: "#00D17A40", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 }, borderColor: C.border, textColor: C.bright });

    // Simplified floating tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleRef.current || !param.point) { setTooltip(null); return; }
      const d = param.seriesData.get(candleRef.current) as CandlestickData | undefined;
      if (!d) { setTooltip(null); return; }

      const ts = param.time as number;
      const dt = new Date(ts * 1000);
      const timeLabel = isIntraday
        ? dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
        : dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

      const bar = allBarsRef.current.find(b => toTime(b.time) === param.time);
      const getLine = (ref: React.RefObject<ISeriesApi<"Line"> | null>) =>
        ref.current ? ((param.seriesData.get(ref.current) as { value?: number } | undefined)?.value ?? null) : null;

      setTooltip({
        x: param.point.x, y: param.point.y,
        time: timeLabel,
        open: d.open, high: d.high, low: d.low, close: d.close,
        volume: bar?.volume ?? 0,
        ema9: getLine(ema9Ref), ema50: getLine(ema50Ref),
        vwap: getLine(vwapRef), rsi: getLine(rsiRef),
      });
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 }));
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect(); chart.remove();
      chartRef.current = candleRef.current = volRef.current = null;
      ema9Ref.current = ema21Ref.current = ema50Ref.current = vwapRef.current = null;
      rsiRef.current = rsiObRef.current = rsiOsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true); setError(false); setTooltip(null);

    const iv = INTERVALS.find(i => i.value === interval)!;

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

      candleRef.current?.setData(candles as CandlestickData[]);
      volRef.current?.setData(volumes);

      ema9Ref.current?.setData(showTrend  ? ema(candles, 9)  : []);
      ema21Ref.current?.setData(showTrend ? ema(candles, 21) : []);
      ema50Ref.current?.setData(showLongT ? ema(candles, 50) : []);
      vwapRef.current?.setData(showFair && isIntraday ? vwap(raw) : []);

      if (showMomentum && candles.length > 15) {
        const r = rsi(candles);
        rsiRef.current?.setData(r);
        const t0 = candles[0].time, t1 = candles[candles.length - 1].time;
        rsiObRef.current?.setData([{ time: t0, value: 70 }, { time: t1, value: 70 }]);
        rsiOsRef.current?.setData([{ time: t0, value: 30 }, { time: t1, value: 30 }]);
      } else {
        rsiRef.current?.setData([]); rsiObRef.current?.setData([]); rsiOsRef.current?.setData([]);
      }

      chartRef.current?.timeScale().fitContent();

      const last = raw[raw.length - 1];
      const prev = raw[raw.length - 2];
      setLastPrice(last.close);
      setLastChg(prev ? ((last.close - prev.close) / prev.close) * 100 : null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [symbol, interval, showTrend, showLongT, showFair, showMomentum, isIntraday]);

  useEffect(() => { loadData(); }, [loadData]);

  const isBull   = lastChg != null ? lastChg >= 0 : true;
  const rsiVal   = tooltip?.rsi ?? null;
  const rsiColor = rsiVal == null ? C.momentum : rsiVal > 70 ? C.bear : rsiVal < 30 ? C.bull : C.momentum;

  // Tooltip clamp
  const TIP_W = 180;
  const tipX  = tooltip ? Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 600) - TIP_W - 8) : 0;
  const tipY  = tooltip ? Math.max(8, tooltip.y - 100) : 0;

  // Indicator toggle chip
  function Chip({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border"
        style={active
          ? { color: "#E2E8F0", background: color + "18", borderColor: color + "40" }
          : { color: C.dim,    background: "transparent", borderColor: "transparent" }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? color : C.border }} />
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden select-none" style={{ background: C.bg, border: `1px solid ${C.borderH}` }}>

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${C.border}` }}>

        {/* Price row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Live dot + symbol */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-2 h-2">
                <span className="absolute inset-0 rounded-full" style={{ background: C.bull }} />
                <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: C.bull }} />
              </div>
              <span className="font-black tracking-tight text-sm" style={{ color: "#E8ECFF" }}>{clean}</span>
              {isFutures && <span className="text-[7px] font-black px-1.5 py-0.5 rounded" style={{ background: "#7C3AED18", color: C.longT, border: `1px solid ${C.longT}30` }}>FUT</span>}
            </div>

            {/* Price + change */}
            {lastPrice != null && !loading && (
              <div className="flex items-center gap-2">
                <span className="text-xl font-black font-mono" style={{ color: isBull ? C.bull : C.bear }}>
                  ${fmtP(lastPrice)}
                </span>
                {lastChg != null && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg font-mono"
                    style={{ color: isBull ? C.bull : C.bear, background: isBull ? C.bullDim : C.bearDim }}>
                    {lastChg >= 0 ? "+" : ""}{lastChg.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            {loading && <div className="h-6 w-28 rounded-lg animate-pulse" style={{ background: C.border }} />}
          </div>

          {/* Right: timeframes + expand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-px p-1 rounded-xl" style={{ background: "#0A0817", border: `1px solid ${C.border}` }}>
              {INTERVALS.map(iv => (
                <button key={iv.value} type="button" onClick={() => setIntervalState(iv.value)}
                  className="px-3 py-1 rounded-lg text-[10px] font-bold transition-all"
                  style={interval === iv.value ? { background: "#1E1B3A", color: C.bull } : { color: C.dim }}>
                  {iv.label}
                </button>
              ))}
            </div>
            {onExpandToggle && (
              <button type="button" onClick={onExpandToggle}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: "#0A0817", border: `1px solid ${C.border}`, color: C.dim }}>
                {isExpanded
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                }
              </button>
            )}
          </div>
        </div>

        {/* Indicator chips */}
        <div className="flex items-center gap-1 mt-2">
          <Chip active={showTrend}    color={C.trend}    label="Trend"       onClick={() => setShowTrend(v => !v)} />
          <Chip active={showLongT}    color={C.longT}    label="Long Trend"  onClick={() => setShowLongT(v => !v)} />
          {isIntraday && <Chip active={showFair} color={C.fair} label="Fair Price" onClick={() => setShowFair(v => !v)} />}
          <Chip active={showMomentum} color={C.momentum} label="Momentum"    onClick={() => setShowMomentum(v => !v)} />
        </div>
      </div>

      {/* ── Chart canvas ── */}
      <div className="relative">
        <div ref={containerRef} style={{ height }} />

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[28px] font-black tracking-[0.45em] uppercase" style={{ color: "#110F20" }}>TRAXORA</span>
        </div>

        {/* Floating tooltip — simple */}
        {tooltip && (
          <div className="absolute pointer-events-none z-10 rounded-xl px-3 py-2.5 text-[10px] font-mono"
            style={{
              left: tipX, top: tipY, minWidth: TIP_W,
              background: C.panel + "F0",
              border: `1px solid ${C.borderH}`,
              backdropFilter: "blur(8px)",
            }}>
            <p className="font-semibold mb-2" style={{ color: C.bright }}>{tooltip.time}</p>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span style={{ color: C.dim }}>Open</span>
                <span style={{ color: C.bright }} className="font-bold">${fmtP(tooltip.open)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: C.dim }}>High</span>
                <span style={{ color: C.bull }} className="font-bold">${fmtP(tooltip.high)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: C.dim }}>Low</span>
                <span style={{ color: C.bear }} className="font-bold">${fmtP(tooltip.low)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: C.dim }}>Close</span>
                <span style={{ color: tooltip.close >= tooltip.open ? C.bull : C.bear }} className="font-bold">${fmtP(tooltip.close)}</span>
              </div>
            </div>
            {/* Active indicators */}
            {(showTrend && tooltip.ema9 != null) || (showLongT && tooltip.ema50 != null) || (showFair && tooltip.vwap != null) || (showMomentum && rsiVal != null) ? (
              <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: `1px solid ${C.border}` }}>
                {showTrend    && tooltip.ema9  != null && <div className="flex justify-between gap-4"><span style={{ color: C.trend    }}>Trend</span><span style={{ color: C.trend    }} className="font-bold">${fmtP(tooltip.ema9)}</span></div>}
                {showLongT    && tooltip.ema50 != null && <div className="flex justify-between gap-4"><span style={{ color: C.longT    }}>Long Trend</span><span style={{ color: C.longT    }} className="font-bold">${fmtP(tooltip.ema50)}</span></div>}
                {showFair     && tooltip.vwap  != null && <div className="flex justify-between gap-4"><span style={{ color: C.fair     }}>Fair Price</span><span style={{ color: C.fair     }} className="font-bold">${fmtP(tooltip.vwap)}</span></div>}
                {showMomentum && rsiVal         != null && <div className="flex justify-between gap-4"><span style={{ color: rsiColor   }}>Momentum</span><span style={{ color: rsiColor   }} className="font-bold">{rsiVal.toFixed(0)}{rsiVal > 70 ? " — high" : rsiVal < 30 ? " — low" : ""}</span></div>}
              </div>
            ) : null}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: C.bg }}>
            <div className="flex items-end gap-[3px] h-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="w-2 rounded-sm"
                  style={{
                    height: `${16 + Math.abs(Math.sin(i * 0.75)) * 24}px`,
                    background: i % 3 === 2 ? C.bear + "30" : C.bull + "28",
                    animation: "pulse 1.5s ease-in-out infinite",
                    animationDelay: `${i * 70}ms`,
                  }} />
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

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
        <span className="text-[7px] font-black tracking-widest uppercase" style={{ color: "#191630" }}>Traxora AI</span>
        <span className="text-[7px] font-mono" style={{ color: "#191630" }}>Not financial advice</span>
      </div>
    </div>
  );
}
