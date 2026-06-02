"use client";

import { useEffect, useState } from "react";

type SignalEvent = {
  id: string;
  symbol: string;
  name: string;
  signal: "BUY" | "SELL";
  price: number;
  confidence: string;
};

export default function SignalToast() {
  const [toasts, setToasts] = useState<SignalEvent[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<SignalEvent, "id">;
      if (d.signal !== "BUY" && d.signal !== "SELL") return;
      const id = crypto.randomUUID();
      setToasts(prev => [{ ...d, id }, ...prev].slice(0, 4));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 12_000);
    };
    window.addEventListener("traxora-signal", handler);
    return () => window.removeEventListener("traxora-signal", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-32 left-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const isBuy   = t.signal === "BUY";
        const cleanSym = t.symbol.replace(".US", "").replace(".COMM", "");
        const logUrl  = `/paper?symbol=${encodeURIComponent(cleanSym)}&direction=${t.signal}&price=${t.price.toFixed(2)}`;

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl animate-toast-in max-w-[280px] ${
              isBuy
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-rose-500/10 border-rose-500/20"
            }`}
          >
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg border mt-0.5 shrink-0 ${
              isBuy
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/15 border-rose-500/30 text-rose-400"
            }`}>
              {isBuy ? "▲ BUY" : "▼ SELL"}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-[#F1F5F9] leading-none">{cleanSym}</p>
              <p className="text-[11px] text-[#7B8DB4] mt-0.5">${t.price.toFixed(2)} · {t.confidence} confidence</p>
              <a
                href={logUrl}
                className={`inline-block mt-2 text-[11px] font-bold transition-colors ${
                  isBuy ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300"
                }`}
              >
                Log this trade →
              </a>
            </div>

            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors shrink-0 mt-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
