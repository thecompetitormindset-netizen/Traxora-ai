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
    pendingOrders: [],
  });

  useEffect(() => {
    setPortfolio(getPortfolio());
  }, []);

  const investedValue = portfolio.holdings.reduce(
    (sum, h) => sum + h.quantity * h.avgPrice,
    0,
  );

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />

      <main className="flex-1 p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

        <div className="mt-6">
          <h1 className="text-4xl font-bold">Wallet</h1>
          <p className="text-[#7B8DB4] mt-2">Manage your available cash and virtual funds.</p>
        </div>

        {/* Main balance card */}
        <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-3xl p-8">
          <p className="text-xs text-[#4B5675] font-semibold uppercase tracking-widest mb-3">Available Cash</p>
          <p className="text-6xl font-black text-emerald-400 font-mono">
            ${portfolio.cash.toFixed(2)}
          </p>
          <div className="flex gap-6 mt-5">
            <div>
              <p className="text-[11px] text-[#4B5675] uppercase tracking-wide">Invested</p>
              <p className="text-lg font-bold font-mono text-[#F1F5F9] mt-0.5">${investedValue.toFixed(2)}</p>
            </div>
            <div className="w-px bg-[#1C2333]" />
            <div>
              <p className="text-[11px] text-[#4B5675] uppercase tracking-wide">Total Account</p>
              <p className="text-lg font-bold font-mono text-[#F1F5F9] mt-0.5">${(portfolio.cash + investedValue).toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm">💰</span>
              <h3 className="text-base font-semibold">Add Funds</h3>
            </div>
            <p className="text-[#4B5675] text-xs mb-4">Demo only — no real money involved.</p>
            <button
              type="button"
              className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-xl py-3 font-semibold text-sm"
            >
              Add $1,000
            </button>
          </div>

          <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-sm">📤</span>
              <h3 className="text-base font-semibold">Withdraw Funds</h3>
            </div>
            <p className="text-[#4B5675] text-xs mb-4">Demo only — no real money involved.</p>
            <button
              type="button"
              className="w-full bg-rose-600 hover:bg-rose-500 transition rounded-xl py-3 font-semibold text-sm"
            >
              Withdraw $500
            </button>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
