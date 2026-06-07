"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ONBOARD_KEY = "traxora_onboarded_v1";

const STEPS = [
  {
    icon: "⚡",
    title: "Add stocks to your watchlist",
    desc: "Go to your Dashboard and tap Edit on the watchlist. Add any stocks you follow — Traxora will scan them for BUY/SELL/HOLD signals with entry zones and stop losses every minute.",
    action: { label: "Open Dashboard →", href: "/dashboard" },
  },
  {
    icon: "🌅",
    title: "Read the morning briefing",
    desc: "Every trading day, tap the sunrise card on your dashboard for a full AI market brief — macro overview, top options plays, futures setups, and what to watch that session.",
    action: null,
  },
  {
    icon: "🔄",
    title: "Try the Wheeling Hub",
    desc: "Sell cash-secured puts on stocks you'd be OK owning. The Wheeling Hub scans for high-premium put candidates and tracks your CSP → assignment → covered call cycle.",
    action: { label: "Open Wheeling Hub →", href: "/wheel" },
  },
  {
    icon: "💬",
    title: "Ask the AI anything",
    desc: "Tap Signals → AI Chat from the nav, or the floating chat button. Ask about a specific stock, a trade setup, earnings risk, options strategy — you get a sourced answer in seconds.",
    action: null,
  },
  {
    icon: "🎯",
    title: "You're all set",
    desc: "Traxora runs 24/7. Morning brief at market open, live signals all day, and your journal builds automatically. Check your Stats page weekly to track your edge.",
    action: { label: "Go to Stats →", href: "/strategy" },
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setVisible(true);
    } catch { /* ssr */ }
  }, []);

  function finish() {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0F0D1C] border border-[#252345] rounded-3xl overflow-hidden shadow-2xl shadow-black/60">

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-5 pb-1">
          {STEPS.map((_, i) => (
            <button key={i} type="button" onClick={() => setStep(i)}
              className="rounded-full transition-all duration-300"
              style={{ width: i === step ? 20 : 6, height: 6, background: i === step ? "#10B981" : i < step ? "#10B98160" : "#252345" }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-8 text-center space-y-4">
          <div className="text-5xl">{current.icon}</div>
          <h2 className="text-xl font-black text-[#F1F5F9] leading-tight">{current.title}</h2>
          <p className="text-sm text-[#7B8DB4] leading-relaxed">{current.desc}</p>

          {current.action && (
            <Link href={current.action.href} onClick={finish}
              className="inline-block mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
              {current.action.label}
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 pb-7 gap-3">
          <button type="button" onClick={finish}
            className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
            Skip
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 rounded-xl border border-[#252345] text-xs font-semibold text-[#7B8DB4] hover:border-[#333368] transition-all">
                Back
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={finish}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all">
                Let&apos;s go →
              </button>
            ) : (
              <button type="button" onClick={() => setStep(s => s + 1)}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all">
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
