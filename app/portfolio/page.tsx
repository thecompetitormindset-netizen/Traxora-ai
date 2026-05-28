"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, STARTING_BALANCE, PORTFOLIO_UPDATED_EVENT, type Portfolio, type Trade } from "../lib/trading";

const PortfolioChart = dynamic(() => import("../components/PortfolioChart"), { ssr: false });

function calcWinRate(trades: Trade[]) {
  // Process oldest → newest so BUYs are seen before their matching SELLs
  const buys: Record<string, number[]> = {};
  let wins = 0, losses = 0;

  for (const t of [...trades].reverse()) {
    if (t.side === "BUY") {
      if (!buys[t.symbol]) buys[t.symbol] = [];
      buys[t.symbol].push(t.price);
    } else {
      const buyPrices = buys[t.symbol];
      if (buyPrices && buyPrices.length > 0) {
        const avgBuy = buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length;
        if (t.price > avgBuy) wins++;
        else losses++;
      }
    }
  }
  const total = wins + losses;
  return { wins, losses, total, pct: total > 0 ? Math.round((wins / total) * 100) : null };
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: STARTING_BALANCE,
    holdings: [],
    trades: [],
    pendingOrders: [],
  });
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = () => setPortfolio(getPortfolio());
    load();
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, load);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, load);
  }, []);

  const fetchPrices = useCallback(async (holdings: Portfolio["holdings"]) => {
    if (document.hidden) return; // skip while tab is hidden
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

  const totalShares = useMemo(
    () => portfolio.holdings.reduce((s, h) => s + h.quantity, 0),
    [portfolio.holdings],
  );

  const investedValue = useMemo(
    () => portfolio.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0),
    [portfolio.holdings],
  );

  // Market value uses live prices where available, falls back to cost
  const marketValue = useMemo(
    () => portfolio.holdings.reduce((s, h) => s + h.quantity * (prices[h.symbol] ?? h.avgPrice), 0),
    [portfolio.holdings, prices],
  );

  const unrealizedPL = useMemo(
    () => portfolio.holdings.reduce((s, h) => {
      const p = prices[h.symbol];
      return p != null ? s + (p - h.avgPrice) * h.quantity : s;
    }, 0),
    [portfolio.holdings, prices],
  );

  const totalAccountValue = portfolio.cash + marketValue;
  const totalPL = totalAccountValue - STARTING_BALANCE;
  const winRate = useMemo(() => calcWinRate(portfolio.trades), [portfolio.trades]);

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-4xl mx-auto w-full">

          <div className="mt-6">
            <h1 className="text-4xl font-bold">Portfolio</h1>
            <p className="text-[#7B8DB4] mt-2">Your cash balance, holdings, and paper trading performance.</p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
            {[
              { label: "Cash Balance",    value: `$${portfolio.cash.toFixed(2)}`,                                              color: "text-emerald-400", sub: `${totalShares} share${totalShares !== 1 ? "s" : ""} held` },
              { label: "Account Value",   value: `$${totalAccountValue.toFixed(2)}`,                                           color: "text-teal-400",  sub: "at live market price" },
              { label: "Total P / L",     value: `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`,                          color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400", sub: "realized + unrealized" },
              { label: "Unrealized P&L",  value: `${unrealizedPL >= 0 ? "+" : ""}$${unrealizedPL.toFixed(2)}`,               color: unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400", sub: "open positions, live" },
            ].map((s) => (
              <div key={s.label} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
                <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-2 font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[#2D3A50] mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Win rate banner — only show once there are closed trades */}
          {winRate.total > 0 && (
            <div className={`mt-4 rounded-2xl p-5 border flex items-center gap-5 flex-wrap ${
              winRate.pct! >= 60
                ? "bg-emerald-500/5 border-emerald-500/20"
                : winRate.pct! >= 40
                ? "bg-amber-500/5 border-amber-500/20"
                : "bg-rose-500/5 border-rose-500/20"
            }`}>
              <div className="text-center min-w-[70px]">
                <p className={`text-3xl font-black font-mono ${
                  winRate.pct! >= 60 ? "text-emerald-400" : winRate.pct! >= 40 ? "text-amber-400" : "text-rose-400"
                }`}>
                  {winRate.pct}%
                </p>
                <p className="text-[10px] text-[#4B5675] uppercase tracking-wide mt-0.5">Win Rate</p>
              </div>
              <div className="w-px h-10 bg-[#1C2333] hidden sm:block" />
              <div className="flex gap-6">
                <div>
                  <p className="text-lg font-black text-emerald-400">{winRate.wins}</p>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">Wins</p>
                </div>
                <div>
                  <p className="text-lg font-black text-rose-400">{winRate.losses}</p>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">Losses</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#F1F5F9]">{winRate.total}</p>
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">Closed</p>
                </div>
              </div>
              <p className="text-xs text-[#4B5675] ml-auto hidden lg:block">
                {winRate.pct! >= 60
                  ? "Strong performance — consider moving to live trading"
                  : winRate.pct! >= 40
                  ? "Getting there — keep paper trading to sharpen your edge"
                  : "Keep practicing — ICT signals improve with experience"}
              </p>
            </div>
          )}

          {/* Portfolio equity curve */}
          <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C2333]">
              <div>
                <h2 className="text-sm font-semibold text-[#F1F5F9]">Portfolio Equity Curve</h2>
                <p className="text-[10px] text-[#4B5675] mt-0.5">
                  Account value after each trade · starting ${STARTING_BALANCE.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-black font-mono ${totalPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}
                </p>
                <p className="text-[10px] text-[#4B5675]">Total P&amp;L (live)</p>
              </div>
            </div>
            <div className="px-4 pb-4 pt-2">
              <PortfolioChart />
            </div>
          </div>

          {/* Holdings */}
          <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Holdings</h2>
              <p className="text-[#7B8DB4] text-sm mt-1">
                Invested: <span className="text-[#F1F5F9] font-semibold font-mono">${investedValue.toFixed(2)}</span>
                {" · "}{portfolio.holdings.length} position{portfolio.holdings.length !== 1 ? "s" : ""}
              </p>
            </div>

            {portfolio.holdings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#4B5675] text-sm">No holdings yet.</p>
                <p className="text-[#4B5675] text-xs mt-1 opacity-70">Buy shares from the Market or Practice page.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[#4B5675] text-[10px] uppercase tracking-widest border-b border-[#1C2333] font-semibold">
                      <th className="px-1 py-3">Symbol</th>
                      <th className="px-1 py-3">Qty</th>
                      <th className="px-1 py-3">Avg Cost</th>
                      <th className="px-1 py-3">Live Price</th>
                      <th className="px-1 py-3">Mkt Value</th>
                      <th className="px-1 py-3">Unrealized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((h) => {
                      const cur = prices[h.symbol] ?? null;
                      const upl = cur !== null ? (cur - h.avgPrice) * h.quantity : null;
                      const mv  = cur !== null ? cur * h.quantity : h.avgPrice * h.quantity;
                      const pos = upl === null ? null : upl >= 0;
                      return (
                        <tr key={h.symbol} className="border-b border-[#1C2333] last:border-0">
                          <td className="px-1 py-4 font-bold text-emerald-400">{h.symbol.replace(".US","").replace(".COMM","")}</td>
                          <td className="px-1 py-4 font-mono text-[#7B8DB4]">{h.quantity}</td>
                          <td className="px-1 py-4 font-mono text-[#7B8DB4]">${h.avgPrice.toFixed(2)}</td>
                          <td className={`px-1 py-4 font-mono ${pos === null ? "text-[#4B5675] animate-pulse" : pos ? "text-emerald-400" : "text-rose-400"}`}>
                            {cur !== null ? `$${cur.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-1 py-4 font-mono font-semibold text-[#F1F5F9]">${mv.toFixed(2)}</td>
                          <td className={`px-1 py-4 font-mono font-semibold ${pos === null ? "text-[#4B5675]" : pos ? "text-emerald-400" : "text-rose-400"}`}>
                            {upl !== null ? `${upl >= 0 ? "+" : ""}$${upl.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
