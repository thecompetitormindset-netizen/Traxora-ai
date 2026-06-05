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

type Interval = "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

type RawBar = {
  time: number;
  open: number; high: number; low: number; close: number; volume: number;
};

type OhlcBar = { time: Time; open: number; high: number; low: number; close: number };
type VolBar  = { time: Time; value: number; color: string };
type LineBar = { time: Time; value: number };

type HoverData = {
  time:   string;
  open:   number; high: number; low: number; close: number;
  volume: number;
  rsi:    number | null;
  vwap:   number | null;
  ema9:   number | null;
  ema21:  number | null;
  ema50:  number | null;
} | null;

const INTERVALS: { label: string; value: Interval; apiInterval: string; apiRange: string }[] = [
  { label: "5m",  value: "5m",  apiInterval: "5m",  apiRange: "2d"   },
  { label: "15m", value: "15m", apiInterval: "15m", apiRange: "5d"   },
  { label: "1H",  value: "1H",  apiInterval: "1h",  apiRange: "30d"  },
  { label: "4H",  value: "4H",  apiInterval: "4h",  apiRange: "90d"  },
  { label: "1D",  value: "1D",  apiInterval: "1d",  apiRange: "365d" },
  { label: "1W",  value: "1W",  apiInterval: "1w",  apiRange: "730d" },
];

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg:        "#070511",
  grid:      "#100E1F",
  border:    "#16122A",
  text:      "#3D4F6B",
  textBright:"#7B8DB4",
  bull:      "#00D97E",
  bear:      "#FF4560",
  bullDim:   "#00D97E35",
  bearDim:   "#FF456028",
  ema9:      "#38BDF8",
  ema21:     "#FB923C",
  ema50:     "#A78BFA",
  vwap:      "#F59E0B",
  bb:        "#6366F1",
  rsi:       "#EC4899",
};

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcEMA(bars: OhlcBar[], period: number): LineBar[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  const out: LineBar[] = [{ time: bars[period - 1].time, value: +ema.toFixed(4) }];
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    out.push({ time: bars[i].time, value: +ema.toFixed(4) });
  }
  return out;
}

function calcVWAP(bars: RawBar[]): LineBar[] {
  const out: LineBar[] = [];
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV  += b.volume;
    if (cumV > 0) out.push({ time: toTime(b.time), value: +(cumPV / cumV).toFixed(4) });
  }
  return out;
}

type BBands = { upper: LineBar[]; mid: LineBar[]; lower: LineBar[] };

function calcBollingerBands(bars: OhlcBar[], period = 20, mult = 2): BBands {
  const upper: LineBar[] = [], mid: LineBar[] = [], lower: LineBar[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((s, b) => s + b.close, 0) / period;
    const sd    = Math.sqrt(slice.reduce((s, b) => s + (b.close - mean) ** 2, 0) / period);
    mid.push({   time: bars[i].time, value: +mean.toFixed(4) });
    upper.push({ time: bars[i].time, value: +(mean + mult * sd).toFixed(4) });
    lower.push({ time: bars[i].time, value: +(mean - mult * sd).toFixed(4) });
  }
  return { upper, mid, lower };
}

function calcRSI(bars: OhlcBar[], period = 14): LineBar[] {
  if (bars.length < period + 1) return [];
  const out: LineBar[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  out.push({ time: bars[period].time, value: +(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)).toFixed(2) });
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out.push({ time: bars[i].time, value: +(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)).toFixed(2) });
  }
  return out;
}

