"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import SentimentWidget from "../components/SentimentWidget";
import MarketStatus from "../components/MarketStatus";
import { scopedKey } from "../lib/userState";

type TradeLevels = {
  entryZone:   string;
  stopLoss:    string;
  takeProfit:  string;
  entryReason: string;
  stopReason:  string;
  tpReason:    string;
  rrRatio:     string;
};

type StockCard = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  trade: TradeLevels | null;
  loading: boolean;
  isNew?: boolean;
};

type FuturesCard = {
  symbol: string;
  name: string;
  category: string;
  exchange: string;
  price: number | null;
  change: number | null;
  loading: boolean;
};

const WATCHLIST = [
  { symbol: "AAPL.US",  name: "Apple Inc." },
  { symbol: "MSFT.US",  name: "Microsoft Corp." },
  { symbol: "NVDA.US",  name: "NVIDIA Corp." },
  { symbol: "TSLA.US",  name: "Tesla Inc." },
  { symbol: "AMZN.US",  name: "Amazon.com Inc." },
  { symbol: "GOOGL.US", name: "Alphabet Inc." },
  { symbol: "META.US",  name: "Meta Platforms" },
  { symbol: "JPM.US",   name: "JPMorgan Chase" },
  { symbol: "ES.COMM",  name: "E-mini S&P 500" },
];

const FUTURES_LIST = [
  { symbol: "ES.COMM",  name: "E-mini S&P 500",    category: "Index",  exchange: "CME"   },
  { symbol: "NQ.COMM",  name: "E-mini NASDAQ-100",  category: "Index",  exchange: "CME"   },
  { symbol: "YM.COMM",  name: "E-mini Dow Jones",   category: "Index",  exchange: "CBOT"  },
  { symbol: "RTY.COMM", name: "E-mini Russell 2000", category: "Index",  exchange: "CME"   },
  { symbol: "GC.COMM",  name: "Gold",               category: "Metals", exchange: "NYMEX" },
  { symbol: "SI.COMM",  name: "Silver",             category: "Metals", exchange: "NYMEX" },
  { symbol: "CL.COMM",  name: "Crude Oil (WTI)",    category: "Energy", exchange: "NYMEX" },
  { symbol: "NG.COMM",  name: "Natural Gas",         category: "Energy", exchange: "NYMEX" },
];



function signalBadge(signal: string | null) {
  if (signal === "BUY")  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (signal === "SELL") return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
}

function signalBorder(signal: string | null) {
  if (signal === "BUY")  return "border-l-emerald-500/40";
  if (signal === "SELL") return "border-l-rose-500/40";
  return "border-l-[#252345]";
}

function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

function fireNotification(symbol: string, name: string, signal: "BUY" | "SELL", price: number, confidence: string) {
  if (typeof window === "undefined") return;
  // Respect pause toggle
  if (localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true") return;
  // Persist alert so history builds even without push permission
  const existing = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]");
  existing.unshift({ symbol, name, signal, price, confidence, time: Date.now() });
  localStorage.setItem(scopedKey("traxora_alerts"), JSON.stringify(existing.slice(0, 50)));
  window.dispatchEvent(new CustomEvent("traxora-signal", {
    detail: { symbol, name, signal, price, confidence }
  }));
  if (Notification.permission !== "granted") return;
  const emoji = signal === "BUY" ? "🟢" : "🔴";
  const notif = new Notification(
    `${emoji} Traxora AI — ${signal}: ${symbol.replace(".US","").replace(".COMM","")}`,
    { body: `${name} · $${price.toFixed(2)} · ${confidence} confidence`, icon: "/icon-192.png", tag: `signal-${symbol}` }
  );
  notif.onclick = () => { window.focus(); window.location.href = `/notifications`; notif.close(); };
}

