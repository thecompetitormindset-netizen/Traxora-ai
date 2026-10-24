"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OptionsAnalysisResponse } from "../../api/market/options-engine/route";

export type ListState =
  | { kind: "loading" }
  | { kind: "ready"; data: OptionsAnalysisResponse; refreshing: boolean; message: string | null }
  | { kind: "error"; message: string };

/**
 * The response was cast, not checked. Every consumer then reads data.session
 * .status and data.analyses straight away, so a 200 carrying anything else —
 * a proxy's HTML error page, a cached empty body, a future change to the route
 * — took Overview, Options and Intelligence down to the error boundary rather
 * than to their own "could not load" state.
 *
 * Only the fields the screens actually rely on are checked; the rest of the
 * payload is allowed to vary.
 */
function isAnalysisResponse(v: unknown): v is OptionsAnalysisResponse {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Partial<OptionsAnalysisResponse>;
  return (
    typeof d.session === "object" && d.session !== null && typeof d.session.status === "string" &&
    Array.isArray(d.analyses) &&
    Array.isArray(d.reasons) &&
    (d.scan === null || typeof d.scan === "object")
  );
}

/** Shared fetch for the analysis list. Keeps showing the previous result while refreshing. */
export function useOptionsList(pollMs = 5 * 60 * 1000) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const dataRef = useRef<OptionsAnalysisResponse | null>(null);

  const run = useCallback(async (method: "GET" | "POST") => {
    setState(s => (s.kind === "ready" ? { ...s, refreshing: true, message: null } : s.kind === "error" ? { kind: "loading" } : s));
    try {
      const res = await fetch("/api/market/options-engine", method === "GET" ? { cache: "no-store" } : { method: "POST" });
      if (res.status === 429) {
        const b = await res.json().catch(() => ({})) as { retryAfterSeconds?: number };
        const msg = `Just refreshed. Next refresh available in about ${Math.max(1, Math.ceil((b.retryAfterSeconds ?? 60) / 60))} min.`;
        setState(s => (s.kind === "ready" ? { ...s, refreshing: false, message: msg } : { kind: "error", message: msg }));
        return;
      }
      if (!res.ok) throw new Error(res.status === 401 ? "Your session has ended. Sign in again to see the analysis." : `The analysis service returned an error (${res.status}).`);
      const body: unknown = await res.json().catch(() => null);
      if (!isAnalysisResponse(body)) {
        throw new Error("The analysis service returned something unexpected.");
      }
      dataRef.current = body;
      setState({ kind: "ready", data: body, refreshing: false, message: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error.";
      // Keep the last good result on screen, marked with the failure.
      setState(dataRef.current
        ? { kind: "ready", data: dataRef.current, refreshing: false, message: `${message} Showing the previous result.` }
        : { kind: "error", message });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run("GET");
    const id = setInterval(() => run("GET"), pollMs);
    return () => clearInterval(id);
  }, [run, pollMs]);

  return { state, refresh: () => run("POST"), reload: () => run("GET") };
}
