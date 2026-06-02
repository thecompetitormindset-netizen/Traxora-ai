"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const AUTH_ERRORS: Record<string, string> = {
  OAuthCallback:         "Google sign-in failed. Ensure this app is authorized in Google Cloud Console.",
  OAuthAccountNotLinked: "This Google account is linked to a different sign-in method.",
  Configuration:         "Auth configuration error — check AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in Vercel.",
  AccessDenied:          "Access denied by Google.",
  Default:               "Sign-in failed. Please try again.",
};

const BENEFITS = [
  { icon: "📡", title: "Real-time AI signals", desc: "BUY / SELL / HOLD on any stock or futures contract in seconds." },
  { icon: "📊", title: "Volume profile analysis", desc: "POC, VAH, VAL, HVN & LVN levels embedded into every signal." },
  { icon: "🔍", title: "Market scanner", desc: "AI scans 20+ stocks simultaneously and surfaces the top setups." },
  { icon: "📈", title: "Options analysis", desc: "Expected move, directional bias, and specific strike recommendations." },
  { icon: "📓", title: "Auto trade journal", desc: "AI writes your journal entry after every trade you close." },
  { icon: "📧", title: "Morning briefing email", desc: "Pre-market analysis delivered to your inbox before the open." },
];

const STEPS = [
  { n: "1", text: "Click \"Continue with Google\" →" },
  { n: "2", text: "Select your Google account" },
  { n: "3", text: "You're in — dashboard loads instantly" },
];

function LoginContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode   = searchParams.get("error");
  const errorMsg    = errorCode ? (AUTH_ERRORS[errorCode] ?? AUTH_ERRORS.Default) : null;
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  useEffect(() => {
    const justSignedOut = searchParams.get("signedOut");
    if (session && !justSignedOut) router.push("/dashboard");
  }, [session, router, searchParams]);

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col lg:flex-row">

      {/* Left — intro panel */}
      <div className="flex-1 flex flex-col justify-center px-8 py-16 lg:px-16 lg:max-w-xl">
        {/* Back */}
        <Link href="/" className="flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors mb-12 w-fit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to home
        </Link>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="text-lg font-bold">Traxora AI</span>
        </div>

        <h1 className="text-3xl font-black mb-2">Trade smarter with AI.</h1>
        <p className="text-[#7B8DB4] text-sm leading-relaxed mb-10">
          Institutional-grade Smart Money analysis for every trader. Powered by Claude AI — the most advanced AI model available.
        </p>

        {/* Benefits */}
        <div className="space-y-4 mb-10">
          {BENEFITS.map(b => (
            <div key={b.title} className="flex items-start gap-3">
              <span className="text-lg mt-0.5 shrink-0">{b.icon}</span>
              <div>
                <p className="text-sm font-bold text-[#F1F5F9]">{b.title}</p>
                <p className="text-xs text-[#4B5675] mt-0.5 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* How to sign in */}
        <div className="border-t border-[#252345] pt-6">
          <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-4">How to get started</p>
          <div className="space-y-3">
            {STEPS.map(s => (
              <div key={s.n} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-black flex items-center justify-center shrink-0">{s.n}</span>
                <p className="text-sm text-[#CBD5E1]">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — sign in card */}
      <div className="flex-1 flex items-center justify-center px-8 py-16 lg:bg-[#0D0B1A]/50 lg:border-l lg:border-[#252345]">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold mb-1">Sign in to Traxora AI</h2>
          <p className="text-sm text-[#7B8DB4] mb-6">Start with a 30-second setup. No credit card required to try.</p>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
              {errorMsg}
            </div>
          )}

          <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-6 space-y-4">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 transition-colors text-gray-900 font-semibold py-3 px-5 rounded-xl text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="border-t border-[#252345] pt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#4B5675]">
                <span className="text-emerald-400">✓</span> No password needed
              </div>
              <div className="flex items-center gap-2 text-xs text-[#4B5675]">
                <span className="text-emerald-400">✓</span> Instant access — no waiting
              </div>
              <div className="flex items-center gap-2 text-xs text-[#4B5675]">
                <span className="text-emerald-400">✓</span> Pro plan required for full access — $5/mo
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-[#4B5675] mt-5 leading-relaxed">
            For informational purposes only — not financial advice.
          </p>

          <div className="mt-4 text-center">
            <Link href="/guide" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
              Read the guide first →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
