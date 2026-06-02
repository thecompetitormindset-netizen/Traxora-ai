"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { scopedKey, setCurrentUser } from "../lib/userState";

type Alert = {
  symbol:      string;
  name:        string;
  signal:      "BUY" | "SELL";
  price:       number;
  confidence?: string;
  time:        number;
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
  useEffect(() => {
  }, []);
  const { data: session } = useSession();
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [paused,     setPaused]     = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  // Tracks whether we've loaded from the correct user-scoped key
  const loadedForEmail = useRef<string | null>(null);

  // Sync user ID from session then read localStorage — must happen in this order
  useEffect(() => {
    const email = session?.user?.email ?? null;
    // Don't re-load if session hasn't resolved yet and we already have data
    if (email === loadedForEmail.current) return;
    // Set the scoped key to the confirmed email
    setCurrentUser(email);
    loadedForEmail.current = email;

    try {
      const raw = localStorage.getItem(scopedKey("traxora_alerts"));
      setAlerts(raw ? JSON.parse(raw) : []);
      setPaused(localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true");
    } catch { /* ignore */ }

    if (!("Notification" in window)) {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
  }, [session]);

  // Live-update alert list when new signals arrive
  useEffect(() => {
    function onSignal() {
      try {
        const raw = localStorage.getItem(scopedKey("traxora_alerts"));
        if (raw) setAlerts(JSON.parse(raw));
      } catch { /* ignore */ }
    }
    window.addEventListener("traxora-signal", onSignal);
    return () => window.removeEventListener("traxora-signal", onSignal);
  }, []);

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  function togglePause() {
    const next = !paused;
    setPaused(next);
    localStorage.setItem(scopedKey("traxora_alerts_paused"), String(next));
  }

  function clearAll() {
    localStorage.removeItem(scopedKey("traxora_alerts"));
    setAlerts([]);
  }

  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

          {/* ── Header ── */}
          <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">Signal Alerts</h1>
              <p className="text-[#7B8DB4] mt-2 text-sm">
                AI-generated BUY &amp; SELL signals from your watchlist.
              </p>
              {session?.user?.email && (
                <p className="text-[10px] text-[#333368] mt-1 font-mono">
                  Saved to · {session.user.email}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={togglePause}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  paused
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                    : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                {paused ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Resume Alerts
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                    </svg>
                    Pause Alerts
                  </>
                )}
              </button>
              {alerts.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm text-[#4B5675] hover:text-rose-400 transition border border-[#252345] px-4 py-2 rounded-xl"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* ── Paused banner ── */}
          {paused && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-rose-400 text-lg">🔕</span>
              <div>
                <p className="text-sm font-semibold text-rose-400">Alerts paused</p>
                <p className="text-xs text-[#7B8DB4] mt-0.5">
                  No new signal toasts or push notifications while paused. Your paper portfolio still works normally.
                </p>
              </div>
            </div>
          )}

          {/* ── Push permission ── */}
          {!paused && permission === "default" && (
            <div className="mt-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-emerald-400">Enable push notifications</p>
                <p className="text-sm text-[#7B8DB4] mt-0.5">
                  Get notified the moment Traxora AI fires a BUY or SELL signal.
                </p>
              </div>
              <button type="button" onClick={requestPermission}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-500 transition px-5 py-2.5 rounded-xl text-sm font-semibold">
                Enable
              </button>
            </div>
          )}

          {permission === "denied" && (
            <div className="mt-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-rose-400">🔕</span>
              <p className="text-xs text-[#7B8DB4]">
                Notifications blocked — go to browser settings → Site permissions → allow this site.
              </p>
            </div>
          )}

          {/* ── Alert history ── */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-[#7B8DB4] uppercase tracking-widest mb-4">
              Alert History
              {alerts.length > 0 && (
                <span className="ml-2 text-sm text-[#333368] font-normal normal-case tracking-normal">
                  {alerts.length} signals
                </span>
              )}
            </h2>

            {alerts.length === 0 ? (
              <div className="bg-[#13112A] border border-[#252345] rounded-3xl p-10 text-center">
                <p className="text-[#4B5675] text-sm">No alerts yet.</p>
                <p className="text-[#333368] text-xs mt-1">
                  Signals fire automatically when the dashboard detects a BUY or SELL.
                </p>
              </div>
            ) : (
              <div className="bg-[#13112A] border border-[#252345] rounded-3xl overflow-hidden divide-y divide-[#252345]">
                {alerts.map((alert, i) => {
                  const clean = alert.symbol.replace(".US", "").replace(".COMM", "");
                  const isBuy = alert.signal === "BUY";

                  return (
                    <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#0F1623] transition-colors">
                      {/* Signal dot */}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isBuy ? "bg-emerald-400 shadow-[0_0_6px_#10B981]" : "bg-rose-400 shadow-[0_0_6px_#EF4444]"}`} />

                      {/* Symbol + signal */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-bold text-[#F1F5F9] font-mono text-sm">{clean}</span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                          isBuy
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                        }`}>
                          {alert.signal}
                        </span>
                        {alert.confidence && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            alert.confidence === "High"
                              ? "text-emerald-400 bg-emerald-500/8 border-emerald-500/15"
                              : alert.confidence === "Low"
                                ? "text-rose-400 bg-rose-500/8 border-rose-500/15"
                                : "text-amber-400 bg-amber-500/8 border-amber-500/15"
                          }`}>
                            {alert.confidence}
                          </span>
                        )}
                        <span className="text-[#4B5675] text-xs truncate hidden sm:block">{alert.name}</span>
                      </div>

                      {/* Price + time + log action */}
                      <div className="text-right shrink-0">
                        <p className="text-[#F1F5F9] font-semibold font-mono text-sm">${alert.price.toFixed(2)}</p>
                        <p className="text-[10px] text-[#4B5675] mt-0.5">{timeAgo(alert.time)}</p>
                        <a
                          href={`/paper?symbol=${encodeURIComponent(clean)}&direction=${alert.signal}&price=${alert.price.toFixed(2)}`}
                          className={`text-[9px] font-bold transition-colors ${isBuy ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300"}`}
                        >
                          Log trade →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