// Dedup: don't re-fire the same signal for the same symbol within 4 hours.
// Only fires again if the signal DIRECTION changes (BUY→SELL or vice versa).
function shouldFireAlert(symbol: string, signal: "BUY" | "SELL"): boolean {
  try {
    const raw = localStorage.getItem(scopedKey("traxora_last_signals"));
    const stored: Record<string, { signal: string; time: number }> = raw ? JSON.parse(raw) : {};
    const entry = stored[symbol];
    if (!entry) return true;
    if (entry.signal !== signal) return true; // direction changed → always fire
    return Date.now() - entry.time > 4 * 60 * 60 * 1000; // same direction: fire after 4 h
  } catch { return true; }
}

function markAlertFired(symbol: string, signal: "BUY" | "SELL") {
  try {
    const raw = localStorage.getItem(scopedKey("traxora_last_signals"));
    const stored: Record<string, { signal: string; time: number }> = raw ? JSON.parse(raw) : {};
    stored[symbol] = { signal, time: Date.now() };
    localStorage.setItem(scopedKey("traxora_last_signals"), JSON.stringify(stored));
  } catch { /* ignore */ }
}


const PAPER_KEY   = "paper_portfolio_v2";
const PAPER_START = 10_000;

type PaperStats = {
  accountValue: number;
  realizedPL:   number;
  openCount:    number;
  closedCount:  number;
  winRate:      number | null;
};

function loadPaperStats(storageKey: string): PaperStats {
  const empty: PaperStats = { accountValue: PAPER_START, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    const trades = JSON.parse(raw) as Array<{
      direction: string; entryPrice: number; exitPrice: number | null; shares: number; status: string;
    }>;
    const open   = trades.filter(t => t.status === "OPEN");
    const closed = trades.filter(t => t.status === "CLOSED");
    const pl     = (t: typeof trades[0], price: number) =>
      (t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price) * t.shares;
    const realizedPL  = closed.reduce((s, t) => t.exitPrice != null ? s + pl(t, t.exitPrice) : s, 0);
    const wins        = closed.filter(t => t.exitPrice != null && pl(t, t.exitPrice) > 0).length;
    return {
      accountValue: PAPER_START + realizedPL,
      realizedPL,
      openCount:   open.length,
      closedCount: closed.length,
      winRate:     closed.length > 0 ? Math.round((wins / closed.length) * 100) : null,
    };
  } catch { return empty; }
}

