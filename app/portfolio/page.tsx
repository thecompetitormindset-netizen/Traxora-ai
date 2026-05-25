"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, resetPortfolio, type Portfolio } from "../lib/trading";

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: 10000,
    holdings: [],
    trades: [],
  });

  useEffect(() => {
    const savedPortfolio = getPortfolio();
    setPortfolio(savedPortfolio);
  }, []);

  const totalHoldings = portfolio.holdings.length;

  const totalShares = useMemo(() => {
    return portfolio.holdings.reduce(
      (sum, holding) => sum + holding.quantity,
      0,
    );
  }, [portfolio.holdings]);

  const investedValue = useMemo(() => {
    return portfolio.holdings.reduce(
      (sum, holding) => sum + holding.quantity * holding.avgPrice,
      0,
    );
  }, [portfolio.holdings]);

  const totalAccountValue = portfolio.cash + investedValue;

  function handleReset() {
    const confirmed = window.confirm(
      "Reset your portfolio and start again with $10,000?",
    );

    if (!confirmed) return;

    const freshPortfolio = resetPortfolio();
    setPortfolio(freshPortfolio);
  }

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6">
        <Topbar onSearch={() => {}} />

        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Portfolio</h1>
            <p className="text-gray-400 mt-1">
              View your cash balance, holdings, and invested value.
            </p>
          </div>

          <button
            onClick={handleReset}
            className="bg-red-500 hover:bg-red-600 transition rounded-xl px-5 py-3 font-semibold"
          >
            Reset Portfolio
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Cash Balance</p>
            <h2 className="text-3xl font-bold mt-2">
              ${portfolio.cash.toFixed(2)}
            </h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Total Holdings</p>
            <h2 className="text-3xl font-bold mt-2">{totalHoldings}</h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Total Shares</p>
            <h2 className="text-3xl font-bold mt-2">{totalShares}</h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5">
            <p className="text-sm text-gray-400">Account Value</p>
            <h2 className="text-3xl font-bold mt-2">
              ${totalAccountValue.toFixed(2)}
            </h2>
          </div>
        </div>

        <div className="mt-6 bg-[#111827] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold">Holdings</h2>
              <p className="text-gray-400 text-sm mt-1">
                Total Invested: ${investedValue.toFixed(2)}
              </p>
            </div>
          </div>

          {portfolio.holdings.length === 0 ? (
            <div className="text-gray-400">
              No holdings yet. Buy some shares from the Market page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-400 text-sm border-b border-[#1F2937]">
                    <th className="py-3">Symbol</th>
                    <th className="py-3">Quantity</th>
                    <th className="py-3">Avg Price</th>
                    <th className="py-3">Total Value</th>
                  </tr>
                </thead>

                <tbody>
                  {portfolio.holdings.map((holding) => (
                    <tr
                      key={holding.symbol}
                      className="border-b border-[#1F2937] last:border-0"
                    >
                      <td className="py-4 font-medium">{holding.symbol}</td>
                      <td className="py-4">{holding.quantity}</td>
                      <td className="py-4">${holding.avgPrice.toFixed(2)}</td>
                      <td className="py-4">
                        ${(holding.quantity * holding.avgPrice).toFixed(2)}
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
