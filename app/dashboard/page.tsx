"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import SentimentWidget from "../components/SentimentWidget";
import MarketStatus from "../components/MarketStatus";
import LiveTradingRoom from "../components/LiveTradingRoom";
import { getPortfolio, STARTING_BALANCE, PORTFOLIO_UPDATED_EVENT, type Portfolio } from "../lib/trading";

type StockCard = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
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

const ALL_ICT_CONCEPTS = [
  {
    tag: "OB",
    tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    title: "Order Block",
    desc: "The last bearish candle before a strong bullish move — or the last bullish candle before a drop. Smart money leaves footprints here. Traxora AI flags these zones as potential reversal points.",
    example: "If AAPL sold off hard then reversed, the last green candle before the drop is a bearish OB.",
  },
  {
    tag: "FVG",
    tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    title: "Fair Value Gap",
    desc: "A price imbalance — a zone where price moved so fast it left a gap of unfilled orders. Institutions often send price back to fill these gaps before continuing the move.",
    example: "Price jumped from $180 to $185 in one candle. The $181–$184 range is a bullish FVG.",
  },
  {
    tag: "LIQ",
    tagColor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    title: "Liquidity Sweep",
    desc: "Stop-loss orders cluster above recent highs (buy-side liquidity) and below recent lows (sell-side liquidity). Smart money sweeps these levels to fill large orders before reversing.",
    example: "Price briefly spikes above last week's high, triggers stops, then reverses down sharply.",
  },
  {
    tag: "MSS",
    tagColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    title: "Market Structure Shift",
    desc: "A change in trend direction confirmed by a break of a key swing high or low. A bullish MSS is when price breaks a prior high after a series of lower lows — trend is reversing.",
    example: "Stock made lower highs for 3 days, then broke above the last swing high. Bullish MSS confirmed.",
  },
  {
    tag: "OTE",
    tagColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    title: "Optimal Trade Entry",
    desc: "The 62%–79% Fibonacci retracement zone of a swing move. This is where ICT traders look for entries after a pullback — giving the best risk/reward before the next leg up or down.",
    example: "NVDA swings from $800 to $900. The OTE zone is $869–$878. That's where buyers re-enter.",
  },
  {
    tag: "PD",
    tagColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    title: "Premium & Discount",
    desc: "Price above the 50% midpoint of a range is in 'premium' — expensive, ideal for sells. Price below the midpoint is in 'discount' — cheap, ideal for buys. Simple but powerful filter.",
    example: "Day range: $100 low to $120 high. Midpoint = $110. If price is at $116, it's in premium — avoid buying.",
  },
  {
    tag: "BRK",
    tagColor: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    title: "Breaker Block",
    desc: "A failed Order Block — an OB that price has already broken through. Once violated it flips polarity: former support becomes resistance and vice versa. Price is magnetically drawn back to these zones.",
    example: "Bullish OB at $150 was breached to the downside. The $148–$150 zone is now a Bearish Breaker — expect rejection on any return.",
  },
  {
    tag: "PO3",
    tagColor: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    title: "Power of Three",
    desc: "The 3-phase institutional cycle: Accumulation (institutions quietly build positions), Manipulation (a Judas Swing sweeps stops), Distribution (the real directional move). This plays out on every timeframe.",
    example: "Asian session ranges at $200 (Accumulation). London spikes to $197 trapping bears (Manipulation). NY drives to $215 (Distribution).",
  },
  {
    tag: "KZ",
    tagColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    title: "Kill Zones",
    desc: "Time windows when institutional order flow is heaviest and ICT setups have the highest probability. London Open 2–5 AM ET and NY Open 7–10 AM ET produce the most powerful moves.",
    example: "NVDA drops at 3 AM ET to tap a discount FVG (London Kill Zone), then rockets +2% before 5 AM — textbook setup.",
  },
  {
    tag: "NDOG",
    tagColor: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    title: "New Day Opening Gap",
    desc: "The price gap between yesterday's close and today's open. This inefficiency acts as a magnet — price will often return to fill it during the session before the real directional move continues.",
    example: "SPY closed at $520. Opens at $523. The $520–$523 NDOG acts as a fill target during the NY session.",
  },
  {
    tag: "BPR",
    tagColor: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    title: "Balanced Price Range",
    desc: "Two overlapping Fair Value Gaps — one bullish, one bearish — creating a zone of equilibrium. Institutions use BPRs to balance their books. Price entering a BPR often consolidates or reverses sharply.",
    example: "Bullish FVG at $100–$102 overlaps a bearish FVG at $101–$103. The $101–$102 overlap is the BPR — a high-reaction zone.",
  },
  {
    tag: "CE",
    tagColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    title: "Consequent Encroachment",
    desc: "The exact 50% midpoint of a Fair Value Gap or Order Block. This is the most precise ICT entry level — institutions fill remaining orders here before continuation, minimising stop-loss distance.",
    example: "Bullish FVG spans $180–$186. CE is at $183. A hold at $183 is a precision entry with a tight stop below $180.",
  },
  {
    tag: "JS",
    tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    title: "Judas Swing",
    desc: "A deliberately engineered false move at session open to trap retail traders. After sweeping obvious stop-loss clusters, price violently reverses in the true institutional direction.",
    example: "At 9:30 AM ET, SPY drops 0.8% below yesterday's low sweeping stops, then reverses and closes the day up 1.2%.",
  },
  {
    tag: "MB",
    tagColor: "bg-lime-500/10 text-lime-400 border-lime-500/20",
    title: "Mitigation Block",
    desc: "A price level where a prior Order Block has been partially visited once. The first touch causes a reaction but doesn't fully fill. The second return is where remaining institutional orders trigger the real move.",
    example: "Bearish OB at $250 caused a 3% drop on first touch. Price retraces to $250 again — institutional sell orders waiting trigger the second leg down.",
  },
  {
    tag: "SSL",
    tagColor: "bg-red-500/10 text-red-400 border-red-500/20",
    title: "Sell-Side Liquidity",
    desc: "Clustered stop-loss orders sitting below obvious swing lows, equal lows, or round numbers. Institutions push price below these levels to trigger stops and buy from panicking retail traders before reversing upward.",
    example: "AAPL has a swing low at $220 tested twice. SSL sits at $219.50. A sweep to $219.20 that snaps back above $220 is a textbook SSL grab.",
  },
  {
    tag: "BSL",
    tagColor: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
    title: "Buy-Side Liquidity",
    desc: "Clustered stop-loss orders sitting above obvious swing highs, equal highs, or round numbers. Smart money pushes price above these levels to sell into retail demand, then reverses the market downward.",
    example: "MSFT has a double top at $415. BSL pools above $415.50. A wick above $416 that closes back below $415 signals institutions sold into the spike.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "AI scans the market",
    desc: "Every time you open an analysis, Claude Opus 4.7 processes the live OHLC data and applies ICT Smart Money Concepts to identify the institutional bias.",
    color: "text-indigo-400",
    border: "border-indigo-500/20",
    bg: "bg-indigo-500/5",
  },
  {
    step: "02",
    title: "Signal fires on your phone",
    desc: "When a high-confidence BUY or SELL is detected, a push notification hits your phone. Tap it and you land directly on the analysis with the full breakdown.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
  },
  {
    step: "03",
    title: "You trade on Robinhood",
    desc: "Review the ICT context — Order Block, FVG, Liquidity level — then open Robinhood and place your trade. The step-by-step guide on every analysis page walks you through it.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
  },
];

