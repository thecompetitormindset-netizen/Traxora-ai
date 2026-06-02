"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const FREE_FEATURES = [
  "Dashboard with live signals",
  "Market sentiment tracker",
  "IPO tracker",
  "AI chat",
  "Community guide",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Deep AI analysis (unlimited)",
  "Morning briefing email at market open",
  "Market scanner — top 3 live setups",
  "Real Positions tracker + AI insights",
  "Options analysis with expected move",
  "Auto trade journal (AI-written)",
  "AI coaching every 10 closed trades",
  "Risk Guard automatic stop execution",
];

export default function PricingPage() {
  const { data: session } = useSession();
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleUpgrade() {
    if (!session) { window.location.href = "/login?callbackUrl=/pricing"; return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/kofi/checkout", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      setError(data.error ?? "Something went wrong. Try again.");
    } catch { setError("Failed to start checkout. Try again."); }
    finally { setLoading(false); }
  }

  async function handleCheckAccess() {
    setChecking(true);
    setError(null);
    try {
      const res  = await fetch("/api/user/plan");
      const data = await res.json() as { plan: string };
      if (data.plan === "pro") {
        window.location.href = "/dashboard";
      } else {
        setError("No active subscription found yet. It can take a minute after payment — try again shortly.");
      }
    } catch { setError("Could not check subscription. Try again."); }
    finally { setChecking(false); }
  }

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col items-center justify-center px-6 py-16">
      <Link href="/dashboard" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </Link>

      <div className="max-w-4xl w-full">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black mb-4">Simple pricing.</h1>
          <p className="text-[#7B8DB4] text-lg">$5 a month. Cancel anytime. No hidden fees.</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Free */}
          <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 flex flex-col">
            <p className="text-[10px] uppercase tracking-widest text-[#4B5675] font-bold mb-3">Free</p>
            <div className="mb-8">
              <p className="text-4xl font-black">$0</p>
              <p className="text-xs text-[#4B5675] mt-1">Forever free</p>
            </div>
            <ul className="space-y-3 flex-1 mb-8">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-[#7B8DB4]">
                  <span className="text-[#4B5675] text-xs">✓</span> {f}
                </li>
              ))}
            </ul>
            <div className="py-2.5 px-4 rounded-xl border border-[#252345] text-center text-sm text-[#4B5675] font-semibold">
              {session ? "Current plan" : "Get started free"}
            </div>
          </div>

          {/* Pro */}
          <div className="bg-[#13112A] border-2 border-emerald-500/40 rounded-2xl p-8 flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/[0.03] pointer-events-none" />
            <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Pro</p>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">Most popular</span>
            </div>
            <div className="mb-8">
              <p className="text-4xl font-black">$5<span className="text-lg font-normal text-[#4B5675]">/mo</span></p>
              <p className="text-xs text-[#4B5675] mt-1">Billed monthly · cancel anytime</p>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <span className="text-emerald-400 text-xs font-bold">✓</span> {f}
                </li>
              ))}
            </ul>

            {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

            <button
              type="button"
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm font-bold text-white shadow-lg shadow-emerald-500/20"
            >
              {loading ? "Redirecting to checkout…" : session ? "Subscribe for $5/mo →" : "Sign in to subscribe →"}
            </button>

            {session && (
              <button
                type="button"
                onClick={handleCheckAccess}
                disabled={checking}
                className="w-full py-2.5 px-4 rounded-xl border border-[#252345] hover:border-emerald-500/40 disabled:opacity-50 transition-colors text-xs font-semibold text-[#7B8DB4] hover:text-emerald-400 mt-2"
              >
                {checking ? "Checking…" : "Already subscribed? Click here →"}
              </button>
            )}

            <p className="text-[10px] text-[#4B5675] text-center mt-3">Secure checkout via Ko-fi · cancel anytime from Settings</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-xl mx-auto space-y-6">
          <h2 className="text-xl font-black text-center mb-8">Questions</h2>
          {[
            {
              q: "What do I get with Pro?",
              a: "Full access to all AI features: deep market analysis, morning briefing emails, market scanner, options analysis, real position tracker with AI insights, auto trade journal, coaching, and Risk Guard.",
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes — cancel from your Settings page at any time. You keep access until the end of your billing period. No questions asked.",
            },
            {
              q: "Is my payment secure?",
              a: "All payments are processed by Ko-fi. Traxora never sees or stores your card details.",
            },
            {
              q: "Is this real trading?",
              a: "Traxora is a signal research and analysis tool for educational purposes only. Nothing on this platform constitutes financial advice. Manage risk carefully.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-[#252345] pb-6">
              <p className="text-sm font-bold text-[#F1F5F9] mb-2">{q}</p>
              <p className="text-sm text-[#7B8DB4] leading-relaxed">{a}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
