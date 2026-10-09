"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "../components/Icon";

const AUTH_ERRORS: Record<string, string> = {
  OAuthCallback:         "Google sign-in failed. Check that the Google Cloud Console has this app's redirect URI registered.",
  OAuthAccountNotLinked: "This Google account is linked to a different sign-in method.",
  Configuration:         "Auth configuration error — check AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in Vercel.",
  AccessDenied:          "Sign-in not permitted. If this app is in private mode, contact the owner to be added. Otherwise, the Google OAuth app may need to be published in Google Cloud Console.",
  Default:               "Sign-in failed. Please try again.",
};

// What signing in adds. Everything else works without an account.
const BENEFITS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "sparkle", title: "Ask AI", desc: "Ask questions about any stock or the app." },
  { icon: "phone", title: "On all your devices", desc: "Your practice trades and watchlist follow you." },
  { icon: "mail", title: "Morning email", desc: "A short summary before the market opens." },
];

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Twitter|LinkedInApp|MicroMessenger|WhatsApp|Telegram|Line\/|Snapchat|TikTok|Pinterest|Reddit|GSA\//.test(ua);
}


function LoginContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode   = searchParams.get("error");
  const errorMsg    = errorCode ? (AUTH_ERRORS[errorCode] ?? AUTH_ERRORS.Default) : null;
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    setInAppBrowser(isInAppBrowser());
  }, []);

  const justSignedOut = searchParams.get("signedOut");

  useEffect(() => {
    if (session && !justSignedOut) {
      window.location.href = callbackUrl;
    }
  }, [session, justSignedOut, callbackUrl]);

  // Already signed in — let them go to dashboard or switch account
  if (session && !justSignedOut) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center flex-col gap-4">
        <svg className="animate-spin text-[var(--accent)]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p className="text-sm text-[var(--text-muted)]">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col-reverse lg:flex-row">

      {/* Left — intro panel */}
      <div className="flex-1 flex flex-col justify-center px-8 py-16 lg:px-16 lg:max-w-xl">
        {/* Back */}
        <Link href="/" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-12 w-fit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to home
        </Link>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-[8px] bg-[var(--mx-text)] text-[var(--mx-canvas)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="text-[17px]">traxora</span>
        </div>

        <h1 className="text-[28px] mb-2 tracking-[-0.02em]">Sign in to keep your progress.</h1>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-10">
          Everything in Traxora works without an account. Signing in adds a few extras:
        </p>

        {/* Benefits */}
        <div className="space-y-4">
          {BENEFITS.map(b => (
            <div key={b.title} className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-[10px] border border-[var(--mx-line)] flex items-center justify-center shrink-0"><Icon name={b.icon} size={18} /></span>
              <div>
                <p className="text-[14px] text-[var(--mx-text)]">{b.title}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — sign in card */}
      <div className="flex-1 relative flex items-center justify-center px-8 py-16 bg-[var(--bg-elevated)] lg:border-l lg:border-[var(--border)] overflow-hidden">
        {/* Backdrop — dot grid + accent glow + tilted signal cards */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 bg-dot-grid opacity-40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full bg-[radial-gradient(circle,var(--glow-accent)_0%,transparent_70%)]" />
        </div>

        <div className="relative z-10 w-full max-w-sm">
          <h2 className="text-[20px] mb-1 text-center">Sign in</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 text-center">Free. No password needed — just your Google account.</p>

          {inAppBrowser && (
            <div className="mb-4 px-4 py-4 rounded-xl bg-[var(--glow-hold)] border border-[var(--hold)]/40 text-[var(--text-primary)] text-sm">
              <p className="mb-1 flex items-center gap-2"><Icon name="alert" /> Open in your browser first</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                You&apos;re in an in-app browser (Messenger, Instagram, etc.). Google blocks sign-in here.
                Tap <strong>···</strong> or the share icon and choose <strong>&quot;Open in Chrome&quot;</strong> or <strong>&quot;Open in Safari&quot;</strong>, then sign in.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--glow-sell)] border border-[var(--sell)]/40 text-[var(--sell)] text-sm text-center">
              {errorMsg}
            </div>
          )}

          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4 shadow-xl shadow-black/10">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl }, { prompt: "select_account" })}
              disabled={inAppBrowser}
              className="btn-haptic w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 transition-colors text-gray-900 font-semibold py-3 px-5 rounded-xl text-sm border border-black/10 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="border-t border-[var(--border)] pt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--accent)]">✓</span> No password needed
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--accent)]">✓</span> Instant access — no waiting
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--accent)]">✓</span> Free to use
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-[var(--text-muted)] mt-5 leading-relaxed">
            For informational purposes only — not financial advice.
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Link href="/privacy" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Privacy Policy</Link>
            <span className="text-[var(--text-muted)]">·</span>
            <Link href="/terms"   className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Terms of Service</Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/guide" className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
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
