"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPortfolio, sellStock, STARTING_BALANCE } from "../lib/trading";

type Toast = { id: number; icon: string; title: string; body: string; color: string };
let tid = 0;

// Singleton guard — one interval globally
let _riskGuardStarted = false;

const CHECK_INTERVAL  = 5 * 60 * 1000; // 5 minutes
const STOP_LOSS_PCT   = 0.08;           // 8% below avg buy price
const CONCENTRATION   = 0.28;           // 28% of account value

export default function RiskGuard() {
  const [toasts, setToasts]   = useState<Toast[]>([]);
  const [active, setActive]   = useState(true);
  const warnedRef             = useRef<Set<string>>(new Set()); // avoid repeat warns same session

  function push(icon: string, title: string, body: string, color: string) {
    const id = ++tid;
    setToasts(prev => [...prev.slice(-3), { id, icon, title, body, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 9_000);
  }

  const runCheck = useCallback(async () => {
    if (!active) return;
    if (document.hidden) return; // skip while tab is hidden
    const portfolio = getPortfolio();
    if (portfolio.holdings.length === 0) return;

    const investedValue  = portfolio.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
    const totalValue     = portfolio.cash + investedValue;

    for (const holding of portfolio.holdings) {
      // Fetch live price
      let livePrice: number | null = null;
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(holding.symbol)}`);
        const data = await res.json();
        livePrice  = data?.price ?? null;
      } catch { /* skip */ }

      if (!livePrice) continue;

      const symbol    = holding.symbol.replace(".US","").replace(".COMM","");
      const posValue  = livePrice * holding.quantity;
      const plPct     = (livePrice - holding.avgPrice) / holding.avgPrice;
      const concPct   = posValue / totalValue;

      // Stop-loss: down > 8%
      // Skip if AutoTrader already owns this stop via the holding's stopLoss field.
      // Letting both systems fire causes double-sells and "not enough shares" errors.
      if (holding.stopLoss != null) continue;
      if (plPct <= -STOP_LOSS_PCT) {
        const lossStr = `${(plPct * 100).toFixed(1)}%`;
        push("🛡️",
          `Stop-loss triggered on ${symbol}`,
          `Position down ${lossStr} — auto-selling ${holding.quantity} shares`,
          "border-rose-500/30 bg-rose-500/10 text-rose-300"
        );
        try {
          sellStock(holding.symbol, holding.quantity, livePrice);
        } catch { /* ignore */ }
        warnedRef.current.delete(holding.symbol + "-conc");
        continue;
      }

      // Concentration: >28% of account in one stock
      const concKey = holding.symbol + "-conc";
      if (concPct >= CONCENTRATION && !warnedRef.current.has(concKey)) {
        warnedRef.current.add(concKey);
        push("⚠️",
          `${symbol} is ${(concPct * 100).toFixed(0)}% of your account`,
          `Consider reducing — rule: no single position > 25%`,
          "border-amber-500/30 bg-amber-500/10 text-amber-300"
        );
      }

      // Portfolio overall down >15% from start
      const totalPLPct = (totalValue - STARTING_BALANCE) / STARTING_BALANCE;
      if (totalPLPct <= -0.15 && !warnedRef.current.has("portfolio-drawdown")) {
        warnedRef.current.add("portfolio-drawdown");
        push("🚨",
          "Portfolio drawdown alert",
          `Account is down ${(totalPLPct * 100).toFixed(1)}% — consider pausing trading`,
          "border-rose-500/30 bg-rose-500/10 text-rose-300"
        );
      }
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (_riskGuardStarted) {
      console.warn("[RiskGuard] duplicate mount detected — skipping interval setup");
      return;
    }
    _riskGuardStarted = true;
    runCheck();
    const id = setInterval(runCheck, CHECK_INTERVAL);
    return () => {
      _riskGuardStarted = false;
      clearInterval(id);
    };
  }, [active, runCheck]);

  return (
    <>
      {/* RiskGuard toasts — top-right corner */}
      <div className="fixed top-20 right-4 sm:right-[180px] z-[var(--z-float)] flex flex-col gap-2 w-[300px] sm:w-[320px] pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl animate-toast-in pointer-events-auto ${t.color}`}
          >
            <span className="text-base shrink-0 mt-0.5">{t.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-snug">{t.title}</p>
              <p className="text-[10px] text-[#4B5675] mt-0.5 leading-snug">{t.body}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="shrink-0 text-[#4B5675] hover:text-[#F1F5F9] transition-colors ml-auto"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Silent: active toggle via event */}
      {/* RiskGuard is always-on — no UI control needed */}
    </>
  );
}
