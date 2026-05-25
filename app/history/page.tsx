"use client";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, type Portfolio } from "../lib/trading";

export default function HistoryPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: 10000,
    holdings: [],
    trades: [],
  });

  useEffect(() => {
    const savedPortfolio = getPortfolio();
    setPortfolio(savedPortfolio);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6">
        <Topbar onSearch={() => {}} />

        <div className="mt-6">
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-gray-400 mt-1">
            Review all your past buy and sell activity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Total Trades</p>
            <h2 className="text-3xl font-bold mt-2">
              {portfolio.trades.length}
            </h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Buy Orders</p>
            <h2 className="text-3xl font-bold mt-2">
              {portfolio.trades.filter((trade) => trade.side === "BUY").length}
            </h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Sell Orders</p>
            <h2 className="text-3xl font-bold mt-2">
              {portfolio.trades.filter((trade) => trade.side === "SELL").length}
            </h2>
          </div>
        </div>

        <div className="mt-6 bg-[#111827] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold">Recent Trades</h2>
              <p className="text-gray-400 text-sm mt-1">
                Latest trades are shown first.
              </p>
            </div>
          </div>

          {portfolio.trades.length === 0 ? (
            <div className="text-gray-400">
              No trades yet. Go to the Market page and place a trade.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-400 text-sm border-b border-[#1F2937]">
                    <th className="py-3">Type</th>
                    <th className="py-3">Symbol</th>
                    <th className="py-3">Quantity</th>
                    <th className="py-3">Price</th>
                    <th className="py-3">Total</th>
                    <th className="py-3">Time</th>
                  </tr>
                </thead>

                <tbody>
                  {portfolio.trades.map((trade, index) => (
                    <tr
                      key={`${trade.symbol}-${trade.time}-${index}`}
                      className="border-b border-[#1F2937] last:border-0"
                    >
                      <td className="py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            trade.side === "BUY"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {trade.side}
                        </span>
                      </td>

                      <td className="py-4 font-medium">{trade.symbol}</td>
                      <td className="py-4">{trade.quantity}</td>
                      <td className="py-4">${trade.price.toFixed(2)}</td>
                      <td className="py-4">
                        ${(trade.quantity * trade.price).toFixed(2)}
                      </td>
                      <td className="py-4 text-gray-400">
                        {new Date(trade.time).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
