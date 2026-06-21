"use client";

import { useEffect, useRef, useState } from "react";
import { scopedKey } from "@/app/lib/userState";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = "above" | "below";

type PriceAlert = {
  id:        string;
  symbol:    string;        // bare (AAPL)
  direction: Direction;
  target:    number;
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
};

const STORAGE_KEY = "traxora_price_alerts";
const POLL_MS     = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAlerts(alerts: PriceAlert[]) {
  try { localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(alerts)); } catch { /* ignore */ }
}

function fmtTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── PriceAlerts component ─────────────────────────────────────────────────────

export default function PriceAlerts() {
  const [alerts,  setAlerts]  = useState<PriceAlert[]>([]);
  const [prices,  setPrices]  = useState<Record<string, number>>({});
  const [sym,     setSym]     = useState("");
  const [dir,     setDir]     = useState<Direction>("above");
  const [target,  setTarget]  = useState("");
  const [checking, setChecking] = useState(false);
  const [error,   setError]   = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setAlerts(loadAlerts());
  }, []);

  // Poll prices for active alerts
  const checkPrices = async (currentAlerts: PriceAlert[]) => {
    const active = currentAlerts.filter(a => !a.triggered);
    if (active.length === 0) return;

    const symbols = [...new Set(active.map(a => a.symbol + ".US"))].join(",");
    setChecking(true);
    try {
      const res = await fetch(`/api/market/heatmap?symbols=${encodeURIComponent(symbols)}`);
      if (!res.ok) return;
      const rows: { symbol: string; price: number | null }[] = await res.json();

      const priceMap: Record<string, number> = {};
      for (const r of rows) {
        const bare = r.symbol.replace(/\.US$/, "");
        if (r.price !== null) priceMap[bare] = r.price;
      }
      setPrices(prev => ({ ...prev, ...priceMap }));

      // Check triggers
      setAlerts(prev => {
        let changed = false;
        const next = prev.map(a => {
          if (a.triggered) return a;
          const price = priceMap[a.symbol];
          if (price === undefined) return a;
          const hit = a.direction === "above" ? price >= a.target : price <= a.target;
          if (hit) {
            changed = true;
            // Fire browser notification if permitted
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`Traxora Alert: ${a.symbol}`, {
                body: `${a.symbol} is ${a.direction === "above" ? "at or above" : "at or below"} $${a.target.toFixed(2)} · Now: $${price.toFixed(2)}`,
                icon: "/icon-192.png",
              });
            }
            return { ...a, triggered: true, triggeredAt: Date.now(), triggeredPrice: price };
          }
          return a;
        });
        if (changed) saveAlerts(next);
        return changed ? next : prev;
      });
    } catch { /* ignore */ }
    finally { setChecking(false); }
  };

  // Start polling
  useEffect(() => {
    checkPrices(alerts);
    intervalRef.current = setInterval(() => {
      setAlerts(a => { checkPrices(a); return a; });
    }, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addAlert(e: React.FormEvent) {
    e.preventDefault();
    const s = sym.trim().toUpperCase().replace(/\.US$/, "");
    const t = parseFloat(target);
    if (!s || isNaN(t) || t <= 0) { setError("Enter a valid symbol and price."); return; }
    setError("");
    const alert: PriceAlert = { id: uid(), symbol: s, direction: dir, target: t, createdAt: Date.now(), triggered: false };
    const next = [alert, ...alerts];
    setAlerts(next);
    saveAlerts(next);
    setSym(""); setTarget("");
    checkPrices(next);
  }

  function removeAlert(id: string) {
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next);
    saveAlerts(next);
  }

  function clearTriggered() {
    const next = alerts.filter(a => !a.triggered);
    setAlerts(next);
    saveAlerts(next);
  }

  const active    = alerts.filter(a => !a.triggered);
  const triggered = alerts.filter(a => a.triggered);

  return (
    <div className="space-y-6">

      {/* ── Add alert form ── */}
      <div className="glass surface-sheen border border-[#252345] rounded-2xl p-5">
        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-4">New Price Alert</p>
        <form onSubmit={addAlert} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[9px] text-[#4B5675] uppercase tracking-wider mb-1.5">Symbol</label>
            <input
              value={sym}
              onChange={e => setSym(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full bg-[#13112A] border border-[#252345] focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-[#F1F5F9] placeholder-[#4B5675] outline-none transition-colors"
            />
          </div>
          <div className="min-w-[100px]">
            <label className="block text-[9px] text-[#4B5675] uppercase tracking-wider mb-1.5">Direction</label>
            <select
              value={dir}
              onChange={e => setDir(e.target.value as Direction)}
              className="w-full bg-[#13112A] border border-[#252345] focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-sm font-bold text-[#F1F5F9] outline-none transition-colors"
            >
              <option value="above">Price ≥</option>
              <option value="below">Price ≤</option>
            </select>
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[9px] text-[#4B5675] uppercase tracking-wider mb-1.5">Target Price</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="220.00"
              className="w-full bg-[#13112A] border border-[#252345] focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-[#F1F5F9] placeholder-[#4B5675] outline-none transition-colors"
            />
          </div>
          <button type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold shrink-0">
            + Add Alert
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        <p className="mt-3 text-[10px] text-[#333368]">
          Prices are checked every 60 seconds via Yahoo Finance (15-min delay) · Browser notifications sent when triggered
        </p>
      </div>

      {/* ── Active alerts ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-[#7B8DB4] uppercase tracking-widest">
            Active
            {active.length > 0 && <span className="ml-2 text-emerald-400 font-black">{active.length}</span>}
          </p>
          {checking && (
            <span className="flex items-center gap-1.5 text-[10px] text-[#4B5675]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Checking prices…
            </span>
          )}
        </div>

        {active.length === 0 ? (
          <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 text-center">
            <p className="text-[#4B5675] text-sm">No active price alerts</p>
            <p className="text-[#333368] text-xs mt-1">Add one above to get notified when any stock hits your target.</p>
          </div>
        ) : (
          <div className="glass surface-sheen border border-[#252345] rounded-2xl overflow-hidden divide-y divide-[#252345]">
            {active.map(a => {
              const livePrice = prices[a.symbol];
              const dist = livePrice !== undefined
                ? ((livePrice - a.target) / a.target) * 100
                : null;
              const close = dist !== null && Math.abs(dist) < 5;

              return (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${close ? "bg-amber-400 animate-pulse" : "bg-[#4B5675]"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/analysis?symbol=${encodeURIComponent(a.symbol + ".US")}`}
                        className="font-black font-mono text-sm text-[#F1F5F9] hover:text-emerald-400 transition-colors">
                        {a.symbol}
                      </Link>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        a.direction === "above"
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                      }`}>
                        {a.direction === "above" ? "≥" : "≤"} ${a.target.toFixed(2)}
                      </span>
                      {close && <span className="text-[9px] text-amber-400 font-bold">CLOSE!</span>}
                    </div>
                    <p className="text-[10px] text-[#333368] mt-0.5">Set {fmtTime(a.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {livePrice !== undefined ? (
                      <>
                        <p className="font-mono font-bold text-sm text-[#F1F5F9]">${livePrice.toFixed(2)}</p>
                        {dist !== null && (
                          <p className={`text-[10px] font-mono ${dist >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {dist >= 0 ? "+" : ""}{dist.toFixed(1)}% from target
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[10px] text-[#4B5675]">Loading…</p>
                    )}
                  </div>
                  <button type="button" onClick={() => removeAlert(a.id)}
                    className="shrink-0 text-[#333368] hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-500/10">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Triggered alerts ── */}
      {triggered.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-[#7B8DB4] uppercase tracking-widest">
              Triggered <span className="ml-2 text-violet-400 font-black">{triggered.length}</span>
            </p>
            <button type="button" onClick={clearTriggered}
              className="text-xs text-[#4B5675] hover:text-rose-400 transition border border-[#252345] px-3 py-1.5 rounded-xl">
              Clear all
            </button>
          </div>
          <div className="glass surface-sheen border border-violet-500/20 rounded-2xl overflow-hidden divide-y divide-[#252345]">
            {triggered.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 opacity-70">
                <span className="text-lg shrink-0">🔔</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black font-mono text-sm text-[#F1F5F9]">{a.symbol}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">
                      Triggered
                    </span>
                    <span className="text-[10px] text-[#4B5675]">
                      {a.direction === "above" ? "≥" : "≤"} ${a.target.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#333368] mt-0.5">
                    {a.triggeredAt ? fmtTime(a.triggeredAt) : ""}
                    {a.triggeredPrice !== undefined ? ` · hit at $${a.triggeredPrice.toFixed(2)}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => removeAlert(a.id)}
                  className="shrink-0 text-[#333368] hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-500/10">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
