"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
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
  { text: "Everything in Free",                                       highlight: false },
  { text: "Unlimited deep AI analysis per signal",                    highlight: true  },
  { text: "Morning briefing email at market open (8:30am ET)",        highlight: true  },
  { text: "Live market scanner — top options plays",                   highlight: true  },
  { text: "Wheeling Hub CSP scanner with live IV data",               highlight: false },
  { text: "Options analysis with expected move & Greeks",              highlight: false },
  { text: "AI trade journal — auto-written after every trade",         highlight: false },
  { text: "AI coaching after every 10 closed trades",                  highlight: false },
  { text: "Signal Track Record — T+3 win-rate backtest",              highlight: false },
  { text: "Risk Guard — automatic stop monitoring",                    highlight: false },
  { text: "Futures signals — ES, NQ, GC, CL + more",                  highlight: false },
  { text: "Priority signal alerts via browser notifications",          highlight: false },
];

function PricingContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const featureParam = searchParams.get("feature");
  const errorParam   = searchParams.get("error");

  const [loading,    setLoading]    = useState(false);
  const [checking,   setChecking]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [userPlan,   setUserPlan]   = useState<"pro" | "free" | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") { setPlanLoaded(true); return; }
    if (status !== "authenticated")   return;
    fetch("/api/user/plan")
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUserPlan(data?.plan === "pro" ? "pro" : "free"); })
      .catch(() => setUserPlan("free"))
      .finally(() => setPlanLoaded(true));
  }, [status]);

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
      if (data.plan === "pro") { window.location.href = "/dashboard"; }
      else { setError("No active subscription found yet. It can take a minute after payment — try again shortly."); }
    } catch { setError("Could not check subscription. Try again."); }
    finally { setChecking(false); }
  }

  const isPro  = userPlan === "pro";
  const isFree = userPlan === "free" || !session;

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col px-6 py-12">

      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors mb-10 self-start">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to home
      </Link>

      <div className="max-w-5xl mx-auto w-full">

        {/* Feature gate banner */}
        {featureParam && (
          <div className="mb-8 max-w-2xl mx-auto">
            <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
              errorParam === "plan-check" ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"
            }`}>
              <span className="text-xl shrink-0 mt-0.5">{errorParam === "plan-check" ? "⚠️" : "🔒"}</span>
              <div>
                <p className="text-sm font-bold text-[#F1F5F9] mb-1">
                  {errorParam === "plan-check" ? "Couldn't verify your plan" : `${featureParam} requires Pro`}
                </p>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">
                  {errorParam === "plan-check"
                    ? "We couldn't reach the plan check service. If you're already a Pro subscriber, click \"Already subscribed?\" below."
                    : `Upgrade to Pro to access ${featureParam} and every other AI-powered feature.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs text-amber-400 font-bold mb-6">
            🔐 Early access pricing — lock in $5/mo forever
          </div>
          <h1 className="reveal text-5xl font-black mb-3 tracking-tight">Simple pricing.</h1>
          <p className="reveal reveal-d1 text-[#7B8DB4] text-lg">$5/mo. Cancel anytime. No hidden fees.</p>
        </div>

        {/* Savings callout */}
        <div className="max-w-2xl mx-auto mb-10">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <p className="text-xs text-[#4B5675] mb-1">Most users save vs alternatives</p>
              <p className="text-sm font-bold text-[#F1F5F9]">
                <span className="line-through text-[#4B5675]">$118/mo</span>
                <span className="text-[#4B5675]"> Trade Ideas &nbsp;·&nbsp; </span>
                <span className="line-through text-[#4B5675]">$49/mo</span>
                <span className="text-[#4B5675]"> Signal Stack</span>
              </p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-2xl font-black text-emerald-400">Save $113+</p>
              <p className="text-[10px] text-[#4B5675]">per month vs Trade Ideas</p>
            </div>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Free */}
          <div className={`reveal card-hover-lift bg-[#13112A] border rounded-2xl p-8 flex flex-col ${
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
          <div className={`reveal reveal-d1 pricing-glow-border card-hover-lift bg-[#13112A] rounded-2xl p-8 flex flex-col relative overflow-hidden border-2 ${
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
              <p className="text-4xl font-black">$5<span className="text-lg font-normal text-[#4B5675]">/mo</span></p>
              <p className="text-xs text-[#4B5675] mt-1">Billed monthly · cancel anytime</p>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {PRO_FEATURES.map(f => (
                <li key={f.text} className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-400 text-xs font-bold shrink-0">✓</span>
                  <span className={f.highlight ? "text-[#F1F5F9] font-medium" : "text-[#CBD5E1]"}>{f.text}</span>
                </li>
              ))}
            </ul>

            {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

            {planLoaded && isPro ? (
              <div className="space-y-2">
                <Link href="/dashboard"
                  className="btn-morph w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-bold text-white shadow-lg shadow-emerald-500/20 text-center block">
                  Go to Dashboard →
                </Link>
                <Link href="/settings"
                  className="w-full py-2.5 px-4 rounded-xl border border-[#252345] hover:border-emerald-500/40 transition-colors text-xs font-semibold text-[#7B8DB4] hover:text-emerald-400 text-center block">
                  Manage subscription in Settings →
                </Link>
              </div>
            ) : (
              <>
                <button type="button" onClick={handleUpgrade} disabled={loading}
                  className="btn-morph w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors text-sm font-bold text-white shadow-lg shadow-emerald-500/20">
                  {loading ? "Redirecting to checkout…" : session ? "Subscribe for $5/mo →" : "Sign in to subscribe →"}
                </button>
                {session && (
                  <button type="button" onClick={handleCheckAccess} disabled={checking}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#252345] hover:border-emerald-500/40 disabled:opacity-50 transition-colors text-xs font-semibold text-[#7B8DB4] hover:text-emerald-400 mt-2">
                    {checking ? "Checking…" : "Already subscribed? Click here →"}
                  </button>
                )}
              </>
            )}

            <p className="text-[10px] text-[#4B5675] text-center mt-3">Secure checkout via Ko-fi · cancel anytime from Settings</p>

            {session && (
              <p className="text-[10px] text-[#4B5675] text-center mt-2">
                Signed in as <span className="text-[#7B8DB4]">{session.user?.email}</span> ·{" "}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-emerald-500 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline"
                >
                  Switch account
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Trust badges */}
        <div className="max-w-2xl mx-auto mt-8">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {[
              { icon:"🔒", label:"Secure checkout via Ko-fi" },
              { icon:"🤖", label:"Powered by Anthropic Claude" },
              { icon:"🔑", label:"Sign in with Google" },
              { icon:"❌", label:"Cancel anytime, no questions" },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-1.5 text-[11px] text-[#4B5675]">
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="max-w-3xl mx-auto mt-16 mb-4">
          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[#2D3A52] font-bold mb-6">What traders say</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { quote: "Morning briefing alone pays for itself. I know the macro setup before I touch a chart.", name: "Austin L.", role: "Swing trader" },
              { quote: "Finally an app that explains WHY it's a BUY. The AI reasoning is solid.", name: "rangepk3r", role: "Community admin" },
              { quote: "$5 for what others charge $49+ for? It's a no-brainer if you trade at all.", name: "Benie K.", role: "Options trader" },
            ].map((t, i) => (
              <div key={i} className="bg-[#0D0B1A] border border-[#1C1933] rounded-2xl p-5 space-y-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="text-xs font-bold text-[#E2E8F0]">{t.name}</p>
                  <p className="text-[10px] text-[#4B5675]">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-xl mx-auto space-y-3">
          <h2 className="text-xl font-black text-center mb-8">Common questions</h2>
          {[
            {
              q: "What do I get with Pro?",
              a: "Full access to all AI features: deep market analysis, morning briefing emails, market scanner, options analysis, real position tracker with AI insights, auto trade journal, AI coaching, and Risk Guard.",
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes — cancel from your Settings page at any time. You keep access until the end of your billing period. No questions asked.",
            },
            {
              q: "Do I need a credit card to start?",
              a: "No credit card required for the Free plan. You only need to pay when you upgrade to Pro. The checkout is handled securely by Ko-fi.",
            },
            {
              q: "How fast does access activate?",
              a: 'Instantly after payment. Click "Already subscribed?" on this page to sync your plan if it doesn\'t update automatically.',
            },
            {
              q: "Is my payment secure?",
              a: "All payments are processed by Ko-fi. Traxora never sees or stores your card details.",
            },
            {
              q: "Is this real trading advice?",
              a: "Traxora is a signal research and analysis tool for educational purposes only. Nothing on this platform constitutes financial advice. Always manage your own risk.",
            },
          ].map(({ q, a }) => (
            <details key={q} className="group bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden hover:border-[#333368] transition-colors">
              <summary className="flex items-center justify-between px-6 py-5 cursor-pointer">
                <p className="font-bold text-sm text-[#F1F5F9] pr-4">{q}</p>
                <span className="shrink-0 text-[#4B5675] transition-transform duration-300 group-open:rotate-180">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </summary>
              <p className="px-6 pb-6 text-sm text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-4">{a}</p>
            </details>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-2xl font-black mb-3">Still on the fence?</p>
          <p className="text-sm text-[#7B8DB4] mb-6">Start free. No credit card. Upgrade whenever you&rsquo;re ready.</p>
          <Link href="/" className="inline-block bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95">
            Back to home →
          </Link>
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