function signalBadge(signal: string | null) {
  if (signal === "BUY")  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (signal === "SELL") return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
}

function signalBorder(signal: string | null) {
  if (signal === "BUY")  return "border-l-emerald-500/40";
  if (signal === "SELL") return "border-l-rose-500/40";
  return "border-l-[#1C2333]";
}

function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

function fireNotification(symbol: string, name: string, signal: "BUY" | "SELL", price: number, confidence: string) {
  if (typeof window === "undefined") return;
  // Fire custom event — AutoTrader picks this up to execute immediately
  window.dispatchEvent(new CustomEvent("traxora-signal", {
    detail: { symbol, name, signal, price, confidence }
  }));
  if (Notification.permission !== "granted") return;
  const emoji = signal === "BUY" ? "🟢" : "🔴";
  const notif = new Notification(
    `${emoji} Traxora AI — ${signal}: ${symbol.replace(".US","").replace(".COMM","")}`,
    { body: `${name} · $${price.toFixed(2)} · ${confidence} confidence — auto-trading now`, icon: "/icon-192.png", tag: `signal-${symbol}` }
  );
  notif.onclick = () => { window.focus(); window.location.href = `/analysis?symbol=${encodeURIComponent(symbol)}`; notif.close(); };
  const existing = JSON.parse(localStorage.getItem("traxora_alerts") ?? "[]");
  existing.unshift({ symbol, name, signal, price, confidence, time: Date.now() });
  localStorage.setItem("traxora_alerts", JSON.stringify(existing.slice(0, 50)));
}