function aggregate4H(bars: RawBar[]): RawBar[] {
  const out: RawBar[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    const chunk = bars.slice(i, i + 4);
    if (!chunk.length) break;
    out.push({
      time: chunk[0].time, open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low:  Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}

function aggregateWeekly(bars: RawBar[]): RawBar[] {
  const m = new Map<string, RawBar>();
  for (const b of bars) {
    const d   = new Date(b.time * 1000);
    const day = d.getUTCDay();
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

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 10)   return n.toFixed(2);
  return n.toFixed(4);
}

function fmtVol(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return n.toString();
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
  const bbUpperRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiOsRef     = useRef<ISeriesApi<"Line"> | null>(null);

  const [interval,  setIntervalState] = useState<Interval>("1D");
  const [loading,   setLoading]       = useState(true);
  const [error,     setError]         = useState(false);
  const [lastPrice, setLastPrice]     = useState<number | null>(null);
  const [lastChg,   setLastChg]       = useState<number | null>(null);
  const [lastBar,   setLastBar]       = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);
  const [hoverData, setHoverData]     = useState<HoverData>(null);
  const allBarsRef                    = useRef<RawBar[]>([]);

  const [showEMA,   setShowEMA]   = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showVWAP,  setShowVWAP]  = useState(false);
  const [showBB,    setShowBB]    = useState(false);
  const [showRSI,   setShowRSI]   = useState(false);

  const isIntraday = interval !== "1D" && interval !== "1W";
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
        textColor:  C.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: C.grid, style: 0 },
        horzLines: { color: C.grid, style: 0 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#2A2548", width: 1, style: 2, labelBackgroundColor: "#1A1535" },
        horzLine: { color: "#2A2548", width: 1, style: 2, labelBackgroundColor: "#1A1535" },
      },
      rightPriceScale: {
        borderColor:  C.border,
        scaleMargins: { top: 0.06, bottom: 0.22 },
        textColor:    C.textBright,
      },
      timeScale: {
        borderColor:    C.border,
        timeVisible:    true,
        secondsVisible: false,
        barSpacing:     10,
        minBarSpacing:  3,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          if (isIntraday) {
            return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          }
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        },
      },
    });

    chartRef.current = chart;

    // Candlesticks
    const candleOpts: CandlestickSeriesPartialOptions = {
      upColor:         C.bull,
      downColor:       C.bear,
      borderUpColor:   C.bull,
      borderDownColor: C.bear,
      wickUpColor:     C.bull + "CC",
      wickDownColor:   C.bear + "CC",
      borderVisible:   true,
    };
    candleRef.current = chart.addSeries(CandlestickSeries, candleOpts);

    // Volume
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // EMAs — thicker lines
    ema9Ref.current  = chart.addSeries(LineSeries, { color: C.ema9,  lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: C.ema21, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: C.ema50, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // VWAP
    vwapRef.current = chart.addSeries(LineSeries, {
      color: C.vwap, lineWidth: 2, priceLineVisible: false,
      lastValueVisible: true, crosshairMarkerVisible: false, lineStyle: 1,
    });

    // Bollinger Bands
    bbUpperRef.current = chart.addSeries(LineSeries, { color: C.bb + "90", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbMidRef.current   = chart.addSeries(LineSeries, { color: C.bb + "50", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineStyle: 2 });
    bbLowerRef.current = chart.addSeries(LineSeries, { color: C.bb + "90", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // RSI
    rsiRef.current   = chart.addSeries(LineSeries, { color: C.rsi, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,  crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiObRef.current = chart.addSeries(LineSeries, { color: "#FF456055", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi", lineStyle: 3 });
    rsiOsRef.current = chart.addSeries(LineSeries, { color: "#00D97E55", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi", lineStyle: 3 });
    rsiRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0.01 }, borderColor: C.border, textColor: C.textBright });

    // Crosshair legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleRef.current) { setHoverData(null); return; }
      const d = param.seriesData.get(candleRef.current) as CandlestickData | undefined;
      if (!d) { setHoverData(null); return; }

      const timeLabel = typeof param.time === "number"
        ? new Date((param.time as number) * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
        : String(param.time);

      const bar = allBarsRef.current.find(b => toTime(b.time) === param.time);
      const getVal = (ref: React.RefObject<ISeriesApi<"Line"> | null>): number | null => {
        if (!ref.current) return null;
        const entry = param.seriesData.get(ref.current) as { value?: number } | undefined;
        return entry?.value ?? null;
      };

      setHoverData({
        time: timeLabel,
        open: d.open, high: d.high, low: d.low, close: d.close,
        volume: bar?.volume ?? 0,
        rsi:  getVal(rsiRef),
        vwap: getVal(vwapRef),
        ema9: getVal(ema9Ref),
        ema21: getVal(ema21Ref),
        ema50: getVal(ema50Ref),
      });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = null;
      ema9Ref.current = ema21Ref.current = ema50Ref.current = null;
      vwapRef.current = bbUpperRef.current = bbMidRef.current = bbLowerRef.current = null;
      rsiRef.current = rsiObRef.current = rsiOsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true); setError(false); setHoverData(null);

    const iv       = INTERVALS.find(i => i.value === interval)!;
    const intraday = interval !== "1D" && interval !== "1W";

    try {
      let raw: RawBar[] = [];

      if (intraday) {
        const res  = await fetch(`/api/intraday-bars?symbol=${encodeURIComponent(symbol)}&interval=${iv.apiInterval}&range=${iv.apiRange}`);
        const data = await res.json();
        raw = data.bars ?? [];
        if (interval === "4H") raw = aggregate4H(raw);
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
      const volumes: VolBar[]  = raw.map(b => ({
        time: toTime(b.time), value: b.volume,
        color: b.close >= b.open ? C.bullDim : C.bearDim,
      }));

      candleRef.current?.setData(candles as CandlestickData[]);
      volRef.current?.setData(volumes);
      ema9Ref.current?.setData(showEMA    ? calcEMA(candles, 9)  : []);
      ema21Ref.current?.setData(showEMA   ? calcEMA(candles, 21) : []);
      ema50Ref.current?.setData(showEMA50 ? calcEMA(candles, 50) : []);
      vwapRef.current?.setData(showVWAP && intraday ? calcVWAP(raw) : []);

      if (showBB && candles.length >= 20) {
        const bb = calcBollingerBands(candles);
        bbUpperRef.current?.setData(bb.upper);
        bbMidRef.current?.setData(bb.mid);
        bbLowerRef.current?.setData(bb.lower);
      } else {
        bbUpperRef.current?.setData([]); bbMidRef.current?.setData([]); bbLowerRef.current?.setData([]);
      }

      if (showRSI && candles.length > 15) {
        const rsiData = calcRSI(candles);
        rsiRef.current?.setData(rsiData);
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
      setLastBar({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
      setLastChg(prev ? ((last.close - prev.close) / prev.close) * 100 : null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [symbol, interval, showEMA, showEMA50, showVWAP, showBB, showRSI]);

  useEffect(() => { loadData(); }, [loadData]);

  const display = hoverData ?? (lastBar ? {
    time: null, open: lastBar.o, high: lastBar.h, low: lastBar.l, close: lastBar.c,
    volume: lastBar.v, rsi: null, vwap: null, ema9: null, ema21: null, ema50: null,
  } : null);

  const isBull        = lastChg != null ? lastChg >= 0 : null;
  const displayIsBull = display ? display.close >= display.open : isBull;

  const rsiValue = hoverData?.rsi ?? null;
  const rsiColor = rsiValue != null
    ? rsiValue > 70 ? "#FF4560" : rsiValue < 30 ? "#00D97E" : C.rsi
    : C.rsi;

  function IndicatorBtn({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all ${
          active
            ? "text-[#E2E8F0]"
            : "text-[#2D3A52] hover:text-[#4B5675]"
        }`}
        style={active ? { background: color + "18", border: `1px solid ${color}35` } : { border: "1px solid transparent" }}
      >
        <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: active ? color : "#1E1B3A" }} />
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden select-none" style={{ background: C.bg, border: `1px solid ${C.border}` }}>

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: `1px solid ${C.grid}` }}>

        {/* Row 1: symbol + price + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">

            {/* Symbol badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center justify-center">
                <span className="w-2 h-2 rounded-full" style={{ background: C.bull }} />
                <span className="absolute w-2 h-2 rounded-full animate-ping" style={{ background: C.bull, opacity: 0.4 }} />
              </div>
              <span className="text-sm font-black tracking-tight" style={{ color: "#E2E8F0" }}>{clean}</span>
              {isFutures && (
                <span className="text-[7px] font-black px-1.5 py-0.5 rounded-md" style={{ background: "#7C3AED20", color: "#A78BFA", border: "1px solid #7C3AED30" }}>FUTURES</span>
              )}
            </div>

            {/* Price */}
            {lastPrice != null && !loading ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono leading-none" style={{ color: displayIsBull ? C.bull : C.bear }}>
                  ${fmtPrice(lastPrice)}
                </span>
                {lastChg != null && (
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md"
                    style={{
                      color: lastChg >= 0 ? C.bull : C.bear,
                      background: lastChg >= 0 ? C.bullDim : C.bearDim,
                    }}>
                    {lastChg >= 0 ? "▲" : "▼"} {Math.abs(lastChg).toFixed(2)}%
                  </span>
                )}
              </div>
            ) : loading ? (
              <div className="h-7 w-28 rounded-lg animate-pulse" style={{ background: C.grid }} />
            ) : null}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Timeframe */}
            <div className="flex items-center gap-px p-1 rounded-xl" style={{ background: "#0A0817", border: `1px solid ${C.border}` }}>
              {INTERVALS.map(iv => (
                <button key={iv.value} type="button" onClick={() => setIntervalState(iv.value)}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                  style={interval === iv.value
                    ? { background: "#1E1B3A", color: C.bull }
                    : { color: C.text }
                  }
                >
                  {iv.label}
                </button>
              ))}
            </div>

            {/* Expand */}
            {onExpandToggle && (
              <button type="button" onClick={onExpandToggle} title={isExpanded ? "Collapse" : "Expand"}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: "#0A0817", border: `1px solid ${C.border}`, color: C.text }}
              >
                {isExpanded ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: OHLCV legend */}
        {display && !loading && (
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {hoverData?.time && (
              <span className="text-[9px] font-mono" style={{ color: C.textBright }}>{hoverData.time}</span>
            )}
            <div className="flex items-center gap-3">
              {[
                { l: "O", v: display.open,  c: C.textBright },
                { l: "H", v: display.high,  c: C.bull },
                { l: "L", v: display.low,   c: C.bear },
                { l: "C", v: display.close, c: displayIsBull ? C.bull : C.bear },
              ].map(r => (
                <span key={r.l} className="text-[9px] font-mono">
                  <span style={{ color: C.text }}>{r.l} </span>
                  <span style={{ color: r.c }} className="font-bold">{fmtPrice(r.v)}</span>
                </span>
              ))}
              {display.volume > 0 && (
                <span className="text-[9px] font-mono">
                  <span style={{ color: C.text }}>VOL </span>
                  <span style={{ color: C.textBright }} className="font-bold">{fmtVol(display.volume)}</span>
                </span>
              )}
            </div>
            {/* Indicator values on hover */}
            {hoverData && (
              <div className="flex items-center gap-2">
                {showEMA && hoverData.ema9  != null && <span className="text-[9px] font-mono font-bold" style={{ color: C.ema9  }}>EMA9 {fmtPrice(hoverData.ema9)}</span>}
                {showEMA && hoverData.ema21 != null && <span className="text-[9px] font-mono font-bold" style={{ color: C.ema21 }}>EMA21 {fmtPrice(hoverData.ema21)}</span>}
                {showEMA50 && hoverData.ema50 != null && <span className="text-[9px] font-mono font-bold" style={{ color: C.ema50 }}>EMA50 {fmtPrice(hoverData.ema50)}</span>}
                {showVWAP && hoverData.vwap != null && <span className="text-[9px] font-mono font-bold" style={{ color: C.vwap }}>VWAP {fmtPrice(hoverData.vwap)}</span>}
                {showRSI && rsiValue != null && <span className="text-[9px] font-mono font-bold" style={{ color: rsiColor }}>RSI {rsiValue.toFixed(1)}</span>}
              </div>
            )}
          </div>
        )}

        {/* Row 3: Indicator toggles */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <IndicatorBtn active={showEMA}   color={C.ema9}  label="EMA 9/21" onClick={() => setShowEMA(v => !v)} />
          <IndicatorBtn active={showEMA50} color={C.ema50} label="EMA 50"   onClick={() => setShowEMA50(v => !v)} />
          {isIntraday && <IndicatorBtn active={showVWAP} color={C.vwap} label="VWAP" onClick={() => setShowVWAP(v => !v)} />}
          <IndicatorBtn active={showBB}   color={C.bb}   label="BB(20)"   onClick={() => setShowBB(v => !v)} />
          <IndicatorBtn active={showRSI}  color={C.rsi}  label="RSI"      onClick={() => setShowRSI(v => !v)} />
        </div>
      </div>

      {/* ── Chart canvas ── */}
      <div className="relative">
        <div ref={containerRef} style={{ height }} />

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[36px] font-black tracking-[0.4em] uppercase" style={{ color: "#0D0B1C", letterSpacing: "0.4em" }}>TRAXORA</span>
        </div>

        {/* RSI label */}
        {showRSI && !loading && (
          <div className="absolute bottom-8 left-3 pointer-events-none flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: C.rsi }} />
            <span className="text-[8px] font-bold font-mono" style={{ color: C.rsi + "60" }}>RSI 14</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: C.bg }}>
            <div className="flex items-end gap-1 h-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="w-1.5 rounded-sm"
                  style={{
                    height: `${18 + Math.sin(i * 0.7) * 14}px`,
                    background: i % 2 === 0 ? C.bull + "25" : C.bear + "20",
                    animation: "pulse 1.4s ease-in-out infinite",
                    animationDelay: `${i * 80}ms`,
                  }} />
              ))}
            </div>
            <span className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: C.text }}>Loading {clean}…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: C.bg }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: C.bear + "15", border: `1px solid ${C.bear}30` }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.bear} strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className="text-xs font-mono" style={{ color: C.textBright }}>Chart data unavailable</p>
            <button type="button" onClick={loadData}
              className="text-[10px] font-mono font-bold transition-colors"
              style={{ color: C.bull }}>
              RETRY →
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ borderTop: `1px solid ${C.grid}` }}>
        <span className="text-[7px] font-black tracking-[0.2em] uppercase" style={{ color: "#1A1635" }}>Traxora AI</span>
        <span className="text-[7px] font-mono" style={{ color: "#1A1635" }}>Not financial advice</span>
      </div>
    </div>
  );
}
