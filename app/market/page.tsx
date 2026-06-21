"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Topbar from "../components/Topbar";
import dynamic from "next/dynamic";
const StockChart = dynamic(() => import("../components/StockChart"), { ssr: false });
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

function MarketContent() {
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
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />

      <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-5xl mx-auto w-full">

        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="reveal section-header text-4xl font-bold text-gradient-green">{symbol}</h1>
            {quote?.exchange && <p className="text-[#7B8DB4] mt-1 text-sm">{quote.exchange}</p>}
          </div>

          <div className="flex gap-3">
            <div className="card-shine card-hover-lift bg-[#13112A] rounded-2xl px-5 py-4 border border-[#252345] min-w-[170px]">
              <p className="text-xs text-[#7B8DB4]">Current Price</p>
              <p className="text-2xl font-bold mt-2">
                {loadingQuote
                  ? "Loading..."
                  : price !== null
                    ? `$${price.toFixed(2)}`
                    : "--"}
              </p>
            </div>

            <div className="card-shine card-hover-lift bg-[#13112A] rounded-2xl px-5 py-4 border border-[#252345] min-w-[170px]">
              <p className="text-xs text-[#7B8DB4]">Day Change</p>
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-3">
          <div className="xl:col-span-2 card-shine glass surface-sheen rounded-3xl p-6 border border-[#252345]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">{symbol} Chart</h2>
            </div>

            <StockChart symbol={symbol} height={440} />
          </div>

          <div className="card-shine glass surface-sheen rounded-3xl p-6 border border-[#252345]">
            <h2 className="text-2xl font-semibold mb-5">Trade Panel</h2>

            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setSide("BUY")}
                className={`flex-1 rounded-xl py-3 font-semibold ${
                  side === "BUY"
                    ? "bg-green-500 text-white"
                    : "bg-[#1E1C42] text-gray-300"
                }`}
              >
                Buy
              </button>

              <button
                type="button"
                onClick={() => setSide("SELL")}
                className={`flex-1 rounded-xl py-3 font-semibold ${
                  side === "SELL"
                    ? "bg-red-500 text-white"
                    : "bg-[#1E1C42] text-gray-300"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#7B8DB4] mb-2">
                  Symbol
                </label>
                <input
                  value={symbol}
                  readOnly
                  className="w-full bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3 outline-none text-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm text-[#7B8DB4] mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="bg-[#0D0B1A]/60 rounded-2xl p-4 border border-[#252345]">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#7B8DB4]">Estimated Price</span>
                  <span>{price !== null ? `$${price.toFixed(2)}` : "--"}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-[#7B8DB4]">Estimated Total</span>
                  <span>
                    {price !== null
                      ? `$${(price * quantity).toFixed(2)}`
                      : "--"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTrade}
                className={`w-full rounded-xl py-3 font-semibold ${
                  side === "BUY" ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {side === "BUY" ? "Buy Shares" : "Sell Shares"}
              </button>

              <div className="text-sm text-[#7B8DB4]">
                Cash Balance: ${cash.toFixed(2)}
              </div>

              {message ? (
                <div className="text-sm text-blue-400">{message}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-3">
          <div className="bg-[#1A1838] rounded-3xl p-5 border border-[#1E1C42]">
            <h3 className="text-lg font-semibold mb-3">Open</h3>
            <p className="text-2xl font-bold">
              {quote?.open !== null && quote?.open !== undefined
                ? `$${quote.open.toFixed(2)}`
                : "--"}
            </p>
          </div>

          <div className="bg-[#1A1838] rounded-3xl p-5 border border-[#1E1C42]">
            <h3 className="text-lg font-semibold mb-3">High</h3>
            <p className="text-2xl font-bold">
              {quote?.high !== null && quote?.high !== undefined
                ? `$${quote.high.toFixed(2)}`
                : "--"}
            </p>
          </div>

          <div className="bg-[#1A1838] rounded-3xl p-5 border border-[#1E1C42]">
            <h3 className="text-lg font-semibold mb-3">Low</h3>
            <p className="text-2xl font-bold">
              {quote?.low !== null && quote?.low !== undefined
                ? `$${quote.low.toFixed(2)}`
                : "--"}
            </p>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}

export default function MarketPage() {
  return (
    <PaywallGuard>
      <Suspense fallback={
        <div className="flex min-h-screen text-[#F1F5F9] items-center justify-center">
          <div className="text-[#4B5675] text-sm">Loading…</div>
        </div>
      }>
        <MarketContent />
      </Suspense>
    </PaywallGuard>
  );
}
