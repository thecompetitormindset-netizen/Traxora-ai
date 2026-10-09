"use client";

import Link from "next/link";
import { StateBadge } from "./primitives";
import { useOptionsList, type ListState } from "./useOptionsList";
import { STATE_LABEL, explain, shortReason, stateOf, type UiState } from "./uiState";
import { fmtEt, fmtLevel } from "./format";

// Dashboard summary: answers "what deserves my attention in options now?"
// Validated estimates first, then anything that changed state (expired,
// unavailable, error); a calm one-line answer when nothing qualifies.

const ATTENTION: UiState[] = ["validated", "expired", "unavailable", "error"];

export default function OptionsAttention() {
  const { state } = useOptionsList();
  return <OptionsAttentionView state={state} />;
}

/** Same summary, fed by a list the parent already fetched (avoids a second poll). */
export function OptionsAttentionView({ state }: { state: ListState }) {
  const data = state.kind === "ready" ? state.data : null;
  const rows = (data?.analyses ?? []).map(a => ({ a, s: stateOf(a) }));
  const attention = rows.filter(r => ATTENTION.includes(r.s)).sort((x, y) => ATTENTION.indexOf(x.s) - ATTENTION.indexOf(y.s));
  const counts = new Map<UiState, number>();
  for (const r of rows) counts.set(r.s, (counts.get(r.s) ?? 0) + 1);

  // Most common no-trade explanation, in plain words.
  const top = (() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.s === "no_trade" && r.a.output) {
      const t = explain(r.a.output, data?.session.status === "OPEN").title;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
  })();

  return (
    <section className="fn fn-surface" aria-labelledby="opt-attn-h" data-tour="options-plays-header">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="opt-attn-h" className="fn-h2">Options</h2>
          <p className="fn-meta" style={{ marginTop: 2 }}>
            {data
              ? <>NYSE {data.session.status === "OPEN" ? "open" : "closed"} · {rows.length} symbols analyzed · as of {fmtEt(data.as_of)} · delayed data</>
              : state.kind === "error" ? "Analysis unavailable" : "Loading analysis…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state="paper" />
          <Link href="/options" className="fn-btn" data-tour="options-breakdown-link">Open candidates</Link>
        </div>
      </div>

      {state.kind === "loading" && <div className="space-y-2" style={{ marginTop: 12 }} aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="fn-skel" style={{ height: 32 }} />)}</div>}
      {state.kind === "error" && <p className="fn-text-2" style={{ marginTop: 12 }}>{state.message}</p>}

      {data && (
        <>
          <p className="fn-text-2" style={{ marginTop: 12, fontSize: "var(--fn-fs-sm)" }}>
            {[...counts.entries()].sort((x, y) => (ATTENTION.indexOf(x[0]) + 9) % 9 - (ATTENTION.indexOf(y[0]) + 9) % 9)
              .map(([s, n]) => `${n} ${STATE_LABEL[s].toLowerCase()}`).join(" · ")}
          </p>
          {attention.length === 0 ? (
            <p style={{ marginTop: 8, fontSize: "var(--fn-fs-sm)" }}>
              Nothing needs attention: no qualifying candidate.{top && <span className="fn-text-2"> Most common reason ({top[1]} of {rows.length}): {top[0].toLowerCase()}.</span>}
            </p>
          ) : (
            <ul className="space-y-1" style={{ marginTop: 8 }}>
              {attention.slice(0, 5).map(({ a, s }) => (
                <li key={a.symbol}>
                  <Link href={`/options/${encodeURIComponent(a.symbol)}`} className="flex items-center justify-between gap-3 flex-wrap fn-raised" style={{ padding: "8px 12px", color: "var(--fn-text)" }}>
                    <span className="fn-num" style={{ fontWeight: 700 }}>{a.symbol} <span className="fn-text-2" style={{ fontWeight: 400 }}>{fmtLevel(a.price)}</span></span>
                    <span className="flex items-center gap-2"><span className="fn-meta">{shortReason(a)}</span><StateBadge state={s} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
