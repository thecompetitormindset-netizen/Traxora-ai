"use client";

import { useCallback, useEffect, useState } from "react";
import PaywallGuard from "../components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import type { FuturesRow } from "../api/market/futures-outlook/route";

// What each futures market looks like, measured on a fund that tracks it.
//
// The page has one job beyond showing the numbers: never let a reader think a
// USO signal is a crude signal. Every row names the fund it was measured on,
// and the caveat for that fund is one tap away rather than buried in a footer.

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";

type Payload = {
  available: boolean;
  reason?: string;
  hint?: string;
  rows: FuturesRow[];
  disclaimer?: string;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: Payload }
  | { kind: "error"; message: string };

const usd = (n: number, dp = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

function Row({ r }: { r: FuturesRow }) {
  // A direction is only shown once the backtest behind it cleared the sample
  // floor. The scorer can produce a lean from eleven past occurrences, and
  // printing "leaning down" above "not yet meaningful" would have the row
  // contradicting itself — asserting a call the same card then withdraws.
  const measured = r.hitRate !== null && r.conviction !== null;
  const tone = !measured
    ? "var(--mx-text-3)"
    : r.direction === "BUY" ? "var(--mx-up)" : "var(--mx-down)";

  return (
    <li className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[18px]">{r.name}</p>
          <p className="mt-0.5 text-[13px] text-[var(--mx-text-3)]">
            Measured on {r.proxyEtf}
          </p>
        </div>
        <p className="text-[15px] tabular-nums shrink-0" style={{ color: tone }}>
          {!measured ? "No call" : r.direction === "BUY" ? "Leaning up" : "Leaning down"}
        </p>
      </div>

      {/* The measurement, or why there isn't one. */}
      {measured ? (
        <ul className="mt-3 space-y-1.5">
          {r.why.map(w => (
            <li key={w} className="text-[13.5px] leading-relaxed text-[var(--mx-text-2)] flex gap-2">
              <span aria-hidden="true" className="text-[var(--mx-text-3)]">·</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mx-text-2)]">
          {r.note ?? "Nothing measurable today."}
        </p>
      )}

      {/* The sizes this market trades in. A micro is a tenth of the full
          contract for most of these, and is what a practice account can
          actually hold — a full E-mini S&P needs more margin than the whole
          starting balance. */}
      <ul className="mt-4 grid sm:grid-cols-2 gap-2">
        {r.sizes.map(s => (
          <li key={s.symbol} className="rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-raised)] px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              {/* The space is deliberate: without it the symbol and the size
                  run together as "ESFull size" when copied or read aloud. */}
              <span className="text-[14px]">
                {s.symbol.replace(".COMM", "")}{" "}
                <span className="ml-1 text-[12px] text-[var(--mx-text-3)]">{s.label}</span>
              </span>
              <span className="text-[13px] tabular-nums text-[var(--mx-text-2)]">
                ~{usd(s.initialMargin)} margin
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--mx-text-3)] tabular-nums">
              {s.unit} · {usd(s.tickValue, 2)} a tick
              {s.fraction !== null && ` · ${Math.round(1 / s.fraction)}× smaller`}
            </p>
          </li>
        ))}
      </ul>

      {/* Which fund this was measured on, and how it can come apart. */}
      <details className="mt-3 group">
        <summary className="cursor-pointer list-none text-[12.5px] text-[var(--mx-text-3)] hover:text-[var(--mx-text-2)]">
          Measured on {r.proxyEtf}, not on the contract — why that matters
          <span aria-hidden="true" className="ml-1.5 transition-transform inline-block group-open:rotate-45">+</span>
        </summary>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--mx-text-3)] max-w-[70ch]">
          {r.proxyCaveat} Margin figures are approximate — exchanges revise them and your broker will set its
          own above the minimum.
        </p>
      </details>
    </li>
  );
}

function FuturesContent() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market/futures-outlook", { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const hint = typeof body === "object" && body && "hint" in body ? String((body as { hint: unknown }).hint) : `HTTP ${res.status}`;
        throw new Error(hint);
      }
      if (typeof body !== "object" || body === null || !Array.isArray((body as Payload).rows)) {
        throw new Error("The outlook service returned something unexpected.");
      }
      setState({ kind: "ready", data: body as Payload });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Could not load the outlook." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Futures</h1>
        <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[64ch] leading-relaxed">
          A measured read on each futures market. Not a forecast — a record of how this signal has actually
          turned out on similar occasions, with the times it was wrong included.
        </p>
      </header>

      {/* The thing a reader must not misunderstand, said before the numbers. */}
      <section className={`${card} p-5`}>
        <p className="text-[15px]">These are measured on funds, not on the contracts.</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--mx-text-2)] max-w-[72ch]">
          No free data source carries futures history, so there is nothing honest to backtest a crude or S&amp;P
          signal against directly. What the app does hold is daily history for the US-listed funds that track
          each market. Each row below is scored on that fund and says which one — and a fund that holds futures
          has to roll them, which in contango costs money the spot price never shows.
        </p>
      </section>

      {state.kind === "loading" && (
        <div className={`${card} p-5`} aria-busy="true">
          <div className="space-y-3 animate-pulse">
            <div className="h-6 w-52 rounded bg-[var(--mx-raised)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--mx-raised)]" />
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className={`${card} p-5`}>
          <p className="text-[18px]">We couldn’t load the futures outlook.</p>
          <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">{state.message}</p>
          <button type="button" onClick={() => void load()}
            className="mt-4 h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)]">
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && !state.data.available && (
        <div className={`${card} p-5`}>
          <p className="text-[18px]">The outlook isn’t switched on here.</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--mx-text-2)] max-w-[64ch]">
            {state.data.hint ?? "There is no stored history to measure against yet."}
          </p>
        </div>
      )}

      {state.kind === "ready" && state.data.available && (
        <ul className="space-y-3">
          {state.data.rows.map(r => <Row key={r.symbol} r={r} />)}
        </ul>
      )}

      <p className="text-[12.5px] leading-relaxed text-[var(--mx-text-3)] max-w-[72ch]">
        For learning only — not financial advice, and not a recommendation to buy anything. Futures are
        leveraged: a contract controls far more than the margin behind it, so a small move against a position
        can cost more than was put up. Practice with them on the{" "}
        <a href="/paper" className="underline">practice trading</a> page, where they are now sized the way the
        real contracts are.
      </p>
    </div>
  );
}

export default function FuturesPage() {
  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[var(--mx-text)]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
            <div className="max-w-3xl mx-auto w-full">
              <FuturesContent />
            </div>
          </main>
        </div>
      </div>
    </PaywallGuard>
  );
}
