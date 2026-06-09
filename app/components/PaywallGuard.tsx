"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const PLAN_CACHE_KEY = "traxora_plan_cache";

// Map route prefixes to human-readable feature names for the upgrade prompt
const FEATURE_NAMES: Record<string, string> = {
  "/analysis":     "AI Signal Analysis",
  "/intelligence": "Deep Market Scanner",
  "/journal":      "AI Trade Journal",
  "/history":      "Trade History",
  "/strategy":     "Performance Stats",
  "/paper":        "Trade Planner",
  "/wheel":        "Wheeling Hub",
  "/settings":     "Settings",
  "/notifications":"Notifications",
  "/ipo":          "IPO Tracker",
};

function featureFromPath(path: string): string {
  for (const [prefix, name] of Object.entries(FEATURE_NAMES)) {
    if (path.startsWith(prefix)) return name;
  }
  return "this feature";
}

export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname   = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { window.location.href = "/login?signedOut=1"; return; }

    // Fast path: already verified this session
    try {
      if (sessionStorage.getItem(PLAN_CACHE_KEY) === "pro") { setAllowed(true); return; }
    } catch { /* ignore */ }

    fetch("/api/user/plan")
      .then(r => {
        if (!r.ok) throw new Error(`plan-check-${r.status}`);
        return r.json();
      })
      .then(({ plan }) => {
        if (plan !== "pro") {
          const feature = featureFromPath(pathname ?? "");
          window.location.href = `/pricing?feature=${encodeURIComponent(feature)}`;
          return;
        }
        try { sessionStorage.setItem(PLAN_CACHE_KEY, "pro"); } catch { /* ignore */ }
        setAllowed(true);
      })
      .catch(() => {
        // Plan check failed — deny access rather than grant it silently
        const feature = featureFromPath(pathname ?? "");
        window.location.href = `/pricing?feature=${encodeURIComponent(feature)}&error=plan-check`;
      });
  }, [status, pathname]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-3">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p className="text-[11px] text-[#4B5675]">Checking access…</p>
      </div>
    );
  }

  return <>{children}</>;
}
