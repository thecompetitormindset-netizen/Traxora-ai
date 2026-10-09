"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OptionsAnalysisResponse } from "../../api/market/options-engine/route";

export type ListState =
  | { kind: "loading" }
  | { kind: "ready"; data: OptionsAnalysisResponse; refreshing: boolean; message: string | null }
  | { kind: "error"; message: string };

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
      const data = await res.json() as OptionsAnalysisResponse;
      dataRef.current = data;
      setState({ kind: "ready", data, refreshing: false, message: null });
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
