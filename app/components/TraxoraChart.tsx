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
type RawBar  = { time: number; open: number; high: number; low: number; close: number; volume: number };
type OhlcBar = { time: Time;   open: number; high: number; low: number; close: number };
type VolBar  = { time: Time;   value: number; color: string };
type LineBar = { time: Time;   value: number };

type Tooltip = {
  x: number; y: number;
  time: string;
  open: number; high: number; low: number; close: number; volume: number;
  rsi: number | null; vwap: number | null;
  ema9: number | null; ema21: number | null; ema50: number | null;
  macdLine: number | null; macdSignal: number | null; macdHist: number | null;
} | null;

const INTERVALS: { label: string; value: Interval; apiInterval: string; apiRange: string }[] = [
  { label: "5m",  value: "5m",  apiInterval: "5m",  apiRange: "2d"   },
  { label: "15m", value: "15m", apiInterval: "15m", apiRange: "5d"   },
  { label: "1H",  value: "1H",  apiInterval: "1h",  apiRange: "30d"  },
  { label: "4H",  value: "4H",  apiInterval: "4h",  apiRange: "90d"  },
  { label: "1D",  value: "1D",  apiInterval: "1d",  apiRange: "365d" },
  { label: "1W",  value: "1W",  apiInterval: "1w",  apiRange: "730d" },
];

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  bg:       "#0B0914",
  bgPanel:  "#0F0D1C",
  bgHover:  "#141225",
  border:   "#1C1933",
  borderBr: "#252345",
  text:     "#3D4F6B",
  textMid:  "#5A6A8A",
  textBr:   "#8B9CC0",
  bull:     "#00D17A",
  bear:     "#F23645",
  bullDim:  "#00D17A28",
  bearDim:  "#F2364520",
  ema9:     "#22D3EE",
  ema21:    "#F97316",
  ema50:    "#A78BFA",
  vwap:     "#FBBF24",
  bb:       "#6366F1",
  rsi:      "#E879F9",
  macd:     "#3B82F6",
  macdSig:  "#F97316",
};

// ── Math ──────────────────────────────────────────────────────────────────────

function calcEMA(bars: OhlcBar[], period: number): LineBar[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  const out: LineBar[] = [{ time: bars[period - 1].time, value: +ema.toFixed(5) }];
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    out.push({ time: bars[i].time, value: +ema.toFixed(5) });
  }
  return out;
}

function calcRawEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const out = [ema];
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcMACD(bars: OhlcBar[]): { macd: LineBar[]; signal: LineBar[]; hist: LineBar[] } {
  const closes = bars.map(b => b.close);
  const ema12 = calcRawEMA(closes, 12);
  const ema26 = calcRawEMA(closes, 26);
  const offset = closes.length - ema26.length;
  const macdLine = ema26.map((v, i) => ema12[i + offset] - v);
  const signalLine = calcRawEMA(macdLine, 9);
  const sigOffset = macdLine.length - signalLine.length;
  const startIdx = offset + sigOffset;
  return {
    macd:   signalLine.map((_, i) => ({ time: bars[startIdx + i].time, value: +macdLine[i + sigOffset].toFixed(5) })),
    signal: signalLine.map((_, i) => ({ time: bars[startIdx + i].time, value: +signalLine[i].toFixed(5) })),
    hist:   signalLine.map((_, i) => ({ time: bars[startIdx + i].time, value: +(macdLine[i + sigOffset] - signalLine[i]).toFixed(5) })),
  };
}

function calcVWAP(bars: RawBar[]): LineBar[] {
  const out: LineBar[] = [];
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    cumPV += ((b.high + b.low + b.close) / 3) * b.volume;
    cumV  += b.volume;
    if (cumV > 0) out.push({ time: toTime(b.time), value: +(cumPV / cumV).toFixed(5) });
  }
  return out;
}

