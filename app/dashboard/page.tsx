"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

type StockCard = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
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

function signalColor(signal: string | null) {
  if (signal === "BUY")  return "bg-green-500/20 text-green-400 border-green-500/30";
  if (signal === "SELL") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

function fireNotification(symbol: string, name: string, signal: "BUY" | "SELL", price: number) {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;

  const emoji = signal === "BUY" ? "🟢" : "🔴";
  const action = signal === "BUY" ? "Buy opportunity detected" : "Sell signal detected";

  const notif = new Notification(`${emoji} Kairos AI — ${signal}: ${symbol.replace(".US","").replace(".COMM","")}`, {
    body: `${name} · $${price.toFixed(2)}\n${action} — tap to open analysis`,
    icon: "/icon-192.png",
    tag: `signal-${symbol}`,
  });

  notif.onclick = () => {
    window.focus();
    window.location.href = `/analysis?symbol=${encodeURIComponent(symbol)}`;
    notif.close();
  };

  // Save to localStorage for Notifications page history
  const key = "kairos_alerts";
  const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
  existing.unshift({
    symbol,
    name,
    signal,
    price,
    time: Date.now(),
  });
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
}

export default function DashboardPage() {
  const [stocks, setStocks] = useState<StockCard[]>(
    WATCHLIST.map((w) => ({ ...w, price: null, change: null, signal: null, loading: true }))
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const prevSignals = useRef<Record<string, string>>({});

  // Sync permission state
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

  useEffect(() => {
    WATCHLIST.forEach(async ({ symbol, name }, i) => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();

        const price = data?.price ?? null;
        const prev  = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;

        setStocks((prev) =>
          prev.map((s, idx) => idx === i ? { ...s, price, change, loading: false } : s)
        );

        if (price && prev) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol, price,
              previousClose: prev,
              open: data?.open,
              high: data?.high,
              low: data?.low,
              dayChangePercent: change,
            }),
          });

          const analysis = await analyzeRes.json();
          const signal: "BUY" | "HOLD" | "SELL" | null = analysis?.signal ?? null;

          setStocks((prev) =>
            prev.map((s, idx) => idx === i ? { ...s, signal } : s)
          );

          // Fire notification only on BUY/SELL and only when signal changes
          if (signal && signal !== "HOLD" && signal !== prevSignals.current[symbol] && price) {
            fireNotification(symbol, name, signal, price);
          }
          if (signal) prevSignals.current[symbol] = signal;
        }
      } catch {
        setStocks((prev) =>
          prev.map((s, idx) => idx === i ? { ...s, loading: false } : s)
        );
      }
    });
  }, []);

  const buyCount  = stocks.filter((s) => s.signal === "BUY").length;
  const sellCount = stocks.filter((s) => s.signal === "SELL").length;
  const sentiment = buyCount > sellCount ? "Bullish" : sellCount > buyCount ? "Bearish" : "Neutral";
  const sentimentColor =
    sentiment === "Bullish" ? "text-green-400" :
    sentiment === "Bearish" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6 xl:p-8">
        <Topbar />

        <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Investment Dashboard</h1>
            <p className="text-gray-400 mt-2">AI-powered signals to help you decide where to invest.</p>
          </div>

          {/* Alert permission button */}
          {notifPermission === "default" && (
            <button
              type="button"
              onClick={requestNotifications}
              className="flex items-center gap-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
            >
              🔔 Enable Signal Alerts
            </button>
          )}
          {notifPermission === "granted" && (
            <span className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-2.5 rounded-xl text-sm font-medium">
              🔔 Alerts On
            </span>
          )}
          {notifPermission === "denied" && (
            <span className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm font-medium">
              🔕 Alerts Blocked — enable in browser settings
            </span>
          )}
        </div>

        {/* Market Sentiment Banner */}
        <div className="mt-6 bg-[#111827] rounded-2xl p-5 border border-[#1F2937] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Overall Market Sentiment</p>
            <p className={`text-3xl font-bold mt-1 ${sentimentColor}`}>{sentiment}</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-green-400">{buyCount}</p>
              <p className="text-xs text-gray-500 mt-1">Buy Signals</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">
                {stocks.filter((s) => s.signal === "HOLD").length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Hold Signals</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{sellCount}</p>
              <p className="text-xs text-gray-500 mt-1">Sell Signals</p>
            </div>
          </div>
        </div>

        {/* Stock Grid */}
        <div className="mt-6">
          <h2 className="text-2xl font-semibold mb-4">Market Watchlist</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
            {stocks.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/analysis?symbol=${encodeURIComponent(stock.symbol)}`}
                className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937] hover:border-blue-500/50 transition block"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-white">
                      {stock.symbol.replace(".US", "").replace(".COMM", "")}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]">{stock.name}</p>
                  </div>
                  {stock.signal && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${signalColor(stock.signal)}`}>
                      {stock.signal}
                    </span>
                  )}
                  {!stock.signal && !stock.loading && (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg border bg-gray-500/20 text-gray-400 border-gray-500/30">
                      —
                    </span>
                  )}
                  {stock.loading && (
                    <span className="text-xs text-gray-500 animate-pulse">Loading…</span>
                  )}
                </div>

                <p className="text-2xl font-bold">
                  {stock.price !== null ? `$${stock.price.toFixed(2)}` : "—"}
                </p>
                <p className={`text-sm mt-1 font-medium ${
                  stock.change === null ? "text-gray-500" :
                  stock.change >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {stock.change !== null
                    ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% today`
                    : "—"}
                </p>

                <p className="text-xs text-blue-400 mt-3">View analysis →</p>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-6 border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-1">Explore any market</h3>
          <p className="text-gray-400 text-sm mb-4">
            Browse stocks, futures, and commodities across 7 major exchanges with instant AI analysis.
          </p>
          <Link
            href="/explore"
            className="inline-block bg-blue-600 hover:bg-blue-500 transition px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Open Explorer →
          </Link>
        </div>
      </main>
    </div>
  );
}
