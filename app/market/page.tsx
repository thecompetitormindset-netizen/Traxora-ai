"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import Chart from "../components/Chart";
import { buyStock, sellStock, getPortfolio } from "../lib/trading";

type QuoteData = {
  provider?: string;
  symbol: string;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  exchange?: string | null;
  timestamp?: number | null | string;
};

export default function MarketPage() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [quantity, setQuantity] = useState(1);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [cash, setCash] = useState(50000);
  const [message, setMessage] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(true);

  useEffect(() => {
    const portfolio = getPortfolio();
    setCash(portfolio.cash);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadQuote() {
      setLoadingQuote(true);
      setMessage("");

      try {
        const res = await fetch(
          `/api/quote?symbol=${encodeURIComponent(symbol)}`,
          { cache: "no-store" },
        );

        const data = await res.json();

        if (!isActive) return;

        if (!res.ok || data?.error) {
          setQuote(null);
          setMessage("Could not load quote for this symbol.");
        } else {
          setQuote({
            provider: data.provider ?? "",
            symbol: data.symbol ?? symbol,
            price: data.price ?? null,
            previousClose: data.previousClose ?? null,
            open: data.open ?? null,
            high: data.high ?? null,
            low: data.low ?? null,
            exchange: data.exchange ?? null,
            timestamp: data.timestamp ?? null,
          });
        }
      } catch {
        if (!isActive) return;
        setQuote(null);
        setMessage("Failed to load market data.");
      } finally {
        if (isActive) setLoadingQuote(false);
      }
    }

    loadQuote();
    const interval = setInterval(loadQuote, 5000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [symbol]);

  const price = quote?.price ?? null;
  const previousClose = quote?.previousClose ?? null;

  const dayChangePercent =
    price !== null && previousClose !== null && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  function handleTrade() {
    try {
      if (price === null) {
        setMessage("Price unavailable.");
        return;
      }

      if (quantity <= 0 || Number.isNaN(quantity)) {
        setMessage("Quantity must be greater than 0.");
        return;
      }

      const updatedPortfolio =
        side === "BUY"
          ? buyStock(symbol, quantity, price)
          : sellStock(symbol, quantity, price);

      setCash(updatedPortfolio.cash);
      setMessage(
        `${side} order completed for ${quantity} share(s) of ${symbol}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade failed.");
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6 xl:p-8">
        <Topbar />

        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">{symbol}</h1>
            <p className="text-gray-400 mt-2">
              {quote?.exchange
                ? `Exchange: ${quote.exchange}`
                : "Live market view"}
            </p>
            {quote?.provider ? (
              <p className="text-xs text-gray-500 mt-1">
                Data provider: {quote.provider}
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <div className="bg-[#111827] rounded-2xl px-5 py-4 border border-[#1F2937] min-w-[170px]">
              <p className="text-xs text-gray-400">Current Price</p>
              <p className="text-2xl font-bold mt-2">
                {loadingQuote
                  ? "Loading..."
                  : price !== null
                    ? `$${price.toFixed(2)}`
                    : "--"}
              </p>
            </div>

            <div className="bg-[#111827] rounded-2xl px-5 py-4 border border-[#1F2937] min-w-[170px]">
              <p className="text-xs text-gray-400">Day Change</p>
              <p
                className={`text-2xl font-bold mt-2 ${
                  dayChangePercent === null
                    ? "text-white"
                    : dayChangePercent >= 0
                      ? "text-green-400"
                      : "text-red-400"
                }`}
              >
                {dayChangePercent === null
                  ? "--"
                  : `${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(2)}%`}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
          <div className="xl:col-span-2 bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold">{symbol} Chart</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Earliest available data from provider
                </p>
              </div>
            </div>

            <Chart symbol={symbol} />
          </div>

          <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
            <h2 className="text-2xl font-semibold mb-5">Trade Panel</h2>

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setSide("BUY")}
                className={`flex-1 rounded-xl py-3 font-semibold ${
                  side === "BUY"
                    ? "bg-green-500 text-white"
                    : "bg-[#1F2937] text-gray-300"
                }`}
              >
                Buy
              </button>

              <button
                onClick={() => setSide("SELL")}
                className={`flex-1 rounded-xl py-3 font-semibold ${
                  side === "SELL"
                    ? "bg-red-500 text-white"
                    : "bg-[#1F2937] text-gray-300"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Symbol
                </label>
                <input
                  value={symbol}
                  readOnly
                  className="w-full bg-[#1F2937] rounded-xl px-4 py-3 outline-none text-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full bg-[#1F2937] rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="bg-[#0B1220] rounded-2xl p-4 border border-[#1F2937]">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Estimated Price</span>
                  <span>{price !== null ? `$${price.toFixed(2)}` : "--"}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Estimated Total</span>
                  <span>
                    {price !== null
                      ? `$${(price * quantity).toFixed(2)}`
                      : "--"}
                  </span>
                </div>
              </div>

              <button
                onClick={handleTrade}
                className={`w-full rounded-xl py-3 font-semibold ${
                  side === "BUY" ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {side === "BUY" ? "Buy Shares" : "Sell Shares"}
              </button>

              <div className="text-sm text-gray-400">
                Cash Balance: ${cash.toFixed(2)}
              </div>

              {message ? (
                <div className="text-sm text-blue-400">{message}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-[#111827] rounded-3xl p-5 border border-[#1F2937]">
            <h3 className="text-lg font-semibold mb-3">Open</h3>
            <p className="text-2xl font-bold">
              {quote?.open !== null && quote?.open !== undefined
                ? `$${quote.open.toFixed(2)}`
                : "--"}
            </p>
          </div>

          <div className="bg-[#111827] rounded-3xl p-5 border border-[#1F2937]">
            <h3 className="text-lg font-semibold mb-3">High</h3>
            <p className="text-2xl font-bold">
              {quote?.high !== null && quote?.high !== undefined
                ? `$${quote.high.toFixed(2)}`
                : "--"}
            </p>
          </div>

          <div className="bg-[#111827] rounded-3xl p-5 border border-[#1F2937]">
            <h3 className="text-lg font-semibold mb-3">Low</h3>
            <p className="text-2xl font-bold">
              {quote?.low !== null && quote?.low !== undefined
                ? `$${quote.low.toFixed(2)}`
                : "--"}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
