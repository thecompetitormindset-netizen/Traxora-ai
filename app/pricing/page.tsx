"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const FREE_FEATURES = [
  "Live watchlist with BUY / SELL / HOLD signals",
  "AI chat — 25 questions/day",
  "Market sentiment tracker",
  "IPO tracker",
  "Wheeling Hub position tracker",
  "Community guide",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited deep AI analysis per signal",
  "Morning briefing email at market open (8:30am ET)",
  "Live market scanner — top options plays",
  "Wheeling Hub CSP scanner with live IV data",
  "Options analysis with expected move & Greeks",
  "AI trade journal — auto-written after every trade",
  "AI coaching after every 10 closed trades",
  "Signal Track Record — T+3 win-rate backtest",
  "Risk Guard — automatic stop monitoring",
  "Futures signals — ES, NQ, GC, CL + more",
  "Priority signal alerts via browser notifications",
];

type BillingCycle = "monthly" | "annual";

function PricingContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const featureParam = searchParams.get("feature");
  const errorParam   = searchParams.get("error");

  const [loading,      setLoading]      = useState(false);
  const [checking,     setChecking]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [userPlan,     setUserPlan]     = useState<"pro" | "free" | null>(null);
  const [planLoaded,   setPlanLoaded]   = useState(false);
  const [billing,      setBilling]      = useState<BillingCycle>("monthly");

  // Detect current plan on mount
  useEffect(() => {
    if (status === "unauthenticated") { setPlanLoaded(true); return; }
    if (status !== "authenticated")   return;
    fetch("/api/user/plan")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUserPlan(data?.plan === "pro" ? "pro" : "free");
      })
      .catch(() => setUserPlan("free"))
      .finally(() => setPlanLoaded(true));
  }, [status]);

  // If already Pro, redirect to dashboard unless they arrived via a feature gate
  useEffect(() => {
    if (userPlan === "pro" && !featureParam) {
      window.location.href = "/dashboard";
    }
  }, [userPlan, featureParam]);

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

  const isPro  = userPlan === "pro";
  const isFree = userPlan === "free" || !session;

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col items-center justify-center px-6 py-16">
      <Link href="/dashboard" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </Link>

      <div className="max-w-4xl w-full">

        {/* Feature gate banner — shown when redirected from PaywallGuard */}
        {featureParam && (
          <div className="mb-8 max-w-2xl mx-auto">
            <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
              errorParam === "plan-check"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-emerald-500/10 border-emerald-500/30"
            }`}>
              <span className="text-xl shrink-0 mt-0.5">{errorParam === "plan-check" ? "⚠️" : "🔒"}</span>
              <div>
                <p className="text-sm font-bold text-[#F1F5F9] mb-1">
                  {errorParam === "plan-check"
                    ? "Couldn't verify your plan"
                    : `${featureParam} requires Pro`}
                </p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  {errorParam === "plan-check"
                    ? "We couldn't reach the plan check service. If you're already a Pro subscriber, click \"Already subscribed?\" below. Otherwise, upgrade to unlock all features."
                    : `Upgrade to Pro to access ${featureParam} and every other AI-powered feature.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black mb-4">Simple pricing.</h1>
          <p className="text-[#7B8DB4] text-lg">Cancel anytime. No hidden fees.</p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center mb-10">
          <div className="flex items-center bg-[#13112A] border border-[#252345] rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === "monthly"
                  ? "bg-[#252345] text-[#F1F5F9]"
                  : "text-[#4B5675] hover:text-[#7B8DB4]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                billing === "annual"
                  ? "bg-[#252345] text-[#F1F5F9]"
                  : "text-[#4B5675] hover:text-[#7B8DB4]"
              }`}
            >
              Annual
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold">Save 18%</span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Free */}
          <div className={`bg-[#13112A] border rounded-2xl p-8 flex flex-col ${
            planLoaded && isFree ? "border-[#7B8DB4]/40 ring-1 ring-[#7B8DB4]/20" : "border-[#252345]"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-[#4B5675] font-bold">Free</p>
              {planLoaded && isFree && (
                <span className="text-[10px] bg-[#7B8DB4]/20 text-[#7B8DB4] border border-[#7B8DB4]/30 px-2 py-0.5 rounded-full font-bold">Current plan</span>
              )}
            </div>
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
              {planLoaded && isFree ? "Your current plan" : session ? "Current plan" : "Get started free"}
            </div>
          </div>

          {/* Pro */}
          <div className={`bg-[#13112A] rounded-2xl p-8 flex flex-col relative overflow-hidden border-2 ${
            planLoaded && isPro ? "border-emerald-400/80" : "border-emerald-500/40"
          }`}>
            <div className="absolute inset-0 bg-emerald-500/[0.03] pointer-events-none" />
            <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Pro</p>
              {planLoaded && isPro
                ? <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">✓ Active</span>
                : <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">Most popular</span>
              }
            </div>
            <div className="mb-8">
              {billing === "monthly" ? (
                <>
                  <p className="text-4xl font-black">$5<span className="text-lg font-normal text-[#4B5675]">/mo</span></p>
                  <p className="text-xs text-[#4B5675] mt-1">Billed monthly · cancel anytime</p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black">$49<span className="text-lg font-normal text-[#4B5675]">/yr</span></p>
                    <span className="text-xs text-emerald-400 font-bold">≈ $4.08/mo</span>
                  </div>
                  <p className="text-xs text-[#4B5675] mt-1">Billed once yearly · cancel anytime · save $11</p>
                </>
              )}
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <span className="text-emerald-400 text-xs font-bold">✓</span> {f}
                </li>
              ))}
            </ul>

            {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

            {planLoaded && isPro ? (
              <div className="space-y-2">
                <Link
                  href="/dashboard"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-bold text-white shadow-lg shadow-emerald-500/20 text-center block"
                >
                  Go to Dashboard →
                </Link>
                <Link
                  href="/settings"
                  className="w-full py-2.5 px-4 rounded-xl border border-[#252345] hover:border-emerald-500/40 transition-colors text-xs font-semibold text-[#7B8DB4] hover:text-emerald-400 text-center block"
                >
                  Manage subscription in Settings →
                </Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm font-bold text-white shadow-lg shadow-emerald-500/20"
                >
                  {loading
                    ? "Redirecting to checkout…"
                    : session
                      ? billing === "annual" ? "Subscribe for $49/yr →" : "Subscribe for $5/mo →"
                      : "Sign in to subscribe →"
                  }
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
              </>
            )}

            <p className="text-[10px] text-[#4B5675] text-center mt-3">
              Secure checkout via Ko-fi · cancel anytime from Settings{billing === "annual" ? " · annual billed upfront" : ""}
            </p>
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

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}
