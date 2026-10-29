"use client";

import { useEffect, useRef, useState } from "react";
import { agoLabel } from "@/app/lib/relativeTime";

// The one live thing on the landing page.
//
// Everything else there is a labelled illustration, and deliberately so. This
// is not, which puts it under a different obligation: it must never look
// confident about data it does not have. Three states, all of them honest —
// loading says nothing, unavailable says so plainly, and a real reading always
// carries how old it is and that it is delayed.
//
// The "updated Ns ago" counter is the point of the whole component. A price
// with no age next to it invites the reader to assume it is current, and that
// assumption is wrong by about fifteen minutes here. Showing the age costs one
// line and removes the illusion.

type Row = { symbol: string; label: string; price: number | null; change: number | null };
type Pulse = { rows: Row[]; asOf: string; marketOpen: boolean; sessionDetail: string; available: boolean };

const REFRESH_MS = 60_000;

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export default function MarketPulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    async function load() {
      try {
        const res = await fetch("/api/public/market-pulse", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: unknown = await res.json();
        if (!alive.current) return;

        // Shape-check before trusting it. This runs on a public page where a
        // thrown error would take the whole landing experience down, and a
        // malformed body is not worth that.
        if (typeof data !== "object" || data === null || !Array.isArray((data as Pulse).rows)) {
          setFailed(true);
          return;
        }
        setPulse(data as Pulse);
        setFailed(false);
      } catch {
        if (alive.current) setFailed(true);
      }
    }

    load();
    const refresh = setInterval(load, REFRESH_MS);
    // Separate, faster tick so the age counter moves between refreshes.
    const tick = setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      alive.current = false;
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, []);

  // Nothing to say yet, or nothing to say at all. Rendering an empty frame
  // would be worse than rendering nothing: it reads as a broken widget.
  if (failed && !pulse) return null;
  if (!pulse) {
    return (
      <div className="mt-8 h-[46px] rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-surface)]" aria-hidden="true" />
    );
  }
  if (!pulse.available) return null;

  const asOfMs = Date.parse(pulse.asOf);
  const usable = pulse.rows.filter(r => r.price !== null);
  if (usable.length === 0) return null;

  return (
    <section
      className="mt-8 rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-surface)] overflow-hidden"
      aria-label="Market snapshot"
    >
      <div className="flex items-stretch divide-x divide-[var(--mx-line)]">
        {usable.map(r => {
          const up = (r.change ?? 0) >= 0;
          return (
            <div key={r.symbol} className="flex-1 px-3.5 py-2.5 min-w-0">
              <p className="mx-label truncate">{r.label}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-[14px] leading-none tabular-nums">{money(r.price!)}</span>
                {r.change !== null && (
                  <span
                    className="font-mono text-[11.5px] leading-none tabular-nums"
                    style={{ color: up ? "var(--mx-up)" : "var(--mx-down)" }}
                  >
                    {signed(r.change)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-3.5 py-2 border-t border-[var(--mx-line)] text-[11px] text-[var(--mx-text-3)]">
        {/* Delayed, and said so. The FAQ on this page already tells visitors
            prices run about fifteen minutes behind; a live-looking strip that
            stayed silent about it would quietly contradict that. */}
        {pulse.marketOpen ? "Market open" : pulse.sessionDetail || "Market closed"}
        {" · delayed ~15 min · updated "}
        {agoLabel(asOfMs, now)}
      </p>
    </section>
  );
}
