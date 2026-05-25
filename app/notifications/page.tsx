"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

type Alert = {
  symbol: string;
  name: string;
  signal: "BUY" | "SELL";
  price: number;
  time: number;
};

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    const raw = localStorage.getItem("kairos_alerts");
    if (raw) {
      try { setAlerts(JSON.parse(raw)); } catch { /* ignore */ }
    }
    if (!("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  function clearAll() {
    localStorage.removeItem("kairos_alerts");
    setAlerts([]);
  }

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />
      <main className="flex-1 p-6 xl:p-8">
        <Topbar />

        <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Signal Alerts</h1>
            <p className="text-gray-400 mt-2">
              Push notifications from Kairos AI — BUY &amp; SELL signals fired while the dashboard was open.
            </p>
          </div>
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-gray-500 hover:text-red-400 transition border border-[#1F2937] px-4 py-2 rounded-xl"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Permission Banner */}
        {permission === "default" && (
          <div className="mt-5 bg-green-500/10 border border-green-500/20 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-green-400">Enable push alerts</p>
              <p className="text-sm text-gray-400 mt-0.5">
                Get notified on your phone the moment Kairos AI fires a BUY or SELL signal.
              </p>
            </div>
            <button
              type="button"
              onClick={requestPermission}
              className="shrink-0 bg-green-600 hover:bg-green-500 transition px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Enable Alerts
            </button>
          </div>
        )}

        {permission === "granted" && (
          <div className="mt-5 bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-green-400 text-lg">🔔</span>
            <div>
              <p className="text-sm font-semibold text-green-400">Alerts are active</p>
              <p className="text-xs text-gray-400 mt-0.5">
                You&apos;ll receive a push notification whenever a BUY or SELL signal fires on the dashboard.
                Install TradePilot to your home screen for alerts even when your browser is minimized.
              </p>
            </div>
          </div>
        )}

        {permission === "denied" && (
          <div className="mt-5 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-red-400 text-lg">🔕</span>
            <div>
              <p className="text-sm font-semibold text-red-400">Notifications blocked</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Go to your browser settings → Site permissions → Notifications → allow this site.
              </p>
            </div>
          </div>
        )}

        {/* Install hint */}
        <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-blue-400 text-lg">📱</span>
          <div>
            <p className="text-sm font-semibold text-blue-300">Install on your phone</p>
            <p className="text-xs text-gray-400 mt-0.5">
              On iPhone: tap <strong className="text-white">Share → Add to Home Screen</strong>.
              On Android: tap the browser menu → <strong className="text-white">Install App</strong>.
              TradePilot will appear next to your Robinhood icon.
            </p>
          </div>
        </div>

        {/* Alert History */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            Alert History
            {alerts.length > 0 && (
              <span className="ml-2 text-sm text-gray-500 font-normal">{alerts.length} alerts</span>
            )}
          </h2>

          {alerts.length === 0 ? (
            <div className="bg-[#111827] border border-[#1F2937] rounded-3xl p-8 text-center">
              <p className="text-gray-500 text-sm">No alerts yet.</p>
              <p className="text-gray-600 text-xs mt-1">
                Alerts fire automatically when Kairos AI detects a BUY or SELL signal on the dashboard.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <Link
                  key={i}
                  href={`/analysis?symbol=${encodeURIComponent(alert.symbol)}`}
                  className="bg-[#111827] rounded-2xl p-5 border border-[#1F2937] hover:border-blue-500/40 transition flex items-center gap-4"
                >
                  <span className={`text-2xl w-12 text-center shrink-0`}>
                    {alert.signal === "BUY" ? "🟢" : "🔴"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">
                        {alert.symbol.replace(".US","").replace(".COMM","")}
                      </p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        alert.signal === "BUY"
                          ? "text-green-400 bg-green-500/10 border-green-500/20"
                          : "text-red-400 bg-red-500/10 border-red-500/20"
                      }`}>
                        {alert.signal}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 truncate">{alert.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-semibold">${alert.price.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{timeAgo(alert.time)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
