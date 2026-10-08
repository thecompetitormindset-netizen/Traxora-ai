"use client";

import { useEffect, useState } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import Link from "next/link";

const WELCOME_KEY = "traxora_welcome_seen";

const FEATURES = [
  { icon: "📡", title: "AI Signals", desc: "BUY / SELL / HOLD on any stock in seconds" },
  { icon: "📊", title: "Volume Profile", desc: "POC, VAH, VAL on every analysis" },
  { icon: "🔍", title: "Market Scanner", desc: "Top setups across 20+ stocks" },
  { icon: "📈", title: "Options Analysis", desc: "Strike recommendations + expected move" },
  { icon: "📓", title: "Trade Journal", desc: "AI writes your journal automatically" },
  { icon: "📧", title: "Morning Briefing", desc: "Pre-market email before every open" },
];

export default function WelcomeModal() {
  const { data: session, status } = useAppSession();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const seen = localStorage.getItem(WELCOME_KEY);
    // Wait until the onboarding tour is done so the two modals never stack
    const onboarded = localStorage.getItem("traxora_onboarded_v2");
    if (!seen && onboarded) setVisible(true);
  }, [status, session]);

  function dismiss() {
    localStorage.setItem(WELCOME_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const rawName   = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "there";
  const firstName = rawName.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#13112A] border border-[#252345] rounded-3xl w-full max-w-lg shadow-2xl shadow-black/50 overflow-hidden">

        {/* Header */}
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-5 text-center relative">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute top-4 right-4 text-[#4B5675] hover:text-[#F1F5F9] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/25">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-[#F1F5F9]">Welcome, {firstName}! 👋</h2>
          <p className="text-sm text-[#7B8DB4] mt-1">You're now inside Traxora AI — here's what you can do</p>
        </div>

        {/* Features grid */}
        <div className="px-6 py-5 grid grid-cols-2 gap-3">
          {FEATURES.map(f => (
            <div key={f.title} className="flex items-start gap-2.5 bg-[#0D0B1A] rounded-xl p-3 border border-[#252345]">
              <span className="text-lg shrink-0">{f.icon}</span>
              <div>
                <p className="text-xs font-bold text-[#F1F5F9]">{f.title}</p>
                <p className="text-[10px] text-[#4B5675] mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="px-6 pb-2">
          <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">Quick start</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "Go to Signals",
              "Type a ticker (e.g. NVDA)",
              "Read the AI signal",
              "Run Deep Analysis",
            ].map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-xs text-[#CBD5E1]">{s}</span>
                {i < 3 && <span className="text-[#252345] text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Pricing note */}
        <div className="px-6 py-4 mx-6 mb-4 mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <p className="text-xs text-emerald-400 font-semibold">⚡ Start free — Pro is just $5/mo</p>
          <p className="text-[10px] text-[#4B5675] mt-0.5">Unlock everything — deep signals, scanner, briefings, paper trading — for less than one bad trade.</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Link
            href="/guide"
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl border border-[#252345] hover:border-emerald-500/40 text-xs font-semibold text-[#7B8DB4] hover:text-emerald-400 transition-colors text-center"
          >
            Read the Guide
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors"
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}
