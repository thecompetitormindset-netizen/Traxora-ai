"use client";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { resetPortfolio } from "../lib/trading";

export default function SettingsPage() {
  function handleReset() {
    const confirmed = window.confirm(
      "Reset your portfolio and start again with $10,000?",
    );

    if (!confirmed) return;

    resetPortfolio();
    alert("Portfolio reset successfully.");
  }

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />

      <main className="flex-1 p-6">
        <Topbar onSearch={() => {}} />

        <div className="mt-6">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-400 mt-1">
            Manage your app preferences and portfolio controls.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
          <div className="bg-[#111827] rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-4">Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Name</label>
                <input
                  type="text"
                  value="Trader"
                  readOnly
                  className="w-full bg-[#1F2937] rounded-xl px-4 py-3 outline-none text-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Email
                </label>
                <input
                  type="text"
                  value="demo@kairostradepilot.com"
                  readOnly
                  className="w-full bg-[#1F2937] rounded-xl px-4 py-3 outline-none text-gray-300"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#111827] rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-4">Preferences</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#1F2937] rounded-xl px-4 py-3">
                <span>Dark Mode</span>
                <span className="text-green-400 font-medium">Enabled</span>
              </div>

              <div className="flex items-center justify-between bg-[#1F2937] rounded-xl px-4 py-3">
                <span>Currency</span>
                <span className="text-gray-300">USD</span>
              </div>

              <div className="flex items-center justify-between bg-[#1F2937] rounded-xl px-4 py-3">
                <span>Trading Mode</span>
                <span className="text-blue-400 font-medium">Paper Trading</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
          <div className="bg-[#111827] rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-4">Portfolio Controls</h2>
            <p className="text-gray-400 mb-4">
              Reset your paper trading portfolio and start again with $10,000.
            </p>

            <button
              onClick={handleReset}
              className="bg-red-500 hover:bg-red-600 transition rounded-xl px-5 py-3 font-semibold"
            >
              Reset Portfolio
            </button>
          </div>

          <div className="bg-[#111827] rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-4">About</h2>

            <div className="space-y-3 text-gray-300">
              <p>
                <span className="text-gray-400">App Name:</span> Kairos TradePilot AI
              </p>
              <p>
                <span className="text-gray-400">Version:</span> 1.0.0
              </p>
              <p>
                <span className="text-gray-400">Mode:</span> Demo / Paper
                Trading
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
