"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The day's picks, read once from /api/market/daily-picks.
//
// That route touches no market-data provider: everything it returns was
// computed by the scheduled job and written to the database. So this hook polls
// slowly and refetches on little — there is nothing to be fresher about. The
// picks are fixed for the day by design, which is the point of the feature:
// every viewer sees the same three, and they do not move while anyone is
// looking at them.

export type Pick = {
  symbol: string;
  rank: number;
  direction: "BUY" | "SELL";
  conviction: number;
  entryPrice: number;
  asOf: string;
  horizonDays: number;
  why: string[];
  outcome: { date: string; price: number; returnPct: number; correct: boolean } | null;
};

export type HistoryPick = Pick & { runDate: string };

export type Record = {
  count: number;
  /** Null when nothing has been graded. NEVER render this as 0. */
  hitRate: number | null;
  avgReturn: number | null;
};

export type PicksPayload = {
  available: boolean;
  asOfDate: string | null;
  stale?: boolean;
  picks: Pick[];
  record: Record | null;
  /** Set when the list is empty, saying WHICH empty this is. */
  emptyReason?: string;
  reason?: string;
  hint?: string;
  history?: HistoryPick[];
  /** Every pick ever stored, which is usually more than `history` returns. */
  historyTotal?: number | null;
  /** The width of the window `history` represents. */
  historyLimit?: number;
};

export type PicksState =
  | { kind: "loading" }
  | { kind: "ready"; data: PicksPayload; message: string | null }
  | { kind: "error"; message: string };

/**
 * The payload is checked, not cast.
 *
 * A 200 carrying something else — a proxy's HTML error page, a cached empty
 * body, a later change to the route — would otherwise reach the component as a
 * well-typed lie and be rendered as "no picks today". An absence displayed as a
 * fact is the specific failure this app has spent its time removing, so the
 * shape is verified before anything believes it.
 */
function isPick(v: unknown): v is Pick {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Partial<Pick>;
  return (
    typeof p.symbol === "string" &&
    (p.direction === "BUY" || p.direction === "SELL") &&
    typeof p.conviction === "number" &&
    typeof p.entryPrice === "number" &&
    typeof p.asOf === "string" &&
    typeof p.horizonDays === "number" &&
    Array.isArray(p.why)
  );
}

export function isPicksPayload(v: unknown): v is PicksPayload {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Partial<PicksPayload>;
  if (typeof d.available !== "boolean") return false;
  if (!Array.isArray(d.picks) || !d.picks.every(isPick)) return false;
  if (d.history !== undefined && !Array.isArray(d.history)) return false;
  // record is null until something has been graded, which is a real state.
  if (d.record !== null && d.record !== undefined && typeof d.record !== "object") return false;
  return true;
}

export function useDailyPicks() {
  const [state, setState] = useState<PicksState>({ kind: "loading" });
  const lastGood = useRef<PicksPayload | null>(null);

  const load = useCallback(async () => {
    try {
      // History comes in the same request. It is one query on the server and
      // saves a second round trip for a panel most people will open.
      const res = await fetch("/api/market/daily-picks?history=1", { cache: "no-store" });

      if (res.status === 401) throw new Error("Your session has ended. Sign in again to see the picks.");

      const body: unknown = await res.json().catch(() => null);

      // A 503 carries a readable reason — a missing table, a failed query —
      // and saying which is the difference between "set this up" and "wait".
      if (!res.ok) {
        const detail = isPicksPayload(body) && body.hint ? body.hint : `The picks service returned an error (${res.status}).`;
        throw new Error(detail);
      }

      if (!isPicksPayload(body)) throw new Error("The picks service returned something unexpected.");

      lastGood.current = body;
      setState({ kind: "ready", data: body, message: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error.";
      // Keep the last good result on screen rather than blanking it, and say
      // that is what is being shown.
      setState(
        lastGood.current
          ? { kind: "ready", data: lastGood.current, message: `${message} Showing what loaded last.` }
          : { kind: "error", message },
      );
    }
  }, []);

  useEffect(() => {
    // Every setState in `load` happens after an await, so none of them runs
    // synchronously inside this effect — but the rule cannot see through the
    // promise. Suppressed the same way the options list does it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    // The picks change once a day, pre-market. Polling every ten minutes is
    // enough to pick up the morning's run for anyone who left a tab open, and
    // there is nothing else that could change underneath them.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  return { state, reload: load };
}
