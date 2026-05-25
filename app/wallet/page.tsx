"use client";

import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, type Portfolio } from "../lib/trading";

export default function WalletPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: 10000,
    holdings: [],
    trades: [],
  });

  useEffect(() => {
    setPortfolio(getPortfolio());
  }, []);

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6">
        <Topbar onSearch={() => {}} />

        <div className="mt-6">
          <h1 className="text-3xl font-bold">Wallet</h1>
          <p className="text-gray-400 mt-1">
            Manage your available cash and funds.
          </p>
        </div>

        <div className="mt-6 bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
          <p className="text-sm text-gray-400">Available Cash</p>
          <h2 className="text-5xl font-bold mt-2">
            ${portfolio.cash.toFixed(2)}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
            <h3 className="text-xl font-semibold mb-4">Add Funds</h3>
            <p className="text-gray-400 text-sm mb-4">
              (Demo only — no real money)
            </p>

            <button className="w-full bg-green-500 hover:bg-green-600 transition rounded-xl py-3 font-semibold">
              Add $1,000
            </button>
          </div>

          <div className="bg-[#111827] rounded-3xl p-6 border border-[#1F2937]">
            <h3 className="text-xl font-semibold mb-4">Withdraw Funds</h3>
            <p className="text-gray-400 text-sm mb-4">
              (Demo only — no real money)
            </p>

            <button className="w-full bg-red-500 hover:bg-red-600 transition rounded-xl py-3 font-semibold">
              Withdraw $500
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