export default function DashboardPage() {
  const { status } = useSession();
  const [planChecked, setPlanChecked] = useState(false);

  const [paperStats, setPaperStats] = useState<PaperStats>({
    accountValue: PAPER_START, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null,
  });

  const [stocks, setStocks] = useState<StockCard[]>(
    WATCHLIST.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, trade: null, loading: true }))
  );
  const [trendingStocks, setTrendingStocks] = useState<StockCard[]>([]);
  const [poppedSymbols, setPoppedSymbols]   = useState<Set<string>>(new Set());
  const [futures, setFutures] = useState<FuturesCard[]>(
    FUTURES_LIST.map((f) => ({ ...f, price: null, change: null, loading: true }))
  );

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [alertsPaused, setAlertsPaused] = useState(false);

  // Gate: wait for session to load before checking plan
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { window.location.href = "/login?signedOut=1"; return; }
    fetch("/api/user/plan")
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan === "free") { window.location.href = "/pricing"; return; }
        setPlanChecked(true);
      })
      .catch(() => setPlanChecked(true));
  }, [status]);

  useEffect(() => {
    const key     = scopedKey(PAPER_KEY);
    const refresh = () => setPaperStats(loadPaperStats(key));
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
    } else {
      setNotifPermission(Notification.permission);
    }
    setAlertsPaused(localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true");
  }, []);

  // Fetch stocks + signals
  useEffect(() => {
    WATCHLIST.forEach(async ({ symbol, name }, i) => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price = data?.price ?? null;
        const prev  = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        setStocks((s) => s.map((c, idx) => idx === i ? { ...c, price, change, loading: false } : c));
        if (price && prev) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, price, previousClose: prev, open: data?.open, high: data?.high, low: data?.low, dayChangePercent: change }),
          });
          const analysis = await analyzeRes.json();
          const signal: "BUY" | "HOLD" | "SELL" | null = analysis?.signal ?? null;
          const confidence: "High" | "Medium" | "Low" | null = analysis?.confidence ?? null;
          const trade: TradeLevels | null = analysis?.trade ?? null;
          setStocks((s) => s.map((c, idx) => idx === i ? { ...c, signal, confidence, trade } : c));
          if (signal && signal !== "HOLD") {
            setPoppedSymbols((prev) => new Set([...prev, symbol]));
          }
          if (signal && signal !== "HOLD" && shouldFireAlert(symbol, signal) && price) {
            fireNotification(symbol, name, signal, price, confidence ?? "Medium");
            markAlertFired(symbol, signal);
          }
        }
      } catch {
        setStocks((s) => s.map((c, idx) => idx === i ? { ...c, loading: false } : c));
      }
    });
  }, []);

  // Fetch futures prices (price only, no AI call)
  useEffect(() => {
    FUTURES_LIST.forEach(async ({ symbol }, i) => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price = data?.price ?? null;
        const prev  = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        setFutures((f) => f.map((c, idx) => idx === i ? { ...c, price, change, loading: false } : c));
      } catch {
        setFutures((f) => f.map((c, idx) => idx === i ? { ...c, loading: false } : c));
      }
    });
  }, []);

  // After all watchlist signals load, fetch trending stocks and pop them in
  useEffect(() => {
    const allDone = stocks.length > 0 && stocks.every(
      (s) => !s.loading && (s.signal !== null || s.price === null),
    );
    if (!allDone || trendingStocks.length > 0) return;

    const existingSyms = new Set(
      WATCHLIST.map((w) => w.symbol.replace(/\.(US|COMM)$/, "")),
    );

    async function loadTrending() {
      try {
        const res  = await fetch("/api/market/trending");
        const data = await res.json();
        const fresh: StockCard[] = ((data.trending ?? []) as Array<{
          symbol: string; name: string; price: number; previousClose: number;
          changePct: number; open: number | null; high: number | null; low: number | null;
        }>)
          .filter((t) => !existingSyms.has(t.symbol))
          .slice(0, 4)
          .map((t) => ({
            symbol:     t.symbol,
            name:       t.name,
            price:      t.price,
            change:     t.changePct,
            signal:     null,
            confidence: null,
            trade:      null,
            loading:    false,
            isNew:      true,
          }));

        if (fresh.length === 0) return;
        setTrendingStocks(fresh);

        for (const s of fresh) {
          try {
            const ar = await fetch("/api/ai/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: s.symbol, price: s.price,
                previousClose: s.price, dayChangePercent: s.change,
              }),
            });
            const analysis = await ar.json();
            const signal: "BUY" | "HOLD" | "SELL" | null      = analysis?.signal     ?? null;
            const confidence: "High" | "Medium" | "Low" | null  = analysis?.confidence ?? null;
            const trade: TradeLevels | null                      = analysis?.trade      ?? null;
            setTrendingStocks((prev) =>
              prev.map((t) => t.symbol === s.symbol ? { ...t, signal, confidence, trade } : t),
            );
            if (signal && signal !== "HOLD") {
              setPoppedSymbols((prev) => new Set([...prev, s.symbol]));
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    loadTrending();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  if (!planChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p className="text-[#4B5675] text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  function toggleAlertPause() {
    setAlertsPaused(prev => {
      const next = !prev;
      localStorage.setItem(scopedKey("traxora_alerts_paused"), String(next));
      return next;
    });
  }

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

  function signalRank(s: StockCard): number {
    if (s.signal === "BUY"  && s.confidence === "High")   return 0;
    if (s.signal === "SELL" && s.confidence === "High")   return 1;
    if (s.signal === "BUY"  && s.confidence === "Medium") return 2;
    if (s.signal === "SELL" && s.confidence === "Medium") return 3;
    if (s.signal === "BUY")                               return 4;
    if (s.signal === "SELL")                              return 5;
    if (s.loading || (s.price !== null && s.signal === null)) return 6;
    return 7; // HOLD or no data
  }


  const buyCount  = stocks.filter((s) => s.signal === "BUY").length;
  const holdCount = stocks.filter((s) => s.signal === "HOLD").length;
  const sellCount = stocks.filter((s) => s.signal === "SELL").length;
  const sentiment = buyCount > sellCount ? "Bullish" : sellCount > buyCount ? "Bearish" : "Neutral";
  // true while any stock is still fetching a quote or waiting on AI signal
  const isAnalyzing = stocks.some((s) => s.loading || (s.price !== null && s.signal === null));

  // Keep original order while loading; sort by signal strength once done
  const displayStocks: StockCard[] = isAnalyzing
    ? stocks
    : [...stocks, ...trendingStocks].sort((a, b) => signalRank(a) - signalRank(b));

  const futuresByCategory = ["Index", "Metals", "Energy"].map((cat) => ({
    cat,
    items: futures.filter((f) => f.category === cat),
  }));

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 xl:p-8 overflow-y-auto pb-28">
          <div className="max-w-6xl mx-auto w-full space-y-12">

          {/* ── SENTIMENT ── */}
          <SentimentWidget />

          {/* ── PAGE 1: OVERVIEW ── */}
          <section>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Investment Dashboard</h1>
                <p className="text-sm text-[#7B8DB4] mt-1">AI-powered signals across stocks &amp; futures</p>
              </div>
              <MarketStatus />
              {notifPermission === "default" && (
                <button type="button" onClick={requestNotifications}
                  className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2 rounded-xl text-sm font-medium transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Enable Signal Alerts
                </button>
              )}
              {notifPermission === "granted" && (
                <button
                  type="button"
                  onClick={toggleAlertPause}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    alertsPaused
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  }`}
                >
                  {alertsPaused ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Resume Alerts
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause Alerts
                    </>
                  )}
                </button>
              )}
              {notifPermission === "denied" && (
                <span className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl text-sm font-medium">Alerts Blocked</span>
              )}
            </div>

            {/* Stat cards */}
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Sentiment card — pulsing while AI signals are loading */}
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
                <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">Sentiment</p>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 mt-2">
                    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span className="text-sm text-[#4B5675] animate-pulse">Analyzing…</span>
                  </div>
                ) : (
                  <p className={`text-2xl font-bold mt-2 font-mono ${sentiment === "Bullish" ? "text-emerald-400" : sentiment === "Bearish" ? "text-rose-400" : "text-amber-400"}`}>
                    {sentiment}
                  </p>
                )}
              </div>
              {[
                { label: "Buy Signals",  value: buyCount.toString(),  color: "text-emerald-400" },
                { label: "Hold Signals", value: holdCount.toString(), color: "text-amber-400" },
                { label: "Sell Signals", value: sellCount.toString(), color: "text-rose-400" },
              ].map((s) => (
                <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
                  <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">{s.label}</p>
                  <p className={`text-2xl font-bold mt-2 font-mono ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Paper Portfolio summary ── */}
            <Link href="/paper" className="mt-4 block group">
              <div className="bg-[#13112A] border border-[#252345] hover:border-[#333368] rounded-2xl px-5 py-4 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#4B5675] font-semibold uppercase tracking-widest">Paper Portfolio</p>
                  <span className="text-[10px] text-emerald-400 group-hover:text-emerald-300 font-medium">View trades →</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Account Value",
                      value: `$${paperStats.accountValue.toFixed(2)}`,
                      color: "text-[#F1F5F9]",
                      sub: `of $${PAPER_START.toLocaleString()} started`,
                    },
                    {
                      label: "Realized P / L",
                      value: `${paperStats.realizedPL >= 0 ? "+" : ""}$${paperStats.realizedPL.toFixed(2)}`,
                      color: paperStats.realizedPL >= 0 ? "text-emerald-400" : "text-rose-400",
                      sub: `${paperStats.closedCount} closed trade${paperStats.closedCount !== 1 ? "s" : ""}`,
                    },
                    {
                      label: "Open Positions",
                      value: paperStats.openCount.toString(),
                      color: "text-[#F1F5F9]",
                      sub: "active trades",
                    },
                    {
                      label: "Win Rate",
                      value: paperStats.winRate != null ? `${paperStats.winRate}%` : "—",
                      color: paperStats.winRate != null ? (paperStats.winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#7B8DB4]",
                      sub: paperStats.closedCount > 0 ? `${paperStats.closedCount} trades` : "no history yet",
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[10px] text-[#4B5675] uppercase tracking-widest">{s.label}</p>
                      <p className={`text-xl font-black font-mono tabular-nums mt-1 ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-[#333368] mt-0.5">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Mini equity bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-[9px] text-[#333368] mb-1">
                    <span>Account Value ${paperStats.accountValue.toFixed(2)}</span>
                    <span>Start $10,000</span>
                  </div>
                  <div className="flex gap-0.5 h-1.5">
                    {Array.from({ length: 20 }).map((_, i) => {
                      const pct = Math.min(100, Math.max(2, (paperStats.accountValue / Math.max(paperStats.accountValue, PAPER_START)) * 100));
                      return (
                        <div key={i} className={`flex-1 rounded-sm ${(i / 20) * 100 < pct ? paperStats.realizedPL >= 0 ? "bg-emerald-500" : "bg-rose-500" : "bg-[#1A1838]"}`} />
                      );
                    })}
                  </div>
                </div>
              </div>
            </Link>


            {/* Watchlist */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Market Watchlist</h2>
                  <span className="text-[10px] font-mono text-[#4B5675]">
                    {displayStocks.length} stocks
                    {trendingStocks.length > 0 && (
                      <span className="text-teal-400"> · {trendingStocks.length} trending</span>
                    )}
                  </span>
                </div>
                <Link href="/explore" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium">View all markets →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {displayStocks.map((stock) => {
                  const hasPopped = poppedSymbols.has(stock.symbol);
                  const animClass = stock.isNew
                    ? "animate-stock-arrive"
                    : hasPopped
                    ? "animate-stock-pop"
                    : "";
                  return (
                    <Link
                      key={stock.symbol}
                      href={`/analysis?symbol=${encodeURIComponent(stock.isNew ? stock.symbol + ".US" : stock.symbol)}`}
                      className={`group bg-[#13112A] rounded-2xl p-5 border border-l-2 hover:border-[#333368] hover:bg-[#1A1838] transition-colors border-[#252345] ${signalBorder(stock.signal)} ${animClass}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold tracking-tight">{stock.symbol.replace(".US","").replace(".COMM","")}</p>
                            {stock.isNew && (
                              <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20">TRENDING</span>
                            )}
                          </div>
                          <p className="text-xs text-[#4B5675] mt-0.5 truncate max-w-[130px]">{stock.name}</p>
                        </div>
                        {stock.loading
                          ? <span className="text-xs text-[#4B5675] animate-pulse">…</span>
                          : stock.signal
                          ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${signalBadge(stock.signal)}`}>{stock.signal}</span>
                              {stock.confidence && (
                                <span className={`text-[9px] font-semibold ${stock.confidence === "High" ? "text-emerald-400" : stock.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>
                                  {stock.confidence}
                                </span>
                              )}
                            </div>
                          )
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-[#1A1838] text-[#4B5675] border-[#252345]">—</span>
                        }
                      </div>
                      <p className={`text-xl font-bold font-mono ${changeColor(stock.change)}`}>
                        {stock.price !== null ? `$${stock.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                      </p>
                      <p className={`text-xs mt-1 font-medium font-mono ${changeColor(stock.change)}`}>
                        {stock.change !== null ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% today` : "—"}
                      </p>

                      {stock.trade && stock.signal !== "HOLD" ? (
                        <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${stock.signal === "BUY" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Entry</span>
                            <span className="text-[10px] font-mono font-bold text-amber-400 text-right">{stock.trade.entryZone}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Stop</span>
                            <span className="text-[10px] font-mono font-bold text-rose-400">{stock.trade.stopLoss}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Target</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-400">{stock.trade.takeProfit}</span>
                          </div>
                          <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5 leading-snug">{stock.trade.rrRatio} R:R · {stock.trade.entryReason}</p>
                        </div>
                      ) : stock.signal === "HOLD" ? (
                        <p className="text-[10px] text-[#4B5675] mt-3">No clear setup — wait for direction</p>
                      ) : null}

                      <p className="text-[11px] text-emerald-400 mt-3 group-hover:text-emerald-300 transition-colors font-medium">View analysis →</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── PAGE 2: FUTURES MARKETS ── */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Futures Markets</h2>
                <p className="text-sm text-[#7B8DB4] mt-1">Live prices across index, metals &amp; energy futures</p>
              </div>
              <Link href="/explore" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium">All exchanges →</Link>
            </div>

            <div className="space-y-6">
              {futuresByCategory.map(({ cat, items }) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">{cat} Futures</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {items.map((f) => (
                      <Link key={f.symbol} href={`/analysis?symbol=${encodeURIComponent(f.symbol)}`}
                        className="group bg-[#13112A] border border-[#252345] hover:border-[#333368] hover:bg-[#1A1838] rounded-2xl p-4 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-sm tracking-tight">{f.symbol.replace(".COMM","")}</p>
                            <p className="text-[11px] text-[#4B5675] mt-0.5 truncate max-w-[100px]">{f.name}</p>
                          </div>
                          <span className="text-[10px] font-bold text-[#4B5675] bg-[#1A1838] border border-[#252345] px-1.5 py-0.5 rounded-md shrink-0">{f.exchange}</span>
                        </div>
                        <p className="text-lg font-bold font-mono">
                          {f.loading ? <span className="text-[#4B5675] animate-pulse text-sm">Loading…</span>
                            : f.price !== null ? `$${f.price.toFixed(2)}` : <span className="text-[#4B5675]">N/A</span>}
                        </p>
                        <p className={`text-xs font-mono mt-1 ${changeColor(f.change)}`}>
                          {f.change !== null ? `${f.change >= 0 ? "+" : ""}${f.change.toFixed(2)}% today` : "—"}
                        </p>
                        <p className="text-[11px] text-emerald-400 mt-3 group-hover:text-emerald-300 transition-colors">Analyze →</p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PAGE 3: RISK RULES + BROKER CTA ── */}
          <section>
            {/* Risk rules */}
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 mb-6">
              <p className="text-sm font-semibold mb-4">5 rules to protect your money</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: "💰", rule: "Never risk more than 5–10% per trade", detail: "If you have $500, max $25–$50 per signal." },
                  { icon: "🛡️", rule: "Always set a stop-loss", detail: "4–5% below your buy price on Robinhood. Non-negotiable." },
                  { icon: "🧠", rule: "Understand before you act", detail: "Read the market analysis. Know why the signal fired." },
                  { icon: "⏳", rule: "Patience beats FOMO", detail: "Not every signal is worth taking. Wait for high confidence." },
                  { icon: "📓", rule: "Keep a trade journal", detail: "Note why you entered, what happened, what you learned." },
                  { icon: "⚠️", rule: "AI is not 100% right", detail: "No tool is. This is a starting point, not a guarantee." },
                ].map((r) => (
                  <div key={r.rule} className="flex gap-3 bg-[#0D0B1A] border border-[#252345] rounded-xl p-3">
                    <span className="text-base shrink-0">{r.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-[#F1F5F9]">{r.rule}</p>
                      <p className="text-[11px] text-[#4B5675] mt-0.5">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exchange CTA */}
            <div className="mt-4 rounded-2xl border border-[#252345] bg-gradient-to-r from-emerald-600/10 to-teal-600/10 p-6 flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h3 className="font-semibold">Explore all exchanges</h3>
                <p className="text-sm text-[#7B8DB4] mt-1">CBOE, CBOT, CME, KCBT, MGE, NYBOT &amp; NYMEX — instant AI analysis on every contract.</p>
              </div>
              <Link href="/explore" className="shrink-0 bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-semibold text-white">
                Open Explorer
              </Link>
            </div>
          </section>

          </div>
        </main>
      </div>
    </div>
  );
}
