"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScanSnapshot, DayTrade } from "./AutoTrader";
import { getDayTrades, getLastScan } from "./AutoTrader";
import { getPortfolio, PORTFOLIO_UPDATED_EVENT, type Portfolio } from "../lib/trading";

function signalBadge(signal: string | null) {
  if (signal === "BUY")  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (signal === "SELL") return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
}

function signalBorderL(signal: string | null) {
  if (signal === "BUY")  return "border-l-emerald-500/40";
  if (signal === "SELL") return "border-l-rose-500/40";
  return "border-l-[#252345]";
}

function changeColor(v: number) {
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

const ACTION_STYLE: Record<string, string> = {
  bought:             "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  sold:               "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "insufficient-cash":"text-amber-400 bg-amber-500/10 border-amber-500/20",
  held:               "text-[#4B5675] bg-[#252345]/50 border-[#333368]",
  "no-position":      "text-[#4B5675] bg-[#252345]/50 border-[#333368]",
};
const ACTION_LABEL: Record<string, string> = {
  bought:             "BOUGHT",
  sold:               "SOLD",
  "insufficient-cash":"NO CASH",
  held:               "HELD",
  "no-position":      "—",
};

export default function LiveTradingRoom() {
  const [snapshot,   setSnapshot]   = useState<ScanSnapshot | null>(null);
  const [liveTrades, setLiveTrades] = useState<DayTrade[]>([]);
  const [portfolio,  setPortfolio]  = useState<Portfolio>({ cash: 0, holdings: [], trades: [], pendingOrders: [] });
  const [prices,     setPrices]     = useState<Record<string, number>>({});

  useEffect(() => {
    setSnapshot(getLastScan());
    setLiveTrades(getDayTrades());

    function onScan(e: Event) {
      setSnapshot((e as CustomEvent<ScanSnapshot>).detail);
      setLiveTrades(getDayTrades());
    }
    window.addEventListener("traxora-scan-complete", onScan);
    return () => window.removeEventListener("traxora-scan-complete", onScan);
  }, []);

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
  }, []);

  useEffect(() => {
    fetchPrices(portfolio.holdings);
    const id = setInterval(() => fetchPrices(portfolio.holdings), 5_000);
    return () => clearInterval(id);
  }, [portfolio.holdings, fetchPrices]);

  const unrealizedPL = useMemo(() =>
    portfolio.holdings.reduce((s, h) => {
      const p = prices[h.symbol];
      return p != null ? s + (p - h.avgPrice) * h.quantity : s;
    }, 0),
    [portfolio.holdings, prices],
  );

  if (!snapshot) return null;

  const sells      = liveTrades.filter(t => t.side === "SELL");
  const realizedPL = sells.reduce((s, t) => s + (t.pl ?? 0), 0);
  const wins       = sells.filter(t => (t.pl ?? 0) > 0).length;
  const winRate    = sells.length > 0 ? Math.round((wins / sells.length) * 100) : null;

  const buyCount  = snapshot.results.filter(r => r.signal === "BUY").length;
  const sellCount = snapshot.results.filter(r => r.signal === "SELL").length;
  const holdCount = snapshot.results.filter(r => r.signal === "HOLD").length;

  return (
    <section>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
            <h2 className="text-xl font-bold tracking-tight">Trading Room</h2>
          </div>
          <p className="text-xs text-[#7B8DB4]">
            AutoTrader scan — {snapshot.results.length} stocks · {buyCount} buy · {sellCount} sell · {holdCount} hold
          </p>
        </div>
        <p className="text-[11px] font-mono text-[#4B5675] shrink-0">
          Last scan · {new Date(snapshot.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* ── Day stats strip ── */}
      {(liveTrades.length > 0 || portfolio.holdings.length > 0) && (
        <div className={`grid gap-3 mb-5 ${portfolio.holdings.length > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {[
            { label: "Trades Today", value: liveTrades.length.toString(),                                   color: "text-emerald-400",  show: true },
            { label: "Realized P&L", value: `${realizedPL >= 0 ? "+" : ""}$${realizedPL.toFixed(2)}`,     color: realizedPL >= 0 ? "text-emerald-400" : "text-rose-400", show: liveTrades.length > 0 },
            { label: "Unrealized",   value: `${unrealizedPL >= 0 ? "+" : ""}$${unrealizedPL.toFixed(2)}`, color: unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400", show: portfolio.holdings.length > 0 },
            { label: "Win Rate",     value: winRate != null ? `${winRate}%` : "—",                         color: "text-amber-400",   show: liveTrades.length > 0 },
          ].filter(s => s.show).map(s => (
            <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-medium">{s.label}</p>
              <p className={`text-xl font-black font-mono mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Stock grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
        {snapshot.results.map(r => {
          const rangePct =
            r.low !== null && r.high !== null && r.high > r.low
              ? ((r.price - r.low) / (r.high - r.low)) * 100
              : null;
          const actionKey = r.actionTaken ?? "no-position";

          return (
            <Link
              key={r.symbol}
              href={`/analysis?symbol=${encodeURIComponent(r.symbol)}`}
              className={`group bg-[#13112A] rounded-2xl p-4 border border-l-2 hover:border-[#333368] hover:bg-[#1A1838] transition-colors border-[#252345] ${signalBorderL(r.signal)}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-sm tracking-tight">{r.short}</p>
                  <p className="text-[10px] text-[#4B5675] mt-px truncate max-w-[72px]">{r.name}</p>
                </div>
                {r.signal
                  ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg border ${signalBadge(r.signal)}`}>{r.signal}</span>
                  : <span className="text-[10px] text-[#4B5675]">—</span>}
              </div>

              {/* Price */}
              <p className="text-lg font-bold font-mono">
                {r.price > 0 ? `$${r.price.toFixed(2)}` : "—"}
              </p>
              <p className={`text-[11px] font-mono font-medium mt-0.5 ${r.price > 0 ? changeColor(r.dayChangePct) : "text-[#4B5675]"}`}>
                {r.price > 0 ? `${r.dayChangePct >= 0 ? "+" : ""}${r.dayChangePct.toFixed(2)}%` : "—"}
              </p>

              {/* Intraday range bar */}
              {r.low !== null && r.high !== null && r.high > r.low && (
                <div className="mt-3 mb-2">
                  <div className="relative h-1.5 bg-[#252345] rounded-full overflow-visible">
                    <div className="absolute inset-0 bg-gradient-to-r from-rose-500/30 via-amber-500/20 to-emerald-500/30 rounded-full" />
                    {rangePct !== null && (
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#13112A] shadow z-10 ${r.dayChangePct >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ left: `calc(${Math.min(92, Math.max(8, rangePct))}% - 5px)` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-[#4B5675] mt-1">
                    <span>${r.low.toFixed(0)}</span>
                    <span>${r.high.toFixed(0)}</span>
                  </div>
                </div>
              )}

              {/* Action + link */}
              <div className="flex items-center justify-between mt-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ACTION_STYLE[actionKey] ?? ACTION_STYLE["no-position"]}`}>
                  {ACTION_LABEL[actionKey] ?? "—"}
                </span>
                <span className="text-[9px] text-emerald-400 group-hover:text-emerald-300 transition-colors">→</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Activity feed ── */}
      {liveTrades.length > 0 && (
        <div className="mt-5 bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#252345]">
            <p className="text-xs font-semibold text-[#F1F5F9]">Today&apos;s Activity</p>
            <p className="text-[10px] text-[#4B5675]">
              {liveTrades.length} execution{liveTrades.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y divide-[#252345]">
            {liveTrades.slice(0, 10).map((t, i) => {
              const clean = t.symbol.replace(".US","").replace(".COMM","");
              const isBuy = t.side === "BUY";
              const time  = new Date(t.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${
                    isBuy ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                  }`}>{t.side}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[#F1F5F9]">{clean}</p>
                      <span className={`text-[8px] font-bold ${t.source === "signal" ? "text-teal-400" : "text-emerald-400"}`}>
                        {t.source === "signal" ? "⚡" : "🔍"}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#4B5675] font-mono">
                      {t.quantity}× ${t.price.toFixed(2)} · {time}
                    </p>
                  </div>
                  {t.pl != null && (
                    <p className={`text-xs font-mono font-bold shrink-0 ${t.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pl >= 0 ? "+" : ""}${t.pl.toFixed(2)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {liveTrades.length > 10 && (
            <div className="px-5 py-2.5 border-t border-[#252345] text-center">
              <p className="text-[10px] text-[#4B5675]">
                +{liveTrades.length - 10} more — open AutoTrader ▶ Day Recap for full log
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