function calcBB(bars: OhlcBar[], period = 20, mult = 2) {
  const upper: LineBar[] = [], mid: LineBar[] = [], lower: LineBar[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const sl   = bars.slice(i - period + 1, i + 1);
    const mean = sl.reduce((s, b) => s + b.close, 0) / period;
    const sd   = Math.sqrt(sl.reduce((s, b) => s + (b.close - mean) ** 2, 0) / period);
    mid.push({ time: bars[i].time, value: +mean.toFixed(5) });
    upper.push({ time: bars[i].time, value: +(mean + mult * sd).toFixed(5) });
    lower.push({ time: bars[i].time, value: +(mean - mult * sd).toFixed(5) });
  }
  return { upper, mid, lower };
}

function calcRSI(bars: OhlcBar[], period = 14): LineBar[] {
  if (bars.length < period + 1) return [];
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i-1].close;
    if (d > 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  const out: LineBar[] = [{ time: bars[period].time, value: +(l === 0 ? 100 : 100 - 100/(1+g/l)).toFixed(2) }];
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i-1].close;
    g = (g * (period-1) + (d > 0 ? d : 0)) / period;
    l = (l * (period-1) + (d < 0 ? -d : 0)) / period;
    out.push({ time: bars[i].time, value: +(l === 0 ? 100 : 100 - 100/(1+g/l)).toFixed(2) });
  }
  return out;
}

function toHA(bars: RawBar[]): RawBar[] {
  const out: RawBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b  = bars[i];
    const pc = out[i-1];
    const haC = (b.open + b.high + b.low + b.close) / 4;
    const haO = pc ? (pc.open + pc.close) / 2 : (b.open + b.close) / 2;
    const haH = Math.max(b.high, haO, haC);
    const haL = Math.min(b.low,  haO, haC);
    out.push({ time: b.time, open: haO, high: haH, low: haL, close: haC, volume: b.volume });
  }
  return out;
}

function aggregate4H(bars: RawBar[]): RawBar[] {
  const out: RawBar[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    const chunk = bars.slice(i, i + 4);
    if (!chunk.length) break;
    out.push({ time: chunk[0].time, open: chunk[0].open, high: Math.max(...chunk.map(b => b.high)), low: Math.min(...chunk.map(b => b.low)), close: chunk[chunk.length-1].close, volume: chunk.reduce((s,b) => s+b.volume, 0) });
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
    if (!cur) m.set(key, { ...b, time: Math.floor(mon.getTime()/1000) });
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume; }
  }
  return [...m.values()].sort((a,b) => a.time - b.time);
}

function toTime(ts: number): Time { return Math.floor(ts) as Time; }

