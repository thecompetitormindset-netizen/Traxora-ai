"use client";

import { useEffect, useState } from "react";
import type { RecentSessionsResponse, RecentSession } from "@/app/api/market/options-engine/recent/route";

export type { RecentSession };

export type RecentState =
  | { kind: "loading" }
  | { kind: "ready"; sessions: RecentSession[]; available: boolean };

/**
 * Past sessions for the "since you last looked" card. Only fetched when the
 * market is shut — during the session the same slot shows why today's names
 * did not pass, which is the more useful question then.
 */
export function useRecentSessions(enabled: boolean, days = 5): RecentState {
  const [state, setState] = useState<RecentState>({ kind: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/market/options-engine/recent?days=${days}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() as Promise<Partial<RecentSessionsResponse>> : null))
      .then(d => {
        if (cancelled) return;
        // Trust nothing about the shape. A proxy error page, a 503 body or a
        // future change to the route should leave the card empty, not take the
        // whole Overview down with it.
        const sessions = Array.isArray(d?.sessions) ? d.sessions : [];
        setState({ kind: "ready", sessions, available: d?.available === true });
      })
      .catch(() => { if (!cancelled) setState({ kind: "ready", sessions: [], available: false }); });
    return () => { cancelled = true; };
  }, [enabled, days]);

  return state;
}