function fifoRealizedPL(trades: Portfolio["trades"]): number {
  const sorted = [...trades].reverse();
  const queues: Record<string, { price: number; qty: number }[]> = {};
  let total = 0;
  for (const t of sorted) {
    if (t.side === "BUY") {
      if (!queues[t.symbol]) queues[t.symbol] = [];
      queues[t.symbol].push({ price: t.price, qty: t.quantity });
    } else {
      let rem = t.quantity;
      while (rem > 0 && queues[t.symbol]?.length > 0) {
        const buy = queues[t.symbol][0];
        const matched = Math.min(rem, buy.qty);
        total += (t.price - buy.price) * matched;
        buy.qty -= matched;
        rem -= matched;
        if (buy.qty === 0) queues[t.symbol].shift();
      }
    }
  }
  return total;
}

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: STARTING_BALANCE, holdings: [], trades: [], pendingOrders: [],
  });
  const [prices, setPrices]   = useState<Record<string, number>>({});
  const [ageMs,  setAgeMs]    = useState(0);
  const lastFetchRef = useRef<number>(Date.now());

  useEffect(() => {
    const load = () => setPortfolio(getPortfolio());
    load();
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, load);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, load);
  }, []);

  const fetchPrices = useCallback(async (holdings: Portfolio["holdings"]) => {
    if (holdings.length === 0) { setPrices({}); return; }
    const results = await Promise.allSettled(
      holdings.map(async (h) => {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(h.symbol)}`, { cache: "no-store" });
        const data = await res.json();
        return { symbol: h.symbol, price: typeof data.price === "number" ? data.price : null };
      }),
    );
    const map: Record<string, number> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.price !== null) map[r.value.symbol] = r.value.price;
    }
    setPrices(map);
    lastFetchRef.current = Date.now();
    setAgeMs(0);
  }, []);

  useEffect(() => {
    fetchPrices(portfolio.holdings);
    const id = setInterval(() => fetchPrices(portfolio.holdings), 5_000);
    return () => clearInterval(id);
  }, [portfolio.holdings, fetchPrices]);

  // Tick every 100 ms for the live age counter
  useEffect(() => {
    const id = setInterval(() => setAgeMs(Date.now() - lastFetchRef.current), 100);
    return () => clearInterval(id);
  }, []);

  const realizedPL = useMemo(() => fifoRealizedPL(portfolio.trades), [portfolio.trades]);

  const unrealizedPL = useMemo(() =>
    portfolio.holdings.reduce((s, h) => {
      const p = prices[h.symbol];
      return p != null ? s + (p - h.avgPrice) * h.quantity : s;
    }, 0),
    [portfolio.holdings, prices],
  );

  const marketValue = useMemo(() =>
    portfolio.holdings.reduce((s, h) => s + h.quantity * (prices[h.symbol] ?? h.avgPrice), 0),
    [portfolio.holdings, prices],
  );

  const totalPL    = realizedPL + unrealizedPL;
  const totalValue = portfolio.cash + marketValue;
  const ageSec     = Math.floor(ageMs / 1000);
  const ageMs10    = Math.floor((ageMs % 1000) / 100);

  const [stocks, setStocks] = useState<StockCard[]>(
    WATCHLIST.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, loading: true }))
  );
  const [trendingStocks, setTrendingStocks] = useState<StockCard[]>([]);
  const [poppedSymbols, setPoppedSymbols]   = useState<Set<string>>(new Set());
  const [futures, setFutures] = useState<FuturesCard[]>(
    FUTURES_LIST.map((f) => ({ ...f, price: null, change: null, loading: true }))
  );
  const [competeRank,  setCompeteRank]  = useState<number | null>(null);
  const [competeTotal, setCompeteTotal] = useState<number | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const prevSignals  = useRef<Record<string, string>>({});
  const ictReplacePos = useRef(0);
  const [ictIndices, setIctIndices] = useState([0, 1, 2, 3, 4, 5]);

  // Rotate one ICT concept card every 3.5 s, cycling through all 16
  useEffect(() => {
    const timer = setInterval(() => {
      setIctIndices((prev) => {
        const pos  = ictReplacePos.current % 6;
        ictReplacePos.current++;
        const available = ALL_ICT_CONCEPTS
          .map((_, i) => i)
          .filter((i) => !prev.includes(i));
        if (available.length === 0) return prev;
        const next = available[Math.floor(Math.random() * available.length)];
        const updated = [...prev];
        updated[pos] = next;
        return updated;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
    } else {
      setNotifPermission(Notification.permission);
    }
  }, []);

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

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
          setStocks((s) => s.map((c, idx) => idx === i ? { ...c, signal, confidence } : c));
          // pop the card when a decisive signal arrives
          if (signal && signal !== "HOLD") {
            setPoppedSymbols((prev) => new Set([...prev, symbol]));
          }
          if (signal && signal !== "HOLD" && signal !== prevSignals.current[symbol] && price) {
            fireNotification(symbol, name, signal, price, confidence ?? "Medium");
          }
          if (signal) prevSignals.current[symbol] = signal;
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
            loading:    false,
            isNew:      true,
          }));

        if (fresh.length === 0) return;
        setTrendingStocks(fresh);

        // AI-analyze each trending stock
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
            const signal: "BUY" | "HOLD" | "SELL" | null     = analysis?.signal     ?? null;
            const confidence: "High" | "Medium" | "Low" | null = analysis?.confidence ?? null;
            setTrendingStocks((prev) =>
              prev.map((t) => t.symbol === s.symbol ? { ...t, signal, confidence } : t),
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("traxora-portfolio");
      if (!raw) return;
      const p = JSON.parse(raw);
      const invested = (p.holdings ?? []).reduce((s: number, h: { quantity: number; avgPrice: number }) => s + h.quantity * h.avgPrice, 0);
      const total = (p.cash ?? 10000) + invested;
      setCompeteTotal(total);
      let rank = 1;
      for (const id of ["apex","delta","vera"]) {
        const br = localStorage.getItem(`traxora-bot-${id}`);
        if (!br) continue;
        const bp = JSON.parse(br);
        const bi = (bp.holdings ?? []).reduce((s: number, h: { quantity: number; avgPrice: number }) => s + h.quantity * h.avgPrice, 0);
        if ((bp.cash ?? 10000) + bi > total) rank++;
      }
      setCompeteRank(rank);
    } catch { /* ignore */ }
  }, []);

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
                  className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-400 px-4 py-2 rounded-xl text-sm font-medium transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Enable Signal Alerts
                </button>
              )}
              {notifPermission === "granted" && (
                <span className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]" />Alerts Active
                </span>
              )}
              {notifPermission === "denied" && (
                <span className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl text-sm font-medium">Alerts Blocked</span>
              )}
            </div>

            {/* Stat cards */}
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Sentiment card — pulsing while AI signals are loading */}
              <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl px-5 py-4">
                <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">Sentiment</p>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 mt-2">
                    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5">
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
                <div key={s.label} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl px-5 py-4">
                  <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">{s.label}</p>
                  <p className={`text-2xl font-bold mt-2 font-mono ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Portfolio P&L summary ── */}
            <Link href="/profit-loss" className="mt-4 block group">
              <div className="bg-[#0C1017] border border-[#1C2333] hover:border-[#2D3A50] rounded-2xl px-5 py-4 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[#4B5675] font-semibold uppercase tracking-widest">Portfolio P / L</p>
                  <div className="flex items-center gap-2">
                    {portfolio.holdings.length > 0 && (
                      <span className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-lg border ${
                        ageMs < 3_000
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-[#111827] border-[#1C2333] text-[#4B5675]"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${ageMs < 3_000 ? "bg-emerald-400" : "bg-[#4B5675]"}`} />
                        {ageSec}.{ageMs10}s ago
                      </span>
                    )}
                    <span className="text-[10px] text-indigo-400 group-hover:text-indigo-300 font-medium">Full breakdown →</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Total P / L",
                      value: `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`,
                      color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400",
                      sub: `${((totalPL / STARTING_BALANCE) * 100).toFixed(2)}%`,
                    },
                    {
                      label: "Unrealized",
                      value: `${unrealizedPL >= 0 ? "+" : ""}$${unrealizedPL.toFixed(2)}`,
                      color: unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400",
                      sub: portfolio.holdings.length > 0 ? `${portfolio.holdings.length} position${portfolio.holdings.length !== 1 ? "s" : ""}` : "no open positions",
                    },
                    {
                      label: "Realized",
                      value: `${realizedPL >= 0 ? "+" : ""}$${realizedPL.toFixed(2)}`,
                      color: realizedPL >= 0 ? "text-emerald-400" : "text-rose-400",
                      sub: `${portfolio.trades.filter(t => t.side === "SELL").length} closed trades`,
                    },
                    {
                      label: "Cash",
                      value: `$${portfolio.cash.toFixed(2)}`,
                      color: "text-[#F1F5F9]",
                      sub: `of $${STARTING_BALANCE.toLocaleString()} started`,
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[10px] text-[#4B5675] uppercase tracking-widest">{s.label}</p>
                      <p className={`text-xl font-black font-mono tabular-nums mt-1 ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-[#2D3A50] mt-0.5">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Mini equity bar */}
                {totalValue > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[9px] text-[#2D3A50] mb-1">
                      <span>Account Value ${totalValue.toFixed(2)}</span>
                      <span>Start ${STARTING_BALANCE.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-[#111827] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${totalPL >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${Math.min(100, Math.max(2, (totalValue / Math.max(totalValue, STARTING_BALANCE)) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Link>

            {/* Compete widget */}
            {competeRank !== null && competeTotal !== null && (
              <Link href="/compete" className="mt-4 flex items-center justify-between gap-4 bg-indigo-500/5 border border-indigo-500/20 hover:border-indigo-500/40 rounded-2xl px-5 py-4 transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black font-mono text-xl border ${
                    competeRank === 1 ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                    competeRank === 2 ? "bg-[#1C2333] border-[#2D3A50] text-[#7B8DB4]" :
                                        "bg-[#0C1017] border-[#1C2333] text-[#4B5675]"
                  }`}>
                    #{competeRank}
                  </div>
                  <div>
                    <p className="font-semibold text-[#F1F5F9] text-sm">
                      {competeRank === 1 ? "🏆 You lead the bots!" : competeRank === 2 ? "2nd place — one bot ahead" : `${competeRank === 3 ? "3rd" : "4th"} place — keep trading`}
                    </p>
                    <p className="text-[10px] text-[#4B5675] mt-0.5">
                      Portfolio ${competeTotal.toFixed(2)} · Competing vs Apex, Delta &amp; Vera
                    </p>
                  </div>
                </div>
                <span className="text-xs text-indigo-400 group-hover:text-indigo-300 font-medium shrink-0">View Leaderboard →</span>
              </Link>
            )}

            {/* Watchlist */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Market Watchlist</h2>
                  <span className="text-[10px] font-mono text-[#4B5675]">
                    {displayStocks.length} stocks
                    {trendingStocks.length > 0 && (
                      <span className="text-violet-400"> · {trendingStocks.length} trending</span>
                    )}
                  </span>
                </div>
                <Link href="/explore" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">View all markets →</Link>
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
                      className={`group bg-[#0C1017] rounded-2xl p-5 border border-l-2 hover:border-[#2D3A50] hover:bg-[#111827] transition-colors border-[#1C2333] ${signalBorder(stock.signal)} ${animClass}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold tracking-tight">{stock.symbol.replace(".US","").replace(".COMM","")}</p>
                            {stock.isNew && (
                              <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">TRENDING</span>
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
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-[#111827] text-[#4B5675] border-[#1C2333]">—</span>
                        }
                      </div>
                      <p className="text-xl font-bold font-mono">
                        {stock.price !== null ? `$${stock.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                      </p>
                      <p className={`text-xs mt-1 font-medium font-mono ${changeColor(stock.change)}`}>
                        {stock.change !== null ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% today` : "—"}
                      </p>
                      <p className="text-[11px] text-indigo-400 mt-4 group-hover:text-indigo-300 transition-colors font-medium">View analysis →</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── LIVE TRADING ROOM ── */}
          <LiveTradingRoom />

          {/* ── PAGE 2: FUTURES MARKETS ── */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Futures Markets</h2>
                <p className="text-sm text-[#7B8DB4] mt-1">Live prices across index, metals &amp; energy futures</p>
              </div>
              <Link href="/explore" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">All exchanges →</Link>
            </div>

            <div className="space-y-6">
              {futuresByCategory.map(({ cat, items }) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">{cat} Futures</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {items.map((f) => (
                      <Link key={f.symbol} href={`/analysis?symbol=${encodeURIComponent(f.symbol)}`}
                        className="group bg-[#0C1017] border border-[#1C2333] hover:border-[#2D3A50] hover:bg-[#111827] rounded-2xl p-4 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-sm tracking-tight">{f.symbol.replace(".COMM","")}</p>
                            <p className="text-[11px] text-[#4B5675] mt-0.5 truncate max-w-[100px]">{f.name}</p>
                          </div>
                          <span className="text-[10px] font-bold text-[#4B5675] bg-[#111827] border border-[#1C2333] px-1.5 py-0.5 rounded-md shrink-0">{f.exchange}</span>
                        </div>
                        <p className="text-lg font-bold font-mono">
                          {f.loading ? <span className="text-[#4B5675] animate-pulse text-sm">Loading…</span>
                            : f.price !== null ? `$${f.price.toFixed(2)}` : <span className="text-[#4B5675]">N/A</span>}
                        </p>
                        <p className={`text-xs font-mono mt-1 ${changeColor(f.change)}`}>
                          {f.change !== null ? `${f.change >= 0 ? "+" : ""}${f.change.toFixed(2)}% today` : "—"}
                        </p>
                        <p className="text-[11px] text-indigo-400 mt-3 group-hover:text-indigo-300 transition-colors">Analyze →</p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PAGE 3: ICT SMART MONEY CONCEPTS ── */}
          <section>
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight">ICT Smart Money Concepts</h2>
              <p className="text-sm text-[#7B8DB4] mt-1">
                What Traxora AI looks for on every chart — the same framework institutional traders use. All 16 concepts rotate live.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ictIndices.map((conceptIdx, pos) => {
                const c = ALL_ICT_CONCEPTS[conceptIdx];
                return (
                  <div key={`${pos}-${conceptIdx}`} className="animate-ict-in bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${c.tagColor}`}>{c.tag}</span>
                      <p className="font-semibold text-sm">{c.title}</p>
                    </div>
                    <p className="text-xs text-[#7B8DB4] leading-relaxed mb-3">{c.desc}</p>
                    <div className="bg-[#060A14] border border-[#1C2333] rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-[#4B5675] uppercase tracking-wider mb-1">Example</p>
                      <p className="text-xs text-[#CBD5E1] leading-relaxed">{c.example}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 bg-indigo-500/5 border border-indigo-500/15 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-300">See ICT analysis on any chart</p>
                <p className="text-xs text-[#7B8DB4] mt-0.5">Open any stock or futures on the Analysis page — Traxora AI runs all 6 concepts automatically and shows you the setup.</p>
              </div>
              <Link href="/analysis" className="shrink-0 bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 rounded-xl text-xs font-semibold text-white">
                Open Analysis →
              </Link>
            </div>
          </section>

          {/* ── PAGE 4: HOW TO TRADE + WEBULL CTA ── */}
          <section>
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight">How to Trade With Traxora</h2>
              <p className="text-sm text-[#7B8DB4] mt-1">From signal to executed trade in 3 steps — even if you&apos;ve never traded before.</p>
            </div>

            {/* 3-step guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {HOW_IT_WORKS.map((s) => (
                <div key={s.step} className={`${s.bg} border ${s.border} rounded-2xl p-5`}>
                  <p className={`text-3xl font-black font-mono mb-3 ${s.color} opacity-40`}>{s.step}</p>
                  <p className={`text-sm font-bold mb-2 ${s.color}`}>{s.title}</p>
                  <p className="text-xs text-[#7B8DB4] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Risk rules */}
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5 mb-6">
              <p className="text-sm font-semibold mb-4">5 rules to protect your money</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: "💰", rule: "Never risk more than 5–10% per trade", detail: "If you have $500, max $25–$50 per signal." },
                  { icon: "🛡️", rule: "Always set a stop-loss", detail: "4–5% below your buy price on Robinhood. Non-negotiable." },
                  { icon: "🧠", rule: "Understand before you act", detail: "Read the ICT analysis. Know why the signal fired." },
                  { icon: "⏳", rule: "Patience beats FOMO", detail: "Not every signal is worth taking. Wait for high confidence." },
                  { icon: "📓", rule: "Keep a trade journal", detail: "Note why you entered, what happened, what you learned." },
                  { icon: "⚠️", rule: "AI is not 100% right", detail: "No tool is. This is a starting point, not a guarantee." },
                ].map((r) => (
                  <div key={r.rule} className="flex gap-3 bg-[#060A14] border border-[#1C2333] rounded-xl p-3">
                    <span className="text-base shrink-0">{r.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-[#F1F5F9]">{r.rule}</p>
                      <p className="text-[11px] text-[#4B5675] mt-0.5">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Webull CTA */}
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-6">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5675] mb-2">Recommended Broker</p>
                  <p className="text-lg font-bold">Open a free Webull account</p>
                  <p className="text-sm text-[#7B8DB4] mt-1 leading-relaxed">
                    Commission-free trading, SIPC insured, and you get up to 12 free stocks just for signing up. Takes 5 minutes.
                  </p>
                  <div className="flex gap-4 mt-4 flex-wrap">
                    {["Commission-free", "SIPC insured", "Up to 12 free stocks", "5-min setup"].map((b) => (
                      <span key={b} className="flex items-center gap-1.5 text-xs text-[#7B8DB4]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />{b}
                      </span>
                    ))}
                  </div>
                </div>
                <a
                  href="https://a.webull.com/i/YOUR_AFFILIATE_CODE"
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="shrink-0 bg-emerald-500 hover:bg-emerald-400 transition-colors px-6 py-3 rounded-xl text-sm font-bold text-white shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  Open Free Account
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                  </svg>
                </a>
              </div>
              <p className="text-[10px] text-[#4B5675] mt-4 opacity-60">Affiliate link — we may earn a commission at no cost to you. Not financial advice.</p>
            </div>

            {/* Exchange CTA */}
            <div className="mt-4 rounded-2xl border border-[#1C2333] bg-gradient-to-r from-indigo-600/10 to-purple-600/10 p-6 flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h3 className="font-semibold">Explore all exchanges</h3>
                <p className="text-sm text-[#7B8DB4] mt-1">CBOE, CBOT, CME, KCBT, MGE, NYBOT &amp; NYMEX — instant AI analysis on every contract.</p>
              </div>
              <Link href="/explore" className="shrink-0 bg-indigo-600 hover:bg-indigo-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-semibold text-white">
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
