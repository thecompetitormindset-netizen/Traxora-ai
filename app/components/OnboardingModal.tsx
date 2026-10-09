"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

const ONBOARD_KEY = "traxora_onboarded_v2";

// First-visit intro: three short steps in plain words.
const STEPS: { icon: IconName; title: string; desc: string; action: { label: string; href: string } | null }[] = [
  {
    icon: "trend-up",
    title: "Welcome to Traxora",
    desc: "We look at market prices and tell you in plain words whether something looks worth practising — or why it’s better to wait.",
    action: null,
  },
  {
    icon: "search",
    title: "Check any stock",
    desc: "Search a company at the top of the page. You’ll get a simple answer — leaning buy, leaning sell, or wait — and the reasons why.",
    action: null,
  },
  {
    icon: "coins",
    title: "Practise with pretend money",
    desc: "Try trades with pretend money at real prices. It’s free, and nothing here ever uses real money.",
    action: { label: "Start practice trading", href: "/paper" },
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

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="onboard-title"
        className="w-full sm:max-w-sm bg-[var(--mx-surface)] border border-[var(--mx-line)] sm:rounded-[18px] rounded-t-[18px] overflow-hidden text-[var(--mx-text)]">
        <div className="h-0.5 bg-[var(--mx-raised-2)]">
          <div className="h-full bg-[var(--mx-text)] transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <div className={`${slideClass} px-7 pt-8 text-center`}>
          <span className="inline-grid place-items-center w-14 h-14 rounded-[14px] border border-[var(--mx-line)] text-[var(--mx-text)]">
            <Icon name={current.icon} size={26} />
          </span>
          <p className="mt-5 text-[12px] text-[var(--mx-text-3)]">Step {step + 1} of {STEPS.length}</p>
          <h2 id="onboard-title" className="mt-1 text-[20px] leading-tight">{current.title}</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--mx-text-2)]">{current.desc}</p>
          {current.action && (
            <Link href={current.action.href} onClick={finish}
              className="mt-5 inline-flex h-10 px-5 items-center rounded-full border border-[var(--mx-line-strong)] text-[14px] hover:border-[var(--mx-text)]">
              {current.action.label}
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between px-7 py-6 gap-3">
          <button type="button" onClick={finish} className="text-[14px] text-[var(--mx-text-3)] hover:text-[var(--mx-text)]">Skip</button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button type="button" onClick={back} className="h-10 px-4 rounded-full border border-[var(--mx-line)] text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Back</button>
            )}
            <button type="button" onClick={next} className="h-10 px-5 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
