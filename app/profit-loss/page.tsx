"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import {
  getPortfolio,
  STARTING_BALANCE,
  PORTFOLIO_UPDATED_EVENT,
  type Portfolio,
} from "../lib/trading";

type PriceMap = Record<string, number>;

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

export default function ProfitLossPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: STARTING_BALANCE,
    holdings: [],
    trades: [],
    pendingOrders: [],
  });
  const [prices, setPrices] = useState<PriceMap>({});
  const [fetching, setFetching] = useState(false);
  const [ageMs, setAgeMs] = useState(0);
  const lastFetchRef = useRef<number>(Date.now());

  // Load portfolio and live-update on every trade
  useEffect(() => {
    const load = () => setPortfolio(getPortfolio());
    load();
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, load);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, load);
  }, []);

  // Fetch live prices for all current holdings in parallel
  const fetchPrices = useCallback(async (holdings: Portfolio["holdings"]) => {
    if (holdings.length === 0) { setPrices({}); return; }
    setFetching(true);
    const results = await Promise.allSettled(
      holdings.map(async (h) => {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(h.symbol)}`, { cache: "no-store" });
        const data = await res.json();
        return { symbol: h.symbol, price: typeof data.price === "number" ? data.price : null };
      }),
    );
    const map: PriceMap = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.price !== null) {
        map[r.value.symbol] = r.value.price;
      }
    }
    setPrices(map);
    lastFetchRef.current = Date.now();
    setAgeMs(0);
    setFetching(false);
  }, []);

  // Refresh prices every 5 s (API rate limit) whenever holdings change
  useEffect(() => {
    fetchPrices(portfolio.holdings);
    const id = setInterval(() => fetchPrices(portfolio.holdings), 5_000);
    return () => clearInterval(id);
  }, [portfolio.holdings, fetchPrices]);

  // Tick every 100 ms so the "age" counter looks live
  useEffect(() => {
    const id = setInterval(() => setAgeMs(Date.now() - lastFetchRef.current), 100);
    return () => clearInterval(id);
  }, []);

  // ── Calculations ─────────────────────────────────────────────────────────────

  const realizedPL = useMemo(() => fifoRealizedPL(portfolio.trades), [portfolio.trades]);

  const { unrealizedPL, marketValue, partialPrices } = useMemo(() => {
    let upl = 0;
    let mv  = 0;
    let partial = false;
    for (const h of portfolio.holdings) {
      const cur = prices[h.symbol];
      if (cur != null) {
        upl += (cur - h.avgPrice) * h.quantity;
        mv  += cur * h.quantity;
      } else {
        mv  += h.avgPrice * h.quantity; // fall back to cost
        partial = true;
      }
    }
    return { unrealizedPL: upl, marketValue: mv, partialPrices: partial };
  }, [portfolio.holdings, prices]);

  const totalValue = portfolio.cash + marketValue;
  const totalPL    = realizedPL + unrealizedPL;
  const isPos      = totalPL >= 0;
  const hasPos     = portfolio.holdings.length > 0;

  const ageSec  = Math.floor(ageMs / 1000);
  const ageMs10 = Math.floor((ageMs % 1000) / 100);   // tenths of a second

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">Profit / Loss</h1>
              <p className="text-[#7B8DB4] mt-1 text-sm">
                Live prices · realized + unrealized breakdown
              </p>
            </div>

            {/* Live price-age indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-colors ${
              fetching
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                : ageMs < 3_000
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-[#0C1017] border-[#1C2333] text-[#4B5675]"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${fetching ? "bg-indigo-400 animate-pulse" : ageMs < 3_000 ? "bg-emerald-400" : "bg-[#4B5675]"}`} />
              {fetching
                ? "updating prices…"
                : hasPos
                  ? `${ageSec}.${ageMs10}s ago`
                  : "no open positions"}
            </div>
          </div>

          {/* Hero P&L */}
          <div className={`mt-6 rounded-3xl p-8 border ${isPos ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5675] mb-2">
              Total P / L {hasPos ? "(realized + unrealized)" : "(realized)"}
            </p>
            <p className={`text-6xl font-black font-mono tabular-nums ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
              {isPos ? "+" : ""}${Math.abs(totalPL).toFixed(2)}
            </p>

            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
              <span className="text-[#4B5675]">
                Realized{" "}
                <span className={`font-bold font-mono ${realizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {realizedPL >= 0 ? "+" : ""}${realizedPL.toFixed(2)}
                </span>
              </span>
              <span className="text-[#1C2333]">·</span>
              <span className="text-[#4B5675]">
                Unrealized{" "}
                <span className={`font-bold font-mono ${unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}
                  {partialPrices && <span className="text-[#4B5675] font-normal"> *partial</span>}
                </span>
              </span>
            </div>

            <p className="text-[#7B8DB4] text-xs mt-3">
              Started{" "}
              <span className="text-[#F1F5F9] font-semibold">${STARTING_BALANCE.toLocaleString()}</span>
              {" "}· Portfolio value{" "}
              <span className="text-[#F1F5F9] font-semibold">${totalValue.toFixed(2)}</span>
              {" "}· Cash{" "}
              <span className="text-[#F1F5F9] font-semibold">${portfolio.cash.toFixed(2)}</span>
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
            {[
              {
                label: "Cash Balance",
                value: `$${portfolio.cash.toFixed(2)}`,
                color: "text-emerald-400",
                sub: null,
              },
              {
                label: "Portfolio Value",
                value: `$${totalValue.toFixed(2)}`,
                color: "text-indigo-400",
                sub: "at live market price",
              },
              {
                label: "Realized P&L",
                value: `${realizedPL >= 0 ? "+" : ""}$${realizedPL.toFixed(2)}`,
                color: realizedPL >= 0 ? "text-emerald-400" : "text-rose-400",
                sub: "closed trades, FIFO",
              },
              {
                label: "Unrealized P&L",
                value: `${unrealizedPL >= 0 ? "+" : ""}$${unrealizedPL.toFixed(2)}`,
                color: unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400",
                sub: "open positions, live",
              },
            ].map((s) => (
              <div key={s.label} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
                <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-2 font-mono tabular-nums ${s.color}`}>{s.value}</p>
                {s.sub && <p className="text-[10px] text-[#2D3A50] mt-1">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Per-holding unrealized breakdown */}
          {hasPos ? (
            <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1C2333] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Open Positions</h2>
                  <p className="text-[10px] text-[#4B5675] mt-0.5">Live price vs average cost basis</p>
                </div>
                <span className="text-[10px] text-[#4B5675] font-mono">
                  {portfolio.holdings.length} position{portfolio.holdings.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[#4B5675] text-[10px] uppercase tracking-widest font-semibold border-b border-[#1C2333]">
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Avg Cost</th>
                      <th className="px-4 py-3 text-right">Live Price</th>
                      <th className="px-4 py-3 text-right">Mkt Value</th>
                      <th className="px-4 py-3 text-right">Unrealized $</th>
                      <th className="px-4 py-3 text-right">Unrealized %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((h) => {
                      const cur    = prices[h.symbol] ?? null;
                      const upl    = cur !== null ? (cur - h.avgPrice) * h.quantity : null;
                      const uplPct = cur !== null ? ((cur - h.avgPrice) / h.avgPrice) * 100 : null;
                      const mv     = cur !== null ? cur * h.quantity : h.avgPrice * h.quantity;
                      const pos    = upl === null ? null : upl >= 0;
                      const clean  = h.symbol.replace(".US","").replace(".COMM","");

                      return (
                        <tr key={h.symbol} className="border-b border-[#1C2333] last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-4">
                            <span className="font-bold text-indigo-400">{clean}</span>
                            {h.stopLoss && (
                              <span className="ml-2 text-[9px] text-rose-400 font-mono">SL ${h.stopLoss.toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[#7B8DB4]">{h.quantity}</td>
                          <td className="px-4 py-4 text-right font-mono text-[#7B8DB4]">${h.avgPrice.toFixed(2)}</td>
                          <td className="px-4 py-4 text-right font-mono text-[#F1F5F9] tabular-nums">
                            {cur !== null ? (
                              <span className={pos === null ? "" : pos ? "text-emerald-400" : "text-rose-400"}>
                                ${cur.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-[#4B5675] animate-pulse">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[#F1F5F9] tabular-nums">
                            ${mv.toFixed(2)}
                          </td>
                          <td className={`px-4 py-4 text-right font-mono font-semibold tabular-nums ${
                            pos === null ? "text-[#4B5675]" : pos ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            {upl !== null ? `${upl >= 0 ? "+" : ""}$${upl.toFixed(2)}` : "—"}
                          </td>
                          <td className={`px-4 py-4 text-right font-mono tabular-nums ${
                            pos === null ? "text-[#4B5675]" : pos ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            {uplPct !== null ? `${uplPct >= 0 ? "+" : ""}${uplPct.toFixed(2)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t border-[#2D3A50] bg-[#060A14]/60">
                      <td className="px-4 py-3 text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold" colSpan={4}>Total</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#F1F5F9] tabular-nums">
                        ${marketValue.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {marketValue > 0
                          ? `${unrealizedPL >= 0 ? "+" : ""}${((unrealizedPL / (marketValue - unrealizedPL)) * 100).toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl p-10 text-center">
              <p className="text-4xl mb-3">📈</p>
              <p className="text-[#F1F5F9] font-semibold">No open positions</p>
              <p className="text-[#4B5675] text-sm mt-2 max-w-xs mx-auto">
                Buy shares from the Trade page. Unrealized P&L will appear here with live prices.
              </p>
            </div>
          )}

          <p className="text-[10px] text-[#2D3A50] mt-6 leading-relaxed">
            Prices refresh every 5 s. Realized P&L: FIFO cost matching on closed trades.
            Unrealized P&L: (live price − avg cost) × shares. Paper trading only.
          </p>
        </div>
      </main>
    </div>
  );
}
