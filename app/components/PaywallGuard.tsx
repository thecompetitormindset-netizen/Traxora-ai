"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const PLAN_CACHE_KEY = "traxora_plan_cache";

export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  // Always false on first render so server and client agree — sessionStorage checked in effect
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { window.location.href = "/login?signedOut=1"; return; }
    // Already verified this session — skip the fetch
    try { if (sessionStorage.getItem(PLAN_CACHE_KEY) === "pro") { setAllowed(true); return; } } catch { /* ignore */ }

    fetch("/api/user/plan")
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan === "free") { window.location.href = "/pricing"; return; }
        try { sessionStorage.setItem(PLAN_CACHE_KEY, "pro"); } catch { /* ignore */ }
        setAllowed(true);
      })
      .catch(() => setAllowed(true));
  }, [status]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return <>{children}</>;
}
