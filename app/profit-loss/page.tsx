"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, type Portfolio } from "../lib/trading";

export default function ProfitLossPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: 10000,
    holdings: [],
    trades: [],
  });

  useEffect(() => {
    setPortfolio(getPortfolio());
  }, []);

  const investedValue = useMemo(() => {
    return portfolio.holdings.reduce(
      (sum, holding) => sum + holding.quantity * holding.avgPrice,
      0,
    );
  }, [portfolio.holdings]);

  const totalAccountValue = portfolio.cash + investedValue;
  const totalProfitLoss = totalAccountValue - 10000;
  const todaysPL = totalProfitLoss * 0.2;

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />
      <main className="flex-1 p-6">
        <Topbar onSearch={() => {}} />

        <div className="mt-6">
          <h1 className="text-3xl font-bold">Profit / Loss Details</h1>
          <p className="text-gray-400 mt-1">
            View your current profit, losses, and performance summary.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937]">
            <p className="text-sm text-gray-400">Starting Balance</p>
            <h2 className="text-3xl font-bold mt-2">$10,000.00</h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937]">
            <p className="text-sm text-gray-400">Current Account Value</p>
            <h2 className="text-3xl font-bold mt-2">
              ${totalAccountValue.toFixed(2)}
            </h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937]">
            <p className="text-sm text-gray-400">Total Profit / Loss</p>
            <h2
              className={`text-3xl font-bold mt-2 ${
                totalProfitLoss >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {totalProfitLoss >= 0 ? "+" : ""}${totalProfitLoss.toFixed(2)}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937]">
            <p className="text-sm text-gray-400">Today's P/L</p>
            <h2
              className={`text-3xl font-bold mt-2 ${
                todaysPL >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {todaysPL >= 0 ? "+" : ""}${todaysPL.toFixed(2)}
            </h2>
          </div>

          <div className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937]">
            <p className="text-sm text-gray-400">Invested Value</p>
            <h2 className="text-3xl font-bold mt-2">
              ${investedValue.toFixed(2)}
            </h2>
          </div>
        </div>
      </main>
    </div>
  );
}
