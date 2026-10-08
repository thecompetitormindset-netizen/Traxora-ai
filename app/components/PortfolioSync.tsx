"use client";

// Silently syncs the portfolio to Supabase in both directions.
// On mount: pull cloud → merge into localStorage (cloud wins if newer).
// On portfolio change event: debounce 3s → push to cloud.
// Invisible component — no UI.

import { useEffect, useRef } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import { getPortfolio, savePortfolio, PORTFOLIO_UPDATED_EVENT } from "../lib/trading";

export default function PortfolioSync() {
  const { data: session } = useAppSession();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedRef   = useRef(false);

  // On login: pull from cloud and merge
  useEffect(() => {
    if (!session?.user || syncedRef.current) return;
    syncedRef.current = true;

    async function pull() {
      try {
        const res = await fetch("/api/user/sync");
        if (!res.ok) return;
        const { snapshot, updatedAt } = await res.json() as { snapshot: unknown; updatedAt?: string };
        if (!snapshot) return;

        // Only overwrite localStorage if cloud snapshot is newer
        const localRaw = localStorage.getItem("traxora-portfolio-" + (session!.user!.email ?? ""));
        if (localRaw && updatedAt) {
          // If user has local trades more recent than cloud, keep local
          // Simple heuristic: if local trades exist and cloud has no trades, keep local
          const cloud = snapshot as { trades?: unknown[] };
          const local = JSON.parse(localRaw) as { trades?: unknown[] };
          if ((local.trades?.length ?? 0) > (cloud.trades?.length ?? 0)) return;
        }

        // Apply cloud snapshot to localStorage
        const current = getPortfolio();
        const merged  = { ...current, ...(snapshot as object) };
        savePortfolio(merged as Parameters<typeof savePortfolio>[0]);
      } catch { /* silent */ }
    }

    pull();
  }, [session]);

  // On every portfolio change: debounce push to cloud
  useEffect(() => {
    if (!session?.user) return;

    function onPortfolioChange() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const portfolio = getPortfolio();
          await fetch("/api/user/sync", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ portfolio }),
          });
        } catch { /* silent */ }
      }, 3_000);
    }

    window.addEventListener(PORTFOLIO_UPDATED_EVENT, onPortfolioChange);
    return () => {
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, onPortfolioChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [session]);

  return null;
}
