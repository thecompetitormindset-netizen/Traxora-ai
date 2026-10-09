"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

// Access guard for app pages. Traxora has no paid plans: the only requirement
// is a signed-in session (kept so per-user data and AI rate limits have an
// identity). Signed-out visitors go to the landing page to sign in. The name is
// historical; there is no paywall.

export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/";
  }, [status]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-3" role="status" aria-live="polite">
        <svg className="animate-spin text-[var(--mx-text-3)]" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p className="text-[12px] text-[var(--mx-text-3)]">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