function fmtP(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 10)    return n.toFixed(2);
  return n.toFixed(4);
}
function fmtV(n: number) {
  if (n >= 1e9) return (n/1e9).toFixed(1)+"B";
  if (n >= 1e6) return (n/1e6).toFixed(1)+"M";
  if (n >= 1e3) return (n/1e3).toFixed(1)+"K";
  return String(n);
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
  const bbUpRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLoRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiOsRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSigRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef  = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [interval, setIntervalState] = useState<Interval>("1D");
  const [loading,  setLoading]       = useState(true);
  const [error,    setError]         = useState(false);
  const [lastPrice, setLastPrice]    = useState<number | null>(null);
  const [lastChg,  setLastChg]       = useState<number | null>(null);
  const [dayStats, setDayStats]      = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);
  const [tooltip,  setTooltip]       = useState<Tooltip>(null);
  const allBarsRef                   = useRef<RawBar[]>([]);

  const [showEMA,   setShowEMA]   = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showVWAP,  setShowVWAP]  = useState(false);
  const [showBB,    setShowBB]    = useState(false);
  const [showRSI,   setShowRSI]   = useState(false);
  const [showMACD,  setShowMACD]  = useState(false);
  const [useHA,     setUseHA]     = useState(false);

  const isIntraday = interval !== "1D" && interval !== "1W";
  const clean      = symbol.replace(".US","").replace(".COMM","");
  const isFutures  = symbol.endsWith(".COMM");

  // ── Create chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: T.bg },
        textColor:  T.textMid,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: T.border, style: 0 },
        horzLines: { color: T.border, style: 0 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: T.borderBr, width: 1, style: 2, labelBackgroundColor: "#1C1933" },
        horzLine: { color: T.borderBr, width: 1, style: 2, labelBackgroundColor: "#1C1933" },
      },
      rightPriceScale: {
        borderColor:  T.border,
        scaleMargins: { top: 0.06, bottom: 0.24 },
        textColor:    T.textBr,
      },
      timeScale: {
        borderColor:    T.border,
        timeVisible:    true,
        secondsVisible: false,
        barSpacing:     10,
        minBarSpacing:  3,
      },
    });

    chartRef.current = chart;

    // Candles
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: T.bull, downColor: T.bear,
      borderUpColor: T.bull, borderDownColor: T.bear,
      wickUpColor: T.bull + "BB", wickDownColor: T.bear + "BB",
    } as CandlestickSeriesPartialOptions);

    // Volume
    volRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } });

    // EMAs
    ema9Ref.current  = chart.addSeries(LineSeries, { color: T.ema9,  lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: T.ema21, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: T.ema50, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // VWAP
    vwapRef.current = chart.addSeries(LineSeries, { color: T.vwap, lineWidth: 2, lineStyle: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });

    // BB
    bbUpRef.current  = chart.addSeries(LineSeries, { color: T.bb+"80", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbMidRef.current = chart.addSeries(LineSeries, { color: T.bb+"45", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbLoRef.current  = chart.addSeries(LineSeries, { color: T.bb+"80", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    // RSI
    rsiRef.current   = chart.addSeries(LineSeries, { color: T.rsi, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiObRef.current = chart.addSeries(LineSeries, { color: "#F2364545", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiOsRef.current = chart.addSeries(LineSeries, { color: "#00D17A45", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "rsi" });
    rsiRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0.02 }, borderColor: T.border, textColor: T.textBr });

    // MACD
    macdRef.current    = chart.addSeries(LineSeries, { color: T.macd,    lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "macd" });
    macdSigRef.current = chart.addSeries(LineSeries, { color: T.macdSig, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "macd" });
    macdHistRef.current = chart.addSeries(HistogramSeries, { priceScaleId: "macd" });
    macdRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0.02 }, borderColor: T.border, textColor: T.textBr });

    // Floating crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleRef.current || !param.point) { setTooltip(null); return; }
      const d = param.seriesData.get(candleRef.current) as CandlestickData | undefined;
      if (!d) { setTooltip(null); return; }

      const timeLabel = (() => {
        const ts = param.time as number;
        const dt = new Date(ts * 1000);
        if (isIntraday) return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      })();

      const bar = allBarsRef.current.find(b => toTime(b.time) === param.time);
      const getLine = (ref: React.RefObject<ISeriesApi<"Line"> | null>) =>
        ref.current ? ((param.seriesData.get(ref.current) as { value?: number } | undefined)?.value ?? null) : null;

      setTooltip({
        x: param.point.x, y: param.point.y,
        time: timeLabel,
        open: d.open, high: d.high, low: d.low, close: d.close,
        volume: bar?.volume ?? 0,
        rsi: getLine(rsiRef), vwap: getLine(vwapRef),
        ema9: getLine(ema9Ref), ema21: getLine(ema21Ref), ema50: getLine(ema50Ref),
        macdLine: getLine(macdRef), macdSignal: getLine(macdSigRef),
        macdHist: macdHistRef.current ? ((param.seriesData.get(macdHistRef.current) as { value?: number } | undefined)?.value ?? null) : null,
      });
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 }));
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect(); chart.remove();
      chartRef.current = candleRef.current = volRef.current = null;
      ema9Ref.current = ema21Ref.current = ema50Ref.current = vwapRef.current = null;
      bbUpRef.current = bbMidRef.current = bbLoRef.current = null;
      rsiRef.current = rsiObRef.current = rsiOsRef.current = null;
      macdRef.current = macdSigRef.current = macdHistRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true); setError(false); setTooltip(null);

    const iv = INTERVALS.find(i => i.value === interval)!;
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

      const src = useHA ? toHA(raw) : raw;
      const candles: OhlcBar[] = src.map(b => ({ time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close }));
      const volumes: VolBar[]  = raw.map(b => ({ time: toTime(b.time), value: b.volume, color: b.close >= b.open ? T.bullDim : T.bearDim }));

      candleRef.current?.setData(candles as CandlestickData[]);
      volRef.current?.setData(volumes);

      ema9Ref.current?.setData(showEMA    ? calcEMA(candles, 9)  : []);
      ema21Ref.current?.setData(showEMA   ? calcEMA(candles, 21) : []);
      ema50Ref.current?.setData(showEMA50 ? calcEMA(candles, 50) : []);
      vwapRef.current?.setData(showVWAP && intraday ? calcVWAP(raw) : []);

      if (showBB && candles.length >= 20) {
        const bb = calcBB(candles);
        bbUpRef.current?.setData(bb.upper); bbMidRef.current?.setData(bb.mid); bbLoRef.current?.setData(bb.lower);
      } else { bbUpRef.current?.setData([]); bbMidRef.current?.setData([]); bbLoRef.current?.setData([]); }

      if (showRSI && candles.length > 15) {
        const rsi = calcRSI(candles);
        rsiRef.current?.setData(rsi);
        const t0 = candles[0].time, t1 = candles[candles.length-1].time;
        rsiObRef.current?.setData([{ time: t0, value: 70 }, { time: t1, value: 70 }]);
        rsiOsRef.current?.setData([{ time: t0, value: 30 }, { time: t1, value: 30 }]);
      } else { rsiRef.current?.setData([]); rsiObRef.current?.setData([]); rsiOsRef.current?.setData([]); }

      if (showMACD && candles.length > 35) {
        const { macd, signal, hist } = calcMACD(candles);
        macdRef.current?.setData(macd);
        macdSigRef.current?.setData(signal);
        macdHistRef.current?.setData(hist.map(h => ({ ...h, color: h.value >= 0 ? T.bull+"80" : T.bear+"80" })));
      } else { macdRef.current?.setData([]); macdSigRef.current?.setData([]); macdHistRef.current?.setData([]); }

      chartRef.current?.timeScale().fitContent();

      const last = src[src.length - 1];
      const prev = raw[raw.length - 2];
      setLastPrice(last.close);
      setDayStats({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
      setLastChg(prev ? ((last.close - prev.close) / prev.close) * 100 : null);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [symbol, interval, showEMA, showEMA50, showVWAP, showBB, showRSI, showMACD, useHA]);

  useEffect(() => { loadData(); }, [loadData]);

  const isBull     = lastChg != null ? lastChg >= 0 : true;
  const rsiVal     = tooltip?.rsi ?? null;
  const rsiColor   = rsiVal == null ? T.rsi : rsiVal > 70 ? T.bear : rsiVal < 30 ? T.bull : T.rsi;

  // ── Indicator button ──────────────────────────────────────────────────────
  function Chip({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all duration-150 border"
        style={active
          ? { color: "#E2E8F0", background: color+"18", borderColor: color+"40" }
          : { color: T.text,    background: "transparent", borderColor: "transparent" }
        }>
        <span className="w-2 h-2 rounded-full shrink-0 transition-all" style={{ background: active ? color : T.border }} />
        {label}
      </button>
    );
  }

  // Tooltip position — clamp to stay inside chart
  const TIP_W = 200, TIP_H = 120;
  const tipX = tooltip ? Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 600) - TIP_W - 12) : 0;
  const tipY = tooltip ? Math.min(tooltip.y + 12, height - TIP_H - 4) : 0;

  return (
    <div className="rounded-2xl overflow-hidden select-none flex flex-col" style={{ background: T.bg, border: `1px solid ${T.border}` }}>

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${T.border}` }}>

        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">

            {/* Symbol */}
            <div className="flex items-center gap-2">
              <div className="relative w-2 h-2 flex-shrink-0">
                <span className="absolute inset-0 rounded-full" style={{ background: T.bull }} />
                <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: T.bull }} />
              </div>
              <span className="font-black tracking-tight text-sm" style={{ color: "#E8ECFF" }}>{clean}</span>
              {isFutures && <span className="text-[7px] font-black px-1.5 py-0.5 rounded" style={{ background: "#7C3AED18", color: T.ema50, border: `1px solid ${T.ema50}30` }}>FUT</span>}
            </div>

            {/* Price */}
            {lastPrice != null && !loading && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black font-mono" style={{ color: isBull ? T.bull : T.bear }}>
                  ${fmtP(lastPrice)}
                </span>
                {lastChg != null && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-lg font-mono"
                    style={{ color: isBull ? T.bull : T.bear, background: isBull ? T.bullDim : T.bearDim }}>
                    {lastChg >= 0 ? "+" : ""}{lastChg.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            {loading && <div className="h-7 w-32 rounded-lg animate-pulse" style={{ background: T.bgHover }} />}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            {/* Heikin-Ashi toggle */}
            <button type="button" onClick={() => setUseHA(v => !v)}
              className="px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all"
              style={useHA
                ? { color: T.vwap, background: T.vwap+"15", borderColor: T.vwap+"40" }
                : { color: T.text, background: "transparent", borderColor: T.border }
              }>HA</button>

            {/* Timeframe */}
            <div className="flex items-center gap-px p-1 rounded-xl" style={{ background: T.bgPanel, border: `1px solid ${T.border}` }}>
              {INTERVALS.map(iv => (
                <button key={iv.value} type="button" onClick={() => setIntervalState(iv.value)}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                  style={interval === iv.value
                    ? { background: "#252345", color: T.bull }
                    : { color: T.text }}>
                  {iv.label}
                </button>
              ))}
            </div>

            {/* Expand */}
            {onExpandToggle && (
              <button type="button" onClick={onExpandToggle}
                className="p-1.5 rounded-lg transition-all"
                style={{ background: T.bgPanel, border: `1px solid ${T.border}`, color: T.text }}>
                {isExpanded
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                }
              </button>
            )}
          </div>
        </div>

        {/* OHLCV stats bar */}
        {dayStats && !loading && !tooltip && (
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {[
              { l: "O", v: dayStats.o, c: T.textBr },
              { l: "H", v: dayStats.h, c: T.bull },
              { l: "L", v: dayStats.l, c: T.bear },
              { l: "C", v: dayStats.c, c: dayStats.c >= dayStats.o ? T.bull : T.bear },
            ].map(r => (
              <span key={r.l} className="text-[9px] font-mono">
                <span style={{ color: T.text }}>{r.l} </span>
                <span style={{ color: r.c }} className="font-bold">{fmtP(r.v)}</span>
              </span>
            ))}
            {dayStats.v > 0 && (
              <span className="text-[9px] font-mono">
                <span style={{ color: T.text }}>VOL </span>
                <span style={{ color: T.textBr }} className="font-bold">{fmtV(dayStats.v)}</span>
              </span>
            )}
          </div>
        )}

        {/* Indicator toggles */}
        <div className="flex items-center gap-0.5 mt-2 flex-wrap">
          <Chip active={showEMA}   color={T.ema9}  label="EMA 9/21" onClick={() => setShowEMA(v => !v)} />
          <Chip active={showEMA50} color={T.ema50} label="EMA 50"   onClick={() => setShowEMA50(v => !v)} />
          {isIntraday && <Chip active={showVWAP} color={T.vwap} label="VWAP" onClick={() => setShowVWAP(v => !v)} />}
          <Chip active={showBB}   color={T.bb}   label="BB(20)"   onClick={() => setShowBB(v => !v)} />
          <Chip active={showRSI}  color={T.rsi}  label="RSI(14)"  onClick={() => setShowRSI(v => !v)} />
          <Chip active={showMACD} color={T.macd} label="MACD"     onClick={() => setShowMACD(v => !v)} />
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="relative flex-1">
        <div ref={containerRef} style={{ height }} />

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[32px] font-black tracking-[0.45em] uppercase" style={{ color: "#110F20" }}>TRAXORA</span>
        </div>

        {/* Floating OHLCV tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 rounded-xl px-3 py-2.5 text-[9px] font-mono"
            style={{
              left: tipX, top: tipY,
              background: T.bgPanel + "F2",
              border: `1px solid ${T.borderBr}`,
              backdropFilter: "blur(8px)",
              minWidth: TIP_W,
            }}>
            <p className="font-bold mb-1.5" style={{ color: T.textBr }}>{tooltip.time}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {[
                { l: "O", v: tooltip.open,  c: T.textBr },
                { l: "H", v: tooltip.high,  c: T.bull },
                { l: "L", v: tooltip.low,   c: T.bear },
                { l: "C", v: tooltip.close, c: tooltip.close >= tooltip.open ? T.bull : T.bear },
              ].map(r => (
                <span key={r.l}>
                  <span style={{ color: T.text }}>{r.l} </span>
                  <span style={{ color: r.c }} className="font-bold">{fmtP(r.v)}</span>
                </span>
              ))}
            </div>
            {tooltip.volume > 0 && (
              <p className="mt-1" style={{ color: T.text }}>VOL <span style={{ color: T.textBr }}>{fmtV(tooltip.volume)}</span></p>
            )}
            {/* Active indicator values */}
            <div className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: `1px solid ${T.border}` }}>
              {showEMA && tooltip.ema9 != null  && <p style={{ color: T.ema9  }}>EMA9  {fmtP(tooltip.ema9)}</p>}
              {showEMA && tooltip.ema21 != null && <p style={{ color: T.ema21 }}>EMA21 {fmtP(tooltip.ema21)}</p>}
              {showEMA50 && tooltip.ema50 != null && <p style={{ color: T.ema50 }}>EMA50 {fmtP(tooltip.ema50)}</p>}
              {showVWAP && tooltip.vwap != null && <p style={{ color: T.vwap  }}>VWAP  {fmtP(tooltip.vwap)}</p>}
              {showRSI && rsiVal != null         && <p style={{ color: rsiColor }}>RSI   {rsiVal.toFixed(1)}{rsiVal > 70 ? " OB" : rsiVal < 30 ? " OS" : ""}</p>}
              {showMACD && tooltip.macdLine != null && <p style={{ color: T.macd }}>MACD  {tooltip.macdLine.toFixed(3)}</p>}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: T.bg }}>
            <div className="flex items-end gap-[3px] h-12">
              {Array.from({ length: 14 }).map((_, i) => {
                const bull = i % 3 !== 2;
                return (
                  <div key={i} className="w-2 rounded-sm"
                    style={{
                      height: `${14 + Math.abs(Math.sin(i * 0.8)) * 26}px`,
                      background: bull ? T.bull + "30" : T.bear + "25",
                      animation: "pulse 1.6s ease-in-out infinite",
                      animationDelay: `${i * 70}ms`,
                    }} />
                );
              })}
            </div>
            <p className="text-[9px] font-mono tracking-[0.25em] uppercase" style={{ color: T.text }}>Loading {clean}…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: T.bg }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: T.bear+"12", border: `1px solid ${T.bear}25` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.bear} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p className="text-xs" style={{ color: T.textBr }}>Chart data unavailable</p>
            <button type="button" onClick={loadData} className="text-[10px] font-bold font-mono transition-colors" style={{ color: T.bull }}>RETRY →</button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ borderTop: `1px solid ${T.border}` }}>
        <span className="text-[7px] font-black tracking-widest uppercase" style={{ color: "#191630" }}>Traxora AI</span>
        <span className="text-[7px] font-mono" style={{ color: "#191630" }}>Not financial advice</span>
      </div>
    </div>
  );
}
