"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buyStock, sellStock, getPortfolio, checkPriceEvents, type Portfolio } from "../lib/trading";
import { scopedKey } from "../lib/userState";

// ── Types ────────────────────────────────────────────────────────────────────
type BotStyle = "aggressive" | "conservative" | "balanced";

export type ScanResult = {
  symbol:        string;
  short:         string;
  name:          string;
  price:         number;
  open:          number | null;
  high:          number | null;
  low:           number | null;
  dayChangePct:  number;
  signal:        "BUY" | "SELL" | "HOLD" | null;
  confidence:    "High" | "Medium" | "Low" | null;
  actionTaken:   "bought" | "sold" | "held" | "no-position" | "insufficient-cash" | null;
  pl?:           number;
};

export type ScanSnapshot = {
  time:    string;
  results: ScanResult[];
};

export type DayTrade = {
  symbol:   string;
  side:     "BUY" | "SELL";
  quantity: number;
  price:    number;
  time:     string;
  pl?:      number;
  source:   "signal" | "scan" | "auto-close";
};

// ── Rival bot helpers ────────────────────────────────────────────────────────
const BOT_CONF: Record<string, number>      = { High: 3, Medium: 2, Low: 1 };
const BOT_MIN_CONF: Record<BotStyle,number> = { aggressive: 1, balanced: 2, conservative: 3 };
const BOT_PCT: Record<BotStyle, number>     = { aggressive: 0.20, balanced: 0.12, conservative: 0.08 };

function getBotPortfolio(id: string): Portfolio {
  if (typeof window === "undefined") return { cash: 10000, holdings: [], trades: [], pendingOrders: [] };
  try { return JSON.parse(localStorage.getItem(scopedKey(`traxora-bot-${id}`)) ?? "null") ?? { cash: 10000, holdings: [], trades: [], pendingOrders: [] }; }
  catch { return { cash: 10000, holdings: [], trades: [], pendingOrders: [] }; }
}
function saveBotPortfolio(id: string, p: Portfolio) {
  localStorage.setItem(scopedKey(`traxora-bot-${id}`), JSON.stringify(p));
  window.dispatchEvent(new Event("bot-updated"));
}
function checkBotPriceEvents(id: string, symbol: string, price: number) {
  const p = getBotPortfolio(id);
  let changed = false;
  p.holdings = p.holdings.filter(h => {
    if (h.symbol !== symbol) return true;
    const hitStop = h.stopLoss   != null && price <= h.stopLoss;
    const hitTP   = h.takeProfit != null && price >= h.takeProfit;
    if (hitStop || hitTP) {
      p.cash += h.quantity * price;
      p.trades.unshift({ symbol, side: "SELL", quantity: h.quantity, price, time: new Date().toISOString() });
      changed = true;
      return false;
    }
    return true;
  });
  if (changed) saveBotPortfolio(id, p);
}

function runBotTrade(id: string, symbol: string, price: number, signal: string, confidence: string, style: BotStyle) {
  if (BOT_CONF[confidence] < BOT_MIN_CONF[style]) return;
  const p = getBotPortfolio(id);
  if (signal === "BUY") {
    if (p.cash < 50) return;
    const qty = Math.max(1, Math.min(30, Math.floor((p.cash * BOT_PCT[style]) / price)));
    const sl  = price * (1 - STOP_PCT);
    const tp  = price * (1 + TP_PCT);
    p.cash -= qty * price;
    const h = p.holdings.find(h => h.symbol === symbol);
    if (h) { h.avgPrice = (h.avgPrice * h.quantity + price * qty) / (h.quantity + qty); h.quantity += qty; h.stopLoss = sl; h.takeProfit = tp; }
    else    { p.holdings.push({ symbol, quantity: qty, avgPrice: price, stopLoss: sl, takeProfit: tp }); }
    p.trades.unshift({ symbol, side: "BUY", quantity: qty, price, time: new Date().toISOString() });
  } else if (signal === "SELL") {
    const h = p.holdings.find(h => h.symbol === symbol);
    if (!h) return;
    p.cash += h.quantity * price;
    p.trades.unshift({ symbol, side: "SELL", quantity: h.quantity, price, time: new Date().toISOString() });
    p.holdings = p.holdings.filter(x => x.symbol !== symbol);
  }
  saveBotPortfolio(id, p);
}

