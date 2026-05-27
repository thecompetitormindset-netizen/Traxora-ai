"use client";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import {
  buyStock, sellStock, placeLimitOrder, cancelOrder, checkPriceEvents,
  getPortfolio, STARTING_BALANCE, type Portfolio, type OrderType,
} from "../lib/trading";
import { getJournal, type JournalEntry } from "../components/AutoJournal";
import StockChart from "../components/StockChart";

type QuoteData = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
};

const QUICK_PICKS = [
  { sym: "AAPL",  label: "AAPL" },
  { sym: "NVDA",  label: "NVDA" },
  { sym: "TSLA",  label: "TSLA" },
  { sym: "MSFT",  label: "MSFT" },
  { sym: "META",  label: "META" },
  { sym: "AMZN",  label: "AMZN" },
  { sym: "SPY",   label: "SPY"  },
  { sym: "QQQ",   label: "QQQ"  },
];

export default function PaperTradingPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({ cash: STARTING_BALANCE, holdings: [], trades: [], pendingOrders: [] });
  const [symbol, setSymbol]       = useState("AAPL");
  const [inputSymbol, setInputSymbol] = useState("AAPL");
  const [quote, setQuote]         = useState<QuoteData | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quantity, setQuantity]   = useState(1);
  const [side, setSide]           = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice]   = useState("");
  const [stopLossPrice,   setStopLossPrice]   = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [message, setMessage]     = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [activeTab, setActiveTab] = useState<"trade" | "holdings" | "orders" | "history" | "journal">("trade");
  const [journal,    setJournal]   = useState<JournalEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { setPortfolio(getPortfolio()); }, []);

  useEffect(() => {
    const load = () => setJournal(getJournal());
    load();
    window.addEventListener("journal-updated", load);
    return () => window.removeEventListener("journal-updated", load);
  }, []);

  useEffect(() => {
    let active = true;
    async function load(initial = false) {
      if (initial) { setLoadingQuote(true); setQuote(null); }
      try {
        const s = symbol.includes(".") ? symbol : `${symbol}.US`;
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}`);
        const data = await res.json();
        if (!active || !data?.price) return;
        setQuote({ symbol: s, price: data.price, previousClose: data.previousClose ?? null, open: data.open ?? null, high: data.high ?? null, low: data.low ?? null });
      } catch { /* ignore */ }
      finally { if (active && initial) setLoadingQuote(false); }
    }
    load(true);
    // Poll every 10s so stop losses and take profits actually trigger
    const interval = setInterval(() => load(false), 10_000);
    return () => { active = false; clearInterval(interval); };
  }, [symbol]);

  // Check stop losses + limit orders whenever price refreshes
  useEffect(() => {
    if (!quote?.price || !quote?.symbol) return;
    const { messages, portfolio: updated } = checkPriceEvents(quote.symbol, quote.price);
    if (messages.length > 0) {
      setPortfolio(updated);
      const m = messages[0];
      setMessage({ text: m, type: m.startsWith("⚠️") ? "error" : "success" });
    }
  }, [quote?.price, quote?.symbol]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const s = inputSymbol.trim().toUpperCase();
    if (!s) return;
    setSymbol(s.includes(".") ? s : s);
  }

  function handleTrade() {
    const price = quote?.price;
    if (!price) { setMessage({ text: "No price available — wait for data to load.", type: "error" }); return; }
    if (quantity <= 0) { setMessage({ text: "Quantity must be at least 1.", type: "error" }); return; }

    const stopP = stopLossPrice.trim()   ? parseFloat(stopLossPrice)   : undefined;
    const tpP   = takeProfitPrice.trim() ? parseFloat(takeProfitPrice) : undefined;
    const sym = quote?.symbol ?? (symbol.includes(".") ? symbol : `${symbol}.US`);

    if (orderType === "limit") {
      const limP = parseFloat(limitPrice);
      if (isNaN(limP) || limP <= 0) { setMessage({ text: "Enter a valid limit price.", type: "error" }); return; }
      if (side === "BUY" && stopP != null && stopP >= limP) { setMessage({ text: "Stop loss must be below your limit price.", type: "error" }); return; }
      if (side === "BUY" && tpP  != null && tpP  <= limP) { setMessage({ text: "Take profit must be above your limit price.", type: "error" }); return; }
      if (side === "SELL" && stopP != null && stopP <= limP) { setMessage({ text: "Stop loss must be above your limit price for a short.", type: "error" }); return; }
      try {
        const updated = placeLimitOrder(sym, side, quantity, limP, { stopLoss: stopP, takeProfit: tpP });
        setPortfolio(updated);
        setMessage({ text: `Limit order queued — fills when ${sym.replace(".US","").replace(".COMM","")} ${side === "BUY" ? "drops to" : "rises to"} $${limP.toFixed(2)}`, type: "info" });
        setActiveTab("orders");
      } catch (err) {
        setMessage({ text: err instanceof Error ? err.message : "Order failed.", type: "error" });
      }
      return;
    }

    // Market order
    if (side === "BUY" && stopP != null && stopP >= price) { setMessage({ text: "Stop loss must be below current price.", type: "error" }); return; }
    if (side === "BUY" && tpP  != null && tpP  <= price) { setMessage({ text: "Take profit must be above current price.", type: "error" }); return; }
    try {
      const updated = side === "BUY"
        ? buyStock(sym, quantity, price, { stopLoss: stopP, takeProfit: tpP })
        : sellStock(sym, quantity, price);
      setPortfolio(updated);
      const extras = [
        stopP ? `SL $${stopP.toFixed(2)}` : "",
        tpP   ? `TP $${tpP.toFixed(2)}`   : "",
      ].filter(Boolean).join(" · ");
      setMessage({
        text: `${side === "BUY" ? "✓ Bought" : "✓ Sold"} ${quantity} × ${sym.replace(".US","").replace(".COMM","")} @ $${price.toFixed(2)}${extras ? ` · ${extras}` : ""}`,
        type: "success",
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Trade failed.", type: "error" });
    }
  }

  const price = quote?.price ?? null;
  const prevClose = quote?.previousClose ?? null;
  const dayChangePct = price && prevClose && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
  const effectivePrice = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : (price ?? 0);
  const estimatedTotal = effectivePrice > 0 ? effectivePrice * quantity : null;
  const investedValue = portfolio.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
  const totalValue = portfolio.cash + investedValue;
  const totalPL = totalValue - STARTING_BALANCE;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-2xl mx-auto mt-6 space-y-5">

          {/* Header */}
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-400 mb-2">Paper Trading Simulator</p>
            <h1 className="text-3xl font-black tracking-tight">Practice without risk</h1>
            <p className="text-[#7B8DB4] text-sm mt-2 max-w-sm mx-auto">
              Market orders, limit orders, and stop losses — all with virtual money and live prices.
            </p>
          </div>

          {/* Portfolio summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Cash",      value: `$${portfolio.cash.toFixed(2)}`,       color: "text-emerald-400" },
              { label: "Portfolio", value: `$${totalValue.toFixed(2)}`,            color: "text-indigo-400"  },
              { label: "P / L",     value: `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`, color: totalPL >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map((s) => (
              <div key={s.label} className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-4 text-center">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-semibold">{s.label}</p>
                <p className={`text-lg font-black mt-1 font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap gap-2 justify-center">
            {QUICK_PICKS.map((q) => (
              <button key={q.sym} type="button"
                onClick={() => { setSymbol(q.sym); setInputSymbol(q.sym); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  symbol === q.sym
                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                    : "bg-[#0C1017] border-[#1C2333] text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#2D3A50]"
                }`}>{q.label}</button>
            ))}
          </div>

          {/* Symbol search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input type="text" value={inputSymbol}
              onChange={(e) => setInputSymbol(e.target.value)}
              placeholder="AAPL · NVDA · MSFT · SPY"
              className="flex-1 bg-[#0C1017] border border-[#1C2333] focus:border-indigo-500/50 rounded-xl px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#4B5675] outline-none transition"
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 transition px-5 py-3 rounded-xl text-sm font-bold">
              Load
            </button>
          </form>

          {/* Price card */}
          <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-lg font-black text-[#F1F5F9]">{symbol.replace(".US","").replace(".COMM","")}</p>
                <p className="text-xs text-[#4B5675] mt-0.5">Live market price</p>
              </div>
              <div className="text-right">
                {loadingQuote ? <p className="text-2xl font-black text-[#4B5675] animate-pulse">—</p>
                  : price ? (
                    <>
                      <p className="text-2xl font-black font-mono text-[#F1F5F9]">${price.toFixed(2)}</p>
                      {dayChangePct !== null && (
                        <p className={`text-xs font-semibold mt-0.5 ${dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}% today
                        </p>
                      )}
                    </>
                  ) : <p className="text-sm text-[#4B5675]">No data</p>
                }
              </div>
            </div>
            {quote && (
              <div className="grid grid-cols-3 gap-2 py-3 border-t border-[#1C2333]">
                {[{ l: "Open", v: quote.open }, { l: "High", v: quote.high }, { l: "Low", v: quote.low }].map((x) => (
                  <div key={x.l} className="text-center">
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">{x.l}</p>
                    <p className="text-sm font-mono font-semibold text-[#F1F5F9] mt-0.5">{x.v ? `$${x.v.toFixed(2)}` : "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chart */}
          <StockChart symbol={symbol.includes(".") ? symbol : `${symbol}.US`} height={420} />

          {/* Trade panel */}
          <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675]">Execute Paper Trade</p>

            {/* BUY / SELL */}
            <div className="grid grid-cols-2 gap-2">
              {(["BUY","SELL"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSide(s)}
                  className={`py-3 rounded-xl font-bold text-sm transition-all ${
                    side === s
                      ? s === "BUY" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "bg-rose-600 text-white shadow-lg shadow-rose-500/20"
                      : "bg-[#060A14]/60 border border-[#1C2333] text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#2D3A50]"
                  }`}>{s}
                </button>
              ))}
            </div>

            {/* Order type */}
            <div>
              <label className="text-xs text-[#4B5675] font-semibold uppercase tracking-wide block mb-2">Order Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["market","limit"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setOrderType(t)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all capitalize ${
                      orderType === t
                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                        : "bg-[#060A14]/60 border-[#1C2333] text-[#4B5675] hover:text-[#F1F5F9]"
                    }`}>{t} Order
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs text-[#4B5675] font-semibold uppercase tracking-wide block mb-2">Quantity (shares)</label>
              <input type="number" min="1" value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                placeholder="1"
                className="w-full bg-[#060A14]/60 border border-[#1C2333] focus:border-indigo-500/50 rounded-xl px-4 py-3 text-[#F1F5F9] outline-none text-sm font-mono transition"
              />
            </div>

            {/* Limit price (only for limit orders) */}
            {orderType === "limit" && (
              <div>
                <label className="text-xs text-[#4B5675] font-semibold uppercase tracking-wide block mb-2">
                  Limit Price — {side === "BUY" ? "fills when price drops to or below" : "fills when price rises to or above"}
                </label>
                <input type="number" step="0.01" min="0.01" value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={price ? `e.g. $${(price * (side === "BUY" ? 0.98 : 1.02)).toFixed(2)}` : "0.00"}
                  className="w-full bg-[#060A14]/60 border border-indigo-500/30 focus:border-indigo-500/60 rounded-xl px-4 py-3 text-[#F1F5F9] outline-none text-sm font-mono transition"
                />
              </div>
            )}

            {/* Stop loss + Take profit (for BUY orders) */}
            {side === "BUY" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-rose-400 font-semibold uppercase tracking-wide block mb-2">
                    Stop Loss <span className="text-[#4B5675] normal-case font-normal">(auto-sell if drops)</span>
                  </label>
                  <input type="number" step="0.01" min="0.01" value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(e.target.value)}
                    placeholder={price ? `$${(price * 0.95).toFixed(2)} (-5%)` : "0.00"}
                    className="w-full bg-[#060A14]/60 border border-rose-500/30 focus:border-rose-500/50 rounded-xl px-3 py-3 text-[#F1F5F9] outline-none text-sm font-mono transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-400 font-semibold uppercase tracking-wide block mb-2">
                    Take Profit <span className="text-[#4B5675] normal-case font-normal">(auto-sell if rises)</span>
                  </label>
                  <input type="number" step="0.01" min="0.01" value={takeProfitPrice}
                    onChange={(e) => setTakeProfitPrice(e.target.value)}
                    placeholder={price ? `$${(price * 1.10).toFixed(2)} (+10%)` : "0.00"}
                    className="w-full bg-[#060A14]/60 border border-emerald-500/30 focus:border-emerald-500/50 rounded-xl px-3 py-3 text-[#F1F5F9] outline-none text-sm font-mono transition"
                  />
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-[#060A14]/60 border border-[#1C2333] rounded-xl p-4 space-y-2">
              {orderType === "limit" && limitPrice && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#4B5675]">Limit price</span>
                  <span className="font-mono text-indigo-400">${parseFloat(limitPrice).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#4B5675]">{orderType === "limit" ? "Est. fill value" : "Estimated total"}</span>
                <span className="font-mono font-bold text-[#F1F5F9]">{estimatedTotal ? `$${estimatedTotal.toFixed(2)}` : "—"}</span>
              </div>
              {stopLossPrice && side === "BUY" && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#4B5675]">Stop loss</span>
                  <span className="font-mono text-rose-400">${parseFloat(stopLossPrice || "0").toFixed(2)}</span>
                </div>
              )}
              {takeProfitPrice && side === "BUY" && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#4B5675]">Take profit</span>
                  <span className="font-mono text-emerald-400">${parseFloat(takeProfitPrice || "0").toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#4B5675]">Available cash</span>
                <span className={`font-mono font-semibold ${estimatedTotal && side === "BUY" && estimatedTotal > portfolio.cash ? "text-rose-400" : "text-emerald-400"}`}>
                  ${portfolio.cash.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Execute */}
            <button type="button" onClick={handleTrade} disabled={!price}
              className={`w-full py-4 rounded-xl font-black text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                side === "BUY"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20 hover:scale-[1.02] active:scale-95"
              }`}>
              {orderType === "limit" ? "Place Limit Order" : `${side} ${quantity} share${quantity !== 1 ? "s" : ""}`} · Paper Trade
            </button>

            {message && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${
                message.type === "success" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : message.type === "error" ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
              }`}>{message.text}</div>
            )}
          </div>

          {/* Tabs */}
          {(() => {
            const symbolBase = symbol.replace(".US","").replace(".COMM","");
            const symJournal = journal.filter(e => e.symbol.replace(".US","").replace(".COMM","") === symbolBase);
            return (
              <div className="flex gap-1 bg-[#0C1017] border border-[#1C2333] rounded-xl p-1 flex-wrap">
                {(["trade","holdings","orders","history","journal"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold capitalize transition-all min-w-[60px] ${
                      activeTab === tab ? "bg-indigo-600 text-white" : "text-[#4B5675] hover:text-[#F1F5F9]"
                    }`}>
                    {tab === "holdings" ? `Holdings (${portfolio.holdings.length})`
                      : tab === "orders" ? `Orders (${portfolio.pendingOrders.length})`
                      : tab === "history" ? `History (${portfolio.trades.length})`
                      : tab === "journal" ? `Journal (${symJournal.length})`
                      : "Guide"}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Tab content */}
          {activeTab === "trade" && (
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675]">How order types work</p>
              {[
                { icon: "⚡", title: "Market Order", desc: "Executes immediately at the current price. Use when you want in right now." },
                { icon: "🎯", title: "Limit Order", desc: "Only fills when price reaches your target. BUY limit fills when price drops to or below your limit. SELL limit fills when price rises to or above." },
                { icon: "🛡️", title: "Stop Loss", desc: "Set a floor price for BUY positions. If the price drops to your stop, the position is automatically sold to limit your loss." },
                { icon: "📊", title: "Morning Brief", desc: "Each morning brief gives you entry zone, stop loss, and take profit for every signal. Use those levels directly here." },
              ].map((s) => (
                <div key={s.title} className="flex gap-3 items-start py-2 border-b border-[#1C2333] last:border-0">
                  <span className="text-xl shrink-0">{s.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-[#F1F5F9]">{s.title}</p>
                    <p className="text-xs text-[#7B8DB4] mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "holdings" && (
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
              {portfolio.holdings.length === 0 ? (
                <div className="p-8 text-center"><p className="text-3xl mb-3">📭</p><p className="text-[#4B5675] text-sm">No holdings yet.</p></div>
              ) : (
                <>
                  <div className="grid grid-cols-5 text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold px-5 py-3 border-b border-[#1C2333]">
                    <span>Symbol</span><span className="text-center">Qty</span><span className="text-center">Avg</span><span className="text-center">Stop</span><span className="text-right">Value</span>
                  </div>
                  <div className="divide-y divide-[#1C2333]">
                    {portfolio.holdings.map((h) => (
                      <div key={h.symbol} className="grid grid-cols-5 px-5 py-3.5 items-center">
                        <span className="font-bold text-indigo-400 text-sm">{h.symbol.replace(".US","").replace(".COMM","")}</span>
                        <span className="text-center font-mono text-[#7B8DB4] text-sm">{h.quantity}</span>
                        <span className="text-center font-mono text-[#7B8DB4] text-sm">${h.avgPrice.toFixed(2)}</span>
                        <span className="text-center font-mono text-sm">
                          {h.stopLoss ? <span className="text-rose-400">${h.stopLoss.toFixed(2)}</span> : <span className="text-[#4B5675]">—</span>}
                        </span>
                        <span className="text-right font-mono font-bold text-[#F1F5F9] text-sm">${(h.quantity * h.avgPrice).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "orders" && (
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
              {portfolio.pendingOrders.length === 0 ? (
                <div className="p-8 text-center"><p className="text-3xl mb-3">📋</p><p className="text-[#4B5675] text-sm">No pending limit orders.</p><p className="text-[#4B5675] text-xs mt-1 opacity-60">Place a limit order above to see it here.</p></div>
              ) : (
                <div className="divide-y divide-[#1C2333]">
                  {portfolio.pendingOrders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 px-5 py-4">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                        o.side === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}>{o.side}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#F1F5F9]">{o.symbol.replace(".US","").replace(".COMM","")}</p>
                        <p className="text-[10px] text-[#4B5675]">
                          {o.quantity} shares · Limit ${o.limitPrice.toFixed(2)}{o.stopLoss ? ` · Stop $${o.stopLoss.toFixed(2)}` : ""} · {new Date(o.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <button type="button" onClick={() => { setPortfolio(cancelOrder(o.id)); }}
                        className="text-xs text-[#4B5675] hover:text-rose-400 transition-colors font-medium">
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
              {portfolio.trades.length === 0 ? (
                <div className="p-8 text-center"><p className="text-3xl mb-3">📋</p><p className="text-[#4B5675] text-sm">No trades yet.</p></div>
              ) : (
                <div className="divide-y divide-[#1C2333] max-h-[400px] overflow-y-auto">
                  {portfolio.trades.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                        t.side === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}>{t.side}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#F1F5F9]">{t.symbol.replace(".US","").replace(".COMM","")}</p>
                        <p className="text-[10px] text-[#4B5675]">
                          {t.orderType ?? "market"}{t.autoClose ? " · auto stop" : ""}{t.briefSignal ? " · from brief" : ""} · {new Date(t.time).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-bold text-[#F1F5F9]">${(t.quantity * t.price).toFixed(2)}</p>
                        <p className="text-[10px] text-[#4B5675]">{t.quantity} × ${t.price.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Journal tab — ICT analysis for this symbol */}
          {activeTab === "journal" && (() => {
            const symbolBase = symbol.replace(".US","").replace(".COMM","");
            const symJournal = journal.filter(e => e.symbol.replace(".US","").replace(".COMM","") === symbolBase);

            const ICT_META: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
              OB:   { label: "Order Block",          color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  desc: "Last opposing candle before a strong impulse — institutional order origin zone." },
              FVG:  { label: "Fair Value Gap",        color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   desc: "Price imbalance where orders went unfilled — price is magnetically drawn back to fill it." },
              LIQ:  { label: "Liquidity Sweep",       color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", desc: "Stop clusters above highs or below lows swept by institutions to fill large orders." },
              MSS:  { label: "Market Structure Shift",color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/20",   desc: "Trend reversal confirmed by breaking a key swing high or low — marks the bias change." },
              OTE:  { label: "Optimal Trade Entry",   color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20", desc: "62–79% Fibonacci retracement of a swing — the highest-probability pullback entry zone." },
              PD:   { label: "Premium / Discount",    color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/20",desc: "Above the 50% midpoint = premium (sell zone). Below = discount (buy zone)." },
              BRK:  { label: "Breaker Block",         color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", desc: "Failed OB that has been breached — flips polarity and becomes strong support/resistance." },
              PO3:  { label: "Power of Three",        color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/20",   desc: "Accumulation → Manipulation (Judas swing) → Distribution — institutional 3-phase cycle." },
              KZ:   { label: "Kill Zone",             color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", desc: "London Open (2–5 AM ET) and NY Open (7–10 AM ET) — highest-probability ICT time windows." },
              NDOG: { label: "New Day Opening Gap",   color: "text-teal-400",   bg: "bg-teal-500/10",   border: "border-teal-500/20",   desc: "Gap between yesterday's close and today's open — acts as a fill magnet during the session." },
              BPR:  { label: "Balanced Price Range",  color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/20",    desc: "Overlapping bullish + bearish FVGs — equilibrium zone where price pauses or sharply reverses." },
              CE:   { label: "Consequent Encroachment",color:"text-rose-400",   bg: "bg-rose-500/10",   border: "border-rose-500/20",   desc: "Exact 50% midpoint of a FVG or OB — the most precise ICT entry level for tight stops." },
              JS:   { label: "Judas Swing",           color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20",  desc: "Engineered false move at session open to trap retail before the true institutional direction." },
              MB:   { label: "Mitigation Block",      color: "text-lime-400",   bg: "bg-lime-500/10",   border: "border-lime-500/20",   desc: "Partially visited OB — first touch reacts, second return triggers the remaining institutional orders." },
              SSL:  { label: "Sell-Side Liquidity",   color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20",    desc: "Stop-loss cluster below swing lows — institutions sweep it to buy cheap before reversing up." },
              BSL:  { label: "Buy-Side Liquidity",    color: "text-fuchsia-400",bg: "bg-fuchsia-500/10",border: "border-fuchsia-500/20", desc: "Stop-loss cluster above swing highs — institutions sweep it to sell into demand before reversing." },
            };

            return (
              <div className="space-y-3">
                {symJournal.length === 0 ? (
                  <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-8 text-center">
                    <p className="text-3xl mb-3">📓</p>
                    <p className="font-semibold text-[#F1F5F9]">No journal entries for {symbolBase}</p>
                    <p className="text-[#4B5675] text-xs mt-2 max-w-xs mx-auto">
                      Execute a trade on {symbolBase} and the AI will auto-generate an ICT analysis entry.
                    </p>
                  </div>
                ) : (
                  symJournal.map(e => {
                    const isBuy  = e.side === "BUY";
                    const isOpen = expandedId === e.id;
                    const grade  = e.analysis?.grade ?? null;
                    const GRADE_COLOR: Record<string,string> = {
                      A:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                      B:"text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                      C:"text-amber-400 bg-amber-500/10 border-amber-500/20",
                      D:"text-orange-400 bg-orange-500/10 border-orange-500/20",
                      F:"text-rose-400 bg-rose-500/10 border-rose-500/20",
                    };

                    return (
                      <div key={e.id} className={`bg-[#0C1017] border rounded-2xl overflow-hidden ${isBuy ? "border-emerald-500/20" : "border-rose-500/20"}`}>
                        {/* Header */}
                        <button type="button" className="w-full p-4 text-left" onClick={() => setExpandedId(isOpen ? null : e.id)}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded border shrink-0 ${isBuy ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}>{e.side}</span>
                              {grade && <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${GRADE_COLOR[grade]}`}>{grade}</span>}
                              {/* ICT concept tags */}
                              {(e.concepts ?? []).slice(0,2).map(c => {
                                const m = ICT_META[c];
                                return m ? (
                                  <span key={c} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${m.color} ${m.bg} ${m.border}`}>{c}</span>
                                ) : null;
                              })}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {e.pl != null && (
                                <span className={`text-xs font-mono font-bold ${e.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {e.pl >= 0 ? "+" : ""}${e.pl.toFixed(2)}
                                </span>
                              )}
                              <span className="text-[#4B5675] text-xs">{isOpen ? "▲" : "▼"}</span>
                            </div>
                          </div>
                          {/* Entry text — always visible */}
                          <p className="text-xs text-[#7B8DB4] mt-2 leading-relaxed border-l-2 border-indigo-500/30 pl-2">{e.entry}</p>
                        </button>

                        {/* Full ICT Detail */}
                        {isOpen && (
                          <div className="border-t border-[#1C2333] px-4 pb-4 pt-3 space-y-3">

                            {/* ICT Concepts that fired */}
                            {(e.concepts ?? []).length > 0 && (
                              <div>
                                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-2 font-semibold">ICT Theories Identified</p>
                                <div className="space-y-2">
                                  {(e.concepts ?? []).map(c => {
                                    const m = ICT_META[c];
                                    if (!m) return null;
                                    return (
                                      <div key={c} className={`${m.bg} border ${m.border} rounded-xl p-3`}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${m.bg} border ${m.border} ${m.color}`}>{c}</span>
                                          <span className={`text-xs font-bold ${m.color}`}>{m.label}</span>
                                        </div>
                                        <p className="text-[11px] text-[#7B8DB4] leading-relaxed">{m.desc}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Trade levels */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5">
                                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Entry Price</p>
                                <p className="font-mono font-bold text-emerald-400">${e.price.toFixed(2)}</p>
                              </div>
                              {e.pl != null && (
                                <div className={`border rounded-xl p-2.5 ${e.pl >= 0 ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Realised P&L</p>
                                  <p className={`font-mono font-bold ${e.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {e.pl >= 0 ? "+" : ""}${e.pl.toFixed(2)} ({e.plPct != null ? `${e.plPct >= 0 ? "+" : ""}${e.plPct.toFixed(1)}%` : "—"})
                                  </p>
                                </div>
                              )}
                              {e.stopLoss && (
                                <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5">
                                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Stop Loss</p>
                                  <p className="font-mono font-bold text-rose-400">${e.stopLoss.toFixed(2)}</p>
                                </div>
                              )}
                              {e.takeProfit && (
                                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5">
                                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Take Profit</p>
                                  <p className="font-mono font-bold text-emerald-400">${e.takeProfit.toFixed(2)}</p>
                                </div>
                              )}
                            </div>

                            {/* SELL analysis */}
                            {e.analysis && (
                              <div className="space-y-2">
                                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold">Trade Verdict</p>
                                <p className="text-xs text-[#7B8DB4] leading-relaxed">{e.analysis.verdict}</p>
                                {e.analysis.mistakes.length > 0 && (
                                  <div>
                                    <p className="text-[9px] text-rose-400 uppercase tracking-widest mb-1 font-semibold">Mistakes</p>
                                    {e.analysis.mistakes.map((m,i) => <p key={i} className="text-xs text-[#7B8DB4] flex gap-1.5"><span className="text-rose-400">×</span>{m}</p>)}
                                  </div>
                                )}
                                {e.analysis.wins.length > 0 && (
                                  <div>
                                    <p className="text-[9px] text-emerald-400 uppercase tracking-widest mb-1 font-semibold">What Went Right</p>
                                    {e.analysis.wins.map((w,i) => <p key={i} className="text-xs text-[#7B8DB4] flex gap-1.5"><span className="text-emerald-400">✓</span>{w}</p>)}
                                  </div>
                                )}
                                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-2.5">
                                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Key Lesson</p>
                                  <p className="text-xs text-indigo-300 leading-relaxed">{e.analysis.lesson}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          <p className="text-center text-[10px] text-[#4B5675] pb-2">To reset your portfolio go to Settings → Danger Zone</p>
        </div>
      </main>
    </div>
  );
}
