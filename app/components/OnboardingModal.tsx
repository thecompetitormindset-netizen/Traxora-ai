"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ONBOARD_KEY = "traxora_onboarded_v2";

const STEPS = [
  {
    icon: "⚡",
    color: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/20",
    title: "Welcome to Traxora AI",
    desc: "Get institutional-grade Smart Money signals for any stock or futures contract. BUY, HOLD, or SELL — with exact entry zones, stop losses, and take-profit targets.",
    action: null,
  },
  {
    icon: "📊",
    color: "from-violet-500/20 to-blue-500/10",
    border: "border-violet-500/20",
    title: "Build your watchlist",
    desc: "Tap Edit on the Dashboard watchlist to add your stocks. Traxora scans them every minute for live signals — sorted by signal strength so the best setups are always first.",
    action: { label: "Go to Dashboard →", href: "/dashboard" },
  },
  {
    icon: "🌅",
    color: "from-amber-500/20 to-orange-500/10",
    border: "border-amber-500/20",
    title: "Read the morning brief",
    desc: "Every trading day, tap the sunrise card on your dashboard. Full AI brief — macro overview, top options plays, futures setups, and key levels to watch that session.",
    action: null,
  },
  {
    icon: "🎯",
    color: "from-cyan-500/20 to-blue-500/10",
    border: "border-cyan-500/20",
    title: "Plan and size every trade",
    desc: "After an analysis, tap Buy on Paper to size your position. The Planner calculates share count, risk per trade, and R:R — so you never over-leverage. Your journal updates automatically.",
    action: { label: "Open Planner →", href: "/paper" },
  },
  {
    icon: "🚀",
    color: "from-rose-500/20 to-pink-500/10",
    border: "border-rose-500/20",
    title: "You're ready to trade smart",
    desc: "Signals run 24/7. Your journal builds as you trade. Check Stats weekly to track your win rate and edge. Need help? Ask the AI chat button anytime.",
    action: { label: "View Performance →", href: "/strategy" },
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState(0);
  const [exiting, setExiting] = useState(false);
  const [exitDir, setExitDir] = useState<"fwd" | "bwd">("fwd");

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setVisible(true);
    } catch { /* ssr */ }
  }, []);

  function finish() {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  function goTo(next: number, direction: "fwd" | "bwd") {
    if (exiting) return;
    setExitDir(direction);
    setExiting(true);
    setTimeout(() => {
      setStep(next);
      setExiting(false);
    }, 180);
  }

  function next() {
    if (step < STEPS.length - 1) goTo(step + 1, "fwd");
    else finish();
  }

  function back() {
    if (step > 0) goTo(step - 1, "bwd");
  }

  if (!visible) return null;

  const current  = STEPS[step];
  const isLast   = step === STEPS.length - 1;
  const slideClass = exiting
    ? `onboard-slide ${exitDir === "fwd" ? "exit-fwd" : "exit-bwd"}`
    : "onboard-slide";

  // 5 steps → fixed Tailwind width classes (no inline style needed)
  const PROGRESS_W = ["w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"] as const;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-[#0A0815] border border-[#252345] sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl shadow-black/60">

        {/* Progress bar */}
        <div className="h-0.5 bg-[#1A1838]">
          <div className={`h-full bg-emerald-500 transition-all duration-500 ease-out ${PROGRESS_W[step]}`} />
        </div>

        {/* Icon stage */}
        <div className={`bg-gradient-to-b ${current.color} px-8 pt-8 pb-6 text-center`}>
          <div className={`${slideClass} inline-flex items-center justify-center w-20 h-20 rounded-3xl border ${current.border} bg-black/20 backdrop-blur-sm mb-4`}>
            <span className="text-4xl">{current.icon}</span>
          </div>
          <div className={slideClass}>
            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Step {step + 1} of {STEPS.length}</p>
            <h2 className="text-lg font-black text-[#F1F5F9] leading-tight">{current.title}</h2>
          </div>
        </div>

        {/* Body */}
        <div className={`${slideClass} px-7 pt-5 pb-2`}>
          <p className="text-sm text-[#7B8DB4] leading-relaxed text-center">{current.desc}</p>
          {current.action && (
            <div className="flex justify-center mt-4">
              <Link href={current.action.href} onClick={finish}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors border border-emerald-500/25 bg-emerald-500/8 px-4 py-2 rounded-xl">
                {current.action.label}
              </Link>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 py-4">
          {STEPS.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => i !== step && goTo(i, i > step ? "fwd" : "bwd")}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? "w-[18px] h-[5px] bg-emerald-500"
                  : i < step
                  ? "w-[5px] h-[5px] bg-emerald-500/40"
                  : "w-[5px] h-[5px] bg-[#252345]"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 pb-7 pt-1 gap-3">
          <button type="button" onClick={finish}
            className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
            Skip
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button type="button" onClick={back}
                className="px-4 py-2.5 rounded-xl border border-[#252345] text-xs font-semibold text-[#7B8DB4] hover:border-[#333368] transition-all">
                ← Back
              </button>
            )}
            <button type="button" onClick={next}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition-all">
              {isLast ? "Let's go 🚀" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