// ── Market hours guard ────────────────────────────────────────────────────────
// 2026 NYSE full holidays (market closed all day)
const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-04-03",
  "2026-05-25","2026-06-19","2026-07-03","2026-09-07",
  "2026-11-26","2026-12-25",
]);
// 2026 early-close days: market closes at 1:00 PM ET
const NYSE_EARLY_CLOSE_2026 = new Set(["2026-11-27","2026-12-24"]);

function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
  const dst = now.getTimezoneOffset() < Math.max(jan, jul);
  const etOffsetMin = (dst ? -4 : -5) * 60;
  const et = new Date(now.getTime() + (now.getTimezoneOffset() + etOffsetMin) * 60_000);
  const dateKey = et.toISOString().slice(0, 10); // "YYYY-MM-DD" in ET
  if (NYSE_HOLIDAYS_2026.has(dateKey)) return false;
  const totalMins = et.getHours() * 60 + et.getMinutes();
  const closeMins = NYSE_EARLY_CLOSE_2026.has(dateKey) ? 13 * 60 : 16 * 60;
  return totalMins >= 9 * 60 + 30 && totalMins < closeMins;
}

// ── Singleton guard — prevents duplicate intervals if component mounts twice ──
let _autoTraderStarted = false;

// ── Constants ────────────────────────────────────────────────────────────────
const STOCKS = [
  { symbol: "AAPL.US",  name: "Apple",        short: "AAPL"  },
  { symbol: "MSFT.US",  name: "Microsoft",    short: "MSFT"  },
  { symbol: "NVDA.US",  name: "NVIDIA",       short: "NVDA"  },
  { symbol: "AMZN.US",  name: "Amazon",       short: "AMZN"  },
  { symbol: "GOOGL.US", name: "Alphabet",     short: "GOOGL" },
  { symbol: "META.US",  name: "Meta",         short: "META"  },
  { symbol: "TSLA.US",  name: "Tesla",        short: "TSLA"  },
  { symbol: "AVGO.US",  name: "Broadcom",     short: "AVGO"  },
  { symbol: "JPM.US",   name: "JPMorgan",     short: "JPM"   },
  { symbol: "LLY.US",   name: "Eli Lilly",    short: "LLY"   },
  { symbol: "WMT.US",   name: "Walmart",      short: "WMT"   },
  { symbol: "V.US",     name: "Visa",         short: "V"     },
  { symbol: "XOM.US",   name: "ExxonMobil",   short: "XOM"   },
  { symbol: "MA.US",    name: "Mastercard",   short: "MA"    },
  { symbol: "UNH.US",   name: "UnitedHealth", short: "UNH"   },
  { symbol: "ORCL.US",  name: "Oracle",       short: "ORCL"  },
  { symbol: "NFLX.US",  name: "Netflix",      short: "NFLX"  },
  { symbol: "AMD.US",   name: "AMD",          short: "AMD"   },
  { symbol: "CRM.US",   name: "Salesforce",   short: "CRM"   },
  { symbol: "COST.US",  name: "Costco",       short: "COST"  },
];

const SCAN_INTERVAL     = 5 * 60 * 1000;   // 5 min — scan all 20 at once
const BOT_SCAN_INTERVAL = 3 * 60 * 1000;   // 3 min per bot
const STOP_PCT  = 0.04;
const TP_PCT    = 0.08;
const TOAST_TTL = 8_000;

export const LAST_SCAN_KEY  = "traxora-last-scan";
export const DAY_TRADES_KEY = "traxora-day-trades";

function todayKey() { return new Date().toDateString(); }

export function getDayTrades(): DayTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(DAY_TRADES_KEY)) ?? "null");
    if (!raw || raw.date !== todayKey()) return [];
    return raw.trades ?? [];
  } catch { return []; }
}
function saveDayTrade(t: DayTrade) {
  const existing = getDayTrades();
  existing.unshift(t);
  localStorage.setItem(scopedKey(DAY_TRADES_KEY), JSON.stringify({ date: todayKey(), trades: existing.slice(0, 100) }));
}
export function getLastScan(): ScanSnapshot | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(scopedKey(LAST_SCAN_KEY)) ?? "null"); } catch { return null; }
}

