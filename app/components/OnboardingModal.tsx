"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ONBOARD_KEY = "traxora_onboarded_v1";

const STEPS = [
  {
    icon: "🌅",
    title: "Start with the Morning Brief",
    desc: "Every morning Traxora AI scans 35+ instruments and delivers a full market brief with the top plays, options setups, and macro context — tap the sunrise icon in the top bar.",
    action: null,
  },
  {
    icon: "⚡",
    title: "Run a signal on any ticker",
    desc: "Go to Signals → type any stock or futures symbol → hit Analyze. You'll get a BUY/SELL/HOLD verdict with entry zone, stop loss, and take profit in seconds.",
    action: { label: "Go to Signals →", href: "/analysis" },
  },
  {
    icon: "📋",
    title: "Paper trade to build confidence",
    desc: "Every signal has a one-tap 'Buy Long' or 'Sell Short' button that opens a paper trade. Track your P&L, review your journal, and refine your edge before risking real money.",
    action: { label: "Open Paper Portfolio →", href: "/paper" },
  },
  {
    icon: "🎯",
    title: "You're all set",
    desc: "Traxora AI runs 24/7. The morning email lands at 5:30am ET on trading days. Check your journal weekly to track your improvement.",
    action: null,
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
