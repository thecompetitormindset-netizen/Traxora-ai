"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { changesSince, loadNotebook, NOTEBOOK_EVENT, type NotebookEntry } from "../../lib/analysisNotebook";
import { DirectionMark } from "./primitives";
import { fmtEt, fmtLevel, fmtMoney } from "./format";

// Saved options analyses, as recorded at save time. Read-only: history is
// preserved, and a later save that changes the read shows the change.

export default function NotebookSection() {
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const load = () => setEntries(loadNotebook());
    load();
    window.addEventListener(NOTEBOOK_EVENT, load);
    return () => window.removeEventListener(NOTEBOOK_EVENT, load);
  }, []);
  if (entries === null) return null;

  const visible = showAll ? entries : entries.slice(0, 5);
  return (
    <section id="analysis-notebook" className="fn fn-surface" style={{ marginTop: 12, scrollMarginTop: 80 }} aria-labelledby="nb-h">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="nb-h" className="fn-h2">Saved analyses</h2>
        <p className="fn-meta">Stored on this device · recorded as they were when saved</p>
      </div>
      {entries.length === 0 ? (
        <p className="fn-text-2" style={{ marginTop: 8, fontSize: "var(--fn-fs-sm)" }}>
          None yet. Use <em>Save to notebook</em> on an options research page to record a decision — including a no-trade — with its evidence and source time. <Link href="/options" className="underline">Open candidates</Link>
        </p>
      ) : (
        <ol className="space-y-3" style={{ marginTop: 12 }}>
          {visible.map(e => {
            const prev = entries.slice(entries.indexOf(e) + 1).find(x => x.symbol === e.symbol);
            const changes = prev ? changesSince(prev, e) : [];
            return (
              <li key={e.id} className="fn-raised" style={{ padding: 14 }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p style={{ fontWeight: 700 }}>
                    <Link href={`/options/${encodeURIComponent(e.symbol)}`} className="fn-num" style={{ color: "var(--fn-text)" }}>{e.symbol}</Link>
                    <span className="fn-text-2" style={{ fontWeight: 500 }}> · {e.state_label}{e.strategy ? ` · ${e.strategy}` : e.reason_title ? ` · ${e.reason_title}` : ""}</span>
                  </p>
                  {e.direction && <span className="fn-meta"><DirectionMark direction={e.direction} /></span>}
                </div>
                <p className="fn-meta">Saved {fmtEt(e.saved_at)} · source as of {fmtEt(e.source_as_of)}{e.user_supplied ? " · your data" : ""} · paper only</p>
                {e.thesis && <p style={{ fontSize: "var(--fn-fs-sm)", marginTop: 6 }}>{e.thesis}</p>}
                {(e.invalidation || e.time_rule || e.max_loss !== null) && (
                  <p className="fn-meta" style={{ marginTop: 4 }}>
                    {e.invalidation && <>Invalidation: {e.invalidation.condition}. </>}
                    {e.time_rule && <>{e.time_rule}. </>}
                    {e.target !== null && <>Target {fmtLevel(e.target)}. </>}
                    {e.max_loss !== null && <>Estimated max loss {fmtMoney(e.max_loss)} per structure at save time.</>}
                  </p>
                )}
                {changes.length > 0 && <p className="fn-meta fn-caution" style={{ marginTop: 4 }}>Changed since the previous {e.symbol} save: {changes.join("; ")}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {entries.length > 5 && (
        <button type="button" className="fn-btn fn-btn-quiet" style={{ marginTop: 8 }} onClick={() => setShowAll(v => !v)}>
          {showAll ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}
