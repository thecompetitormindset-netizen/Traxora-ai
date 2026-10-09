"use client";

import Link from "next/link";
import { useOptionsList, type ListState } from "./useOptionsList";
import { plainReason, stateOf } from "./uiState";

// Dashboard summary of the options check, in one or two plain sentences.
// Ideas that passed every check are listed; otherwise we say why not.

export default function OptionsAttention() {
  const { state } = useOptionsList();
  return <OptionsAttentionView state={state} />;
}

/** Same summary, fed by a list the parent already fetched (avoids a second poll). */
export function OptionsAttentionView({ state }: { state: ListState }) {
  const data = state.kind === "ready" ? state.data : null;
  const open = data?.session.status === "OPEN";
  const rows = data?.analyses ?? [];
  const ideas = rows.filter(a => stateOf(a) === "validated");

  const top = (() => {
    const m = new Map<string, number>();
    for (const a of rows) if (stateOf(a) !== "validated") { const r = plainReason(a, open); m.set(r, (m.get(r) ?? 0) + 1); }
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  })();

  return (
    <section className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 text-[var(--mx-text)]" aria-labelledby="opt-attn-h">
      <div className="flex items-start justify-between gap-3">
        <h2 id="opt-attn-h" className="text-[17px]">Options</h2>
        <Link href="/options" className="h-8 px-3.5 inline-flex items-center rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Open</Link>
      </div>

      {state.kind === "loading" && <div className="mt-3 h-4 w-2/3 rounded bg-[var(--mx-raised)] animate-pulse" />}
      {state.kind === "error" && <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">The options check isn’t available right now.</p>}

      {data && (ideas.length === 0 ? (
        <p className="mt-2 text-[14.5px] text-[var(--mx-text-2)]">
          No option ideas right now.{" "}
          {top === "Market is closed"
            ? "The market is closed — we’ll check again after it opens."
            : `None of the ${rows.length} stocks we checked passed every safety check${top ? ` (most often: ${top.toLowerCase()})` : ""}.`}
        </p>
      ) : (
        <>
          <p className="mt-2 text-[14.5px] text-[var(--mx-text-2)]">{ideas.length} {ideas.length === 1 ? "idea" : "ideas"} passed every check. Practice only.</p>
          <ul className="mt-3 divide-y divide-[var(--mx-line)] border-y border-[var(--mx-line)]">
            {ideas.slice(0, 5).map(a => (
              <li key={a.symbol}>
                <Link href={`/options/${encodeURIComponent(a.symbol)}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--mx-text)]">
                  <span>{a.symbol}</span>
                  <span className="text-[13px] text-[var(--mx-text-3)]">See the plan →</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ))}
    </section>
  );
}