// ── Toast ────────────────────────────────────────────────────────────────────
type ToastType = "scan" | "buy" | "sell" | "hold" | "error" | "cash" | "info" | "signal";
type Toast = { id: number; type: ToastType; title: string; body?: string };
let nextId = 0;
function toastCfg(type: ToastType) {
  switch (type) {
    case "scan":   return { icon: "🔍", ring: "border-indigo-500/30 bg-indigo-500/10",   title: "text-indigo-300"  };
    case "buy":    return { icon: "🟢", ring: "border-emerald-500/30 bg-emerald-500/10", title: "text-emerald-300" };
    case "sell":   return { icon: "🔴", ring: "border-rose-500/30 bg-rose-500/10",       title: "text-rose-300"    };
    case "hold":   return { icon: "🟡", ring: "border-amber-500/30 bg-amber-500/10",     title: "text-amber-300"   };
    case "cash":   return { icon: "💰", ring: "border-amber-500/30 bg-amber-500/10",     title: "text-amber-300"   };
    case "error":  return { icon: "⚠️", ring: "border-[#2D3A50] bg-[#0C1017]/80",        title: "text-[#7B8DB4]"   };
    case "info":   return { icon: "✨", ring: "border-indigo-500/30 bg-indigo-500/10",   title: "text-indigo-300"  };
    case "signal": return { icon: "⚡", ring: "border-violet-500/30 bg-violet-500/10",   title: "text-violet-300"  };
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AutoTrader() {
  const [active,      setActive]      = useState(false);
  const [open,        setOpen]        = useState(false);
  const [toasts,      setToasts]      = useState<Toast[]>([]);
  const [scanning,    setScanning]    = useState(false);
  const [status,      setStatus]      = useState("Idle — press Start");
  const [lastAction,  setLastAction]  = useState<string | null>(null);
  const [countdown,   setCountdown]   = useState(SCAN_INTERVAL);
  const [showSummary, setShowSummary] = useState(false);
  const [dayTrades,   setDayTrades]   = useState<DayTrade[]>([]);

  const activeRef   = useRef(false);
  const nextScanRef = useRef(Date.now() + SCAN_INTERVAL);
  const loopRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const botLoopsRef = useRef<Record<string, ReturnType<typeof setInterval> | null>>({ apex: null, delta: null, vera: null });
  const botTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recentSignalSyms = useRef<Set<string>>(new Set());

  function push(type: ToastType, title: string, body?: string) {
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-4), { id, type, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_TTL);
  }
  function refreshDayTrades() { setDayTrades(getDayTrades()); }

  // ── Execute helpers ───────────────────────────────────────────────────────
  function executeBuy(symbol: string, price: number, source: "signal" | "scan"): "bought" | "held" | "insufficient-cash" {
    const short     = symbol.replace(".US","").replace(".COMM","");
    const portfolio = getPortfolio();
    if (portfolio.cash < 50) {
      push("cash", "Not enough cash", `$${portfolio.cash.toFixed(2)} — skipped ${short}`);
      return "insufficient-cash";
    }
    if (portfolio.holdings.find(h => h.symbol === symbol)) return "held";
    const qty  = Math.max(1, Math.min(30, Math.floor((portfolio.cash * 0.12) / price)));
    const sl   = price * (1 - STOP_PCT);
    const tp   = price * (1 + TP_PCT);
    buyStock(symbol, qty, price, { stopLoss: sl, takeProfit: tp });
    saveDayTrade({ symbol, side: "BUY", quantity: qty, price, time: new Date().toISOString(), source });
    refreshDayTrades();
    push("buy", `${source === "signal" ? "⚡" : "🔍"} Bought ${qty}× ${short}`, `$${price.toFixed(2)} · SL $${sl.toFixed(2)} · TP $${tp.toFixed(2)}`);
    setLastAction(`Bought ${qty}× ${short} @ $${price.toFixed(2)}`);
    if (source === "signal") {
      recentSignalSyms.current.add(symbol);
      setTimeout(() => recentSignalSyms.current.delete(symbol), 5 * 60_000);
    }
    return "bought";
  }

  function executeSell(symbol: string, price: number, source: "signal" | "scan"): "sold" | "no-position" {
    const short     = symbol.replace(".US","").replace(".COMM","");
    const portfolio = getPortfolio();
    const holding   = portfolio.holdings.find(h => h.symbol === symbol);
    if (!holding) return "no-position";
    const pl = (price - holding.avgPrice) * holding.quantity;
    sellStock(symbol, holding.quantity, price);
    saveDayTrade({ symbol, side: "SELL", quantity: holding.quantity, price, time: new Date().toISOString(), pl, source });
    refreshDayTrades();
    push("sell", `${source === "signal" ? "⚡" : "🔍"} Sold ${holding.quantity}× ${short}`, `$${price.toFixed(2)} · P&L ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}`);
    setLastAction(`Sold ${holding.quantity}× ${short} · P&L ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}`);
    return "sold";
  }

  // ── Dashboard signal listener (instant trade on alert) ────────────────────
  // Signals always execute — no need to start the scanner.
  useEffect(() => {
    function handleSignal(e: Event) {
      const { symbol, signal, price, confidence, name } = (e as CustomEvent).detail as {
        symbol: string; signal: string; price: number; confidence: string; name: string;
      };
      if (signal !== "BUY" && signal !== "SELL") return;
      const short = symbol.replace(".US","").replace(".COMM","");
      push("signal", `⚡ Alert → ${signal} ${short}`, `${name} · $${price.toFixed(2)} · ${confidence}`);
      if (signal === "BUY")  executeBuy(symbol, price, "signal");
      if (signal === "SELL") executeSell(symbol, price, "signal");
    }
    window.addEventListener("traxora-signal", handleSignal);
    return () => window.removeEventListener("traxora-signal", handleSignal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Full parallel scan — all 8 stocks at once ────────────────────────────
  const runFullScan = useCallback(async () => {
    if (!activeRef.current) return;
    if (!isMarketOpen()) {
      setStatus("Market closed — paused until 9:30 AM ET");
      return;
    }
    setScanning(true);
    setStatus("Scanning all stocks…");
    push("scan", "Full market scan", "Checking all 20 stocks in parallel…");

    try {
      // 1. Fetch all 8 quotes in parallel
      const quoteResponses = await Promise.allSettled(
        STOCKS.map(s => fetch(`/api/quote?symbol=${encodeURIComponent(s.symbol)}`).then(r => r.json()))
      );

      // 2. Check stop/TP for every held position using latest prices
      for (let i = 0; i < STOCKS.length; i++) {
        const qr = quoteResponses[i];
        if (qr.status !== "fulfilled" || !qr.value?.price) continue;
        const { messages } = checkPriceEvents(STOCKS[i].symbol, qr.value.price);
        messages.forEach(m => push(m.startsWith("🎯") ? "buy" : "sell", m));
        for (const botId of ["apex", "delta", "vera"]) checkBotPriceEvents(botId, STOCKS[i].symbol, qr.value.price);
      }

      // 3. Analyze all stocks in parallel
      const analyzeResponses = await Promise.allSettled(
        STOCKS.map(async (s, i) => {
          const qr = quoteResponses[i];
          if (qr.status !== "fulfilled" || !qr.value?.price) return null;
          const q   = qr.value;
          const dcp = q.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : 0;
          const ar  = await fetch("/api/ai/analyze", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: s.symbol, price: q.price, previousClose: q.previousClose, open: q.open, high: q.high, low: q.low, dayChangePercent: dcp }),
          });
          const analysis = await ar.json();
          return { q, dcp, analysis };
        })
      );

      // 4. Execute all trades + build results
      const results: ScanResult[] = [];
      let buys = 0, sells = 0;

      for (let i = 0; i < STOCKS.length; i++) {
        const s  = STOCKS[i];
        const ar = analyzeResponses[i];
        const qr = quoteResponses[i];
        const q  = qr.status === "fulfilled" ? qr.value : null;

        if (!q?.price || ar.status !== "fulfilled" || !ar.value) {
          results.push({ symbol: s.symbol, short: s.short, name: s.name, price: 0, open: null, high: null, low: null, dayChangePct: 0, signal: null, confidence: null, actionTaken: null });
          continue;
        }
        const { analysis, dcp } = ar.value;
        const signal     = analysis.signal as ScanResult["signal"];
        const confidence = analysis.confidence as ScanResult["confidence"];
        let actionTaken: ScanResult["actionTaken"] = null;
        let pl: number | undefined;

        if (signal === "BUY" && !recentSignalSyms.current.has(s.symbol)) {
          actionTaken = executeBuy(s.symbol, q.price, "scan");
          if (actionTaken === "bought") buys++;
        } else if (signal === "SELL") {
          const portfolio = getPortfolio();
          const holding   = portfolio.holdings.find(h => h.symbol === s.symbol);
          if (holding) pl = (q.price - holding.avgPrice) * holding.quantity;
          actionTaken = executeSell(s.symbol, q.price, "scan");
          if (actionTaken === "sold") sells++;
        } else {
          actionTaken = "held";
        }

        // Fire notification for BUY/SELL
        if ((signal === "BUY" || signal === "SELL") && Notification.permission === "granted") {
          window.dispatchEvent(new CustomEvent("traxora-signal", { detail: { symbol: s.symbol, name: s.name, signal, price: q.price, confidence } }));
        }

        results.push({ symbol: s.symbol, short: s.short, name: s.name, price: q.price, open: q.open ?? null, high: q.high ?? null, low: q.low ?? null, dayChangePct: dcp, signal, confidence, actionTaken, pl });

        // Run bot trades for this stock
        for (const [id, style] of [["apex","aggressive"],["delta","balanced"],["vera","conservative"]] as [string,BotStyle][]) {
          runBotTrade(id, s.symbol, q.price, signal ?? "HOLD", confidence ?? "Low", style);
        }
      }

      // 5. Save snapshot + broadcast to dashboard
      const snapshot: ScanSnapshot = { time: new Date().toISOString(), results };
      localStorage.setItem(scopedKey(LAST_SCAN_KEY), JSON.stringify(snapshot));
      window.dispatchEvent(new CustomEvent("traxora-scan-complete", { detail: snapshot }));

      const summary = `${results.filter(r => r.signal).length} analyzed · ${buys} bought · ${sells} sold`;
      push("scan", "Scan complete ✓", summary);
      setStatus(`Last scan: ${new Date().toLocaleTimeString()} · ${summary}`);
      setLastAction(summary);

    } catch (err) {
      push("error", "Scan failed", "Check connection — retrying next cycle");
      setStatus("Error — retrying next cycle");
    } finally {
      setScanning(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bot independent scan (still individual per interval) ─────────────────
  const runBotScan = useCallback(async (id: string, style: BotStyle) => {
    if (!activeRef.current) return;
    const s = STOCKS[Math.floor(Math.random() * STOCKS.length)];
    try {
      const qr = await fetch(`/api/quote?symbol=${encodeURIComponent(s.symbol)}`).then(r => r.json());
      if (!qr?.price) return;
      checkBotPriceEvents(id, s.symbol, qr.price);
      const dcp = qr.previousClose ? ((qr.price - qr.previousClose) / qr.previousClose) * 100 : 0;
      const ar  = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: s.symbol, price: qr.price, previousClose: qr.previousClose, open: qr.open, high: qr.high, low: qr.low, dayChangePercent: dcp }) }).then(r => r.json());
      runBotTrade(id, s.symbol, qr.price, ar.signal ?? "HOLD", ar.confidence ?? "Low", style);
    } catch { /* silent */ }
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    activeRef.current = active;
    if (active) {
      // Singleton guard — bail out if another instance already owns the intervals
      if (_autoTraderStarted) {
        console.warn("[AutoTrader] duplicate mount detected — skipping interval setup");
        return;
      }
      _autoTraderStarted = true;
      console.log("[AutoTrader] starting scan loop, interval id pending…");

      nextScanRef.current = Date.now() + SCAN_INTERVAL;
      push("signal", "AutoTrader started", "All 20 stocks scanned every 5 min · Signals trade instantly");
      refreshDayTrades();
      runFullScan();
      loopRef.current = setInterval(() => {
        if (document.hidden) return; // pause polling when tab is hidden
        nextScanRef.current = Date.now() + SCAN_INTERVAL;
        runFullScan();
      }, SCAN_INTERVAL);
      console.log("[AutoTrader] scan loop interval id:", loopRef.current);
      tickRef.current = setInterval(() => setCountdown(Math.max(0, nextScanRef.current - Date.now())), 1000);
      const bots: [string, BotStyle, number][] = [["apex","aggressive",20_000],["delta","balanced",80_000],["vera","conservative",140_000]];
      bots.forEach(([id, style, delay]) => {
        const t = setTimeout(() => {
          runBotScan(id, style);
          botLoopsRef.current[id] = setInterval(() => {
            if (document.hidden) return;
            runBotScan(id, style);
          }, BOT_SCAN_INTERVAL);
        }, delay);
        botTimeouts.current.push(t);
      });
    } else {
      _autoTraderStarted = false;
      if (loopRef.current) clearInterval(loopRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      Object.keys(botLoopsRef.current).forEach(k => { if (botLoopsRef.current[k]) { clearInterval(botLoopsRef.current[k]!); botLoopsRef.current[k] = null; } });
      botTimeouts.current.forEach(clearTimeout);
      botTimeouts.current = [];
      setScanning(false);
      setStatus("Idle — press Start");
      setCountdown(SCAN_INTERVAL);
    }
    return () => {
      _autoTraderStarted = false;
      if (loopRef.current) clearInterval(loopRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      Object.keys(botLoopsRef.current).forEach(k => { if (botLoopsRef.current[k]) { clearInterval(botLoopsRef.current[k]!); botLoopsRef.current[k] = null; } });
      botTimeouts.current.forEach(clearTimeout);
      botTimeouts.current = [];
    };
  }, [active, runFullScan, runBotScan]);

  // ── Day summary stats ─────────────────────────────────────────────────────
  const todaySells   = dayTrades.filter(t => t.side === "SELL");
  const realizedPL   = todaySells.reduce((s, t) => s + (t.pl ?? 0), 0);
  const signalTrades = dayTrades.filter(t => t.source === "signal").length;
  const scanTrades   = dayTrades.filter(t => t.source === "scan").length;
  const winCount     = todaySells.filter(t => (t.pl ?? 0) > 0).length;
  const winRate      = todaySells.length > 0 ? Math.round((winCount / todaySells.length) * 100) : null;

  const countdownSec = Math.ceil(countdown / 1000);
  const progressPct  = active ? Math.round(((SCAN_INTERVAL - countdown) / SCAN_INTERVAL) * 100) : 0;
  const countdownStr = active ? (scanning ? "Scanning all…" : `${Math.floor(countdownSec / 60)}:${String(countdownSec % 60).padStart(2,"0")}`) : "—";

  return (
    <>
      {/* ── Toasts ───────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-[168px] left-4 z-50 flex flex-col gap-2 w-[300px] sm:w-[320px] pointer-events-none">
        {toasts.map(t => {
          const c = toastCfg(t.type);
          return (
            <div key={t.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl animate-toast-in ${c.ring}`}>
              <span className="text-base shrink-0 mt-0.5">{c.icon}</span>
              <div className="min-w-0">
                <p className={`text-xs font-bold leading-snug ${c.title}`}>{t.title}</p>
                {t.body && <p className="text-[10px] text-[#4B5675] mt-0.5 leading-snug">{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Day Recap Modal ───────────────────────────────────────────────────── */}
      {showSummary && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => setShowSummary(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[#0C1017] border border-[#1C2333] rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C2333]">
              <div>
                <p className="font-bold text-[#F1F5F9]">Today&apos;s Trading Recap</p>
                <p className="text-[10px] text-[#4B5675] mt-0.5">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</p>
              </div>
              <button type="button" onClick={() => setShowSummary(false)} className="text-[#4B5675] hover:text-[#F1F5F9] text-xl leading-none transition-colors">×</button>
            </div>
            <div className="grid grid-cols-3 border-b border-[#1C2333]">
              {[
                { label:"Trades",   value: dayTrades.length.toString(),                                                   color:"text-indigo-400"  },
                { label:"P&L",      value: `${realizedPL >= 0 ? "+" : ""}$${realizedPL.toFixed(2)}`,                    color: realizedPL >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label:"Win Rate", value: winRate != null ? `${winRate}%` : "—",                                         color:"text-amber-400"   },
              ].map(s => (
                <div key={s.label} className="p-4 text-center border-r border-[#1C2333] last:border-0">
                  <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 border-b border-[#1C2333] flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1.5 text-[#7B8DB4]"><span className="text-violet-400">⚡</span>{signalTrades} signal trade{signalTrades !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1.5 text-[#7B8DB4]"><span className="text-indigo-400">🔍</span>{scanTrades} scan trade{scanTrades !== 1 ? "s" : ""}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {dayTrades.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-[#4B5675] text-sm">No trades executed today yet.</p>
                </div>
              ) : (
                dayTrades.map((t, i) => {
                  const clean = t.symbol.replace(".US","").replace(".COMM","");
                  const isBuy = t.side === "BUY";
                  const time  = new Date(t.time).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
                  return (
                    <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-[#1C2333] last:border-0">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${isBuy ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}>{t.side}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[#F1F5F9] text-sm">{clean}</p>
                          <span className={`text-[8px] font-bold ${t.source === "signal" ? "text-violet-400" : "text-indigo-400"}`}>{t.source === "signal" ? "⚡" : "🔍"}</span>
                        </div>
                        <p className="text-[10px] text-[#4B5675] font-mono">{t.quantity} × ${t.price.toFixed(2)} · {time}</p>
                      </div>
                      {t.pl != null && (
                        <p className={`text-xs font-mono font-bold shrink-0 ${t.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{t.pl >= 0 ? "+" : ""}${t.pl.toFixed(2)}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-5 py-3 text-center">
              <p className="text-[10px] text-[#2D3A50]">⚡ Signal = instant trade on dashboard alert · 🔍 Scan = parallel 5-min cycle</p>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB + Panel ──────────────────────────────────────────────────────── */}
      <div className="fixed top-[76px] right-2 sm:top-[88px] sm:right-4 z-50 flex flex-col-reverse items-end gap-2">
        {open && (
          <div className="w-72 bg-[#0C1017]/95 border border-[#1C2333] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C2333]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${active ? "bg-emerald-400 animate-pulse" : "bg-[#4B5675]"}`} />
                <p className="text-xs font-bold text-[#F1F5F9]">AutoTrader</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${active ? "bg-emerald-500/15 text-emerald-400" : "bg-[#1C2333] text-[#4B5675]"}`}>{active ? "LIVE" : "OFF"}</span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {active && (
                <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-violet-400 font-bold uppercase tracking-widest mb-1">Active Modes</p>
                  <div className="flex gap-4 text-[10px] text-[#7B8DB4]">
                    <span className="flex items-center gap-1"><span className="text-violet-400">⚡</span>Signals (instant)</span>
                    <span className="flex items-center gap-1"><span className="text-indigo-400">🔍</span>All 20 stocks / 5 min</span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Status</p>
                <p className="text-xs text-[#F1F5F9] font-medium truncate">{scanning ? "⏳ " : ""}{status}</p>
              </div>
              {lastAction && (
                <div>
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Last Action</p>
                  <p className="text-[11px] text-[#7B8DB4] leading-snug">{lastAction}</p>
                </div>
              )}
              {dayTrades.length > 0 && (
                <div className="bg-[#060A14] border border-[#1C2333] rounded-xl px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Today&apos;s P&L</p>
                    <p className={`text-sm font-black font-mono mt-0.5 ${realizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{realizedPL >= 0 ? "+" : ""}${realizedPL.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">{dayTrades.length} trades</p>
                    <p className="text-[10px] text-[#7B8DB4] mt-0.5">{signalTrades}⚡ {scanTrades}🔍</p>
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">Next Full Scan</p>
                  <p className="text-[9px] font-mono text-[#4B5675]">{countdownStr}</p>
                </div>
                <div className="h-1 bg-[#1C2333] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${active ? "bg-indigo-500" : "bg-[#1C2333]"} w-pct-${Math.round(progressPct / 5) * 5}`} />
                </div>
              </div>
              <p className="text-[9px] text-[#2D3A50] leading-relaxed pt-1 border-t border-[#1C2333]">Scans all 20 stocks simultaneously · Dashboard alerts trade instantly · SL −4% · TP +8%</p>
            </div>
            <div className="px-4 pb-4 space-y-2">
              <button type="button" onClick={() => { setShowSummary(true); refreshDayTrades(); }} className="w-full py-2 rounded-xl text-[11px] font-bold bg-[#111827] border border-[#1C2333] text-[#7B8DB4] hover:text-[#F1F5F9] hover:border-[#2D3A50] transition-all">📊 Day Recap</button>
              <button type="button" onClick={() => setActive(a => !a)} className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${active ? "bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>{active ? "Stop AutoTrader" : "Start AutoTrader"}</button>
            </div>
          </div>
        )}
        <button type="button" onClick={() => setOpen(o => !o)} title="AutoTrader" className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95 ${active ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25" : "bg-[#0C1017]/90 border border-[#1C2333] hover:border-[#2D3A50] text-[#7B8DB4] hover:text-[#F1F5F9] backdrop-blur-xl"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white animate-pulse" : "bg-[#4B5675]"}`} />
          Auto
          {active && scanning && <svg className="animate-spin ml-0.5" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
        </button>
      </div>
    </>
  );
}
