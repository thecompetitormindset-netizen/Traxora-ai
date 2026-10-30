"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QUOTE_DELAY_MINUTES,
  closePosition, contractKey, contractLabel, costOf, intrinsic, isExpired,
  openPosition, realised, returnPct, settleExpiry, spreadPct, summarise, unrealised,
  type ContractQuote, type OptionPosition, type Right,
} from "../../lib/optionsPaper";
import {
  OPTIONS_START, loadOptionsAccount, resetOptionsAccount, saveOptionsAccount,
  type OptionsAccount,
} from "../../lib/optionsPaperStore";

// Practice trading options, against real delayed chain quotes.
//
// The two things this screen exists to show honestly: you buy at the ask and
// sell at the bid, so a position is underwater the moment it opens; and most
// contracts expire worthless, which is booked rather than hidden.

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";
const input = "h-11 w-full rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-canvas)] px-3 text-[15px] tabular-nums focus:outline-none focus:border-[var(--mx-control)]";
const btnQuiet = "h-9 px-4 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] disabled:opacity-40";

const usd = (n: number, dp = 2) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${usd(n)}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

type Greek = { bid: number | null; ask: number | null; last: number | null; iv: number | null; delta: number | null; oi: number | null };
type ChainRow = { strike: number; call: Greek; put: Greek };
type Chain = { symbol: string; price: number; expiry: string; expiries: string[]; dte: number; chain: ChainRow[] };

type ChainState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: Chain; at: number }
  | { kind: "error"; message: string };

const toneOf = (n: number | null) =>
  n === null ? "var(--mx-text-3)" : n > 0 ? "var(--mx-up)" : n < 0 ? "var(--mx-down)" : "var(--mx-text)";

export default function OptionsPaper() {
  const [account, setAccount] = useState<OptionsAccount>(() => ({ start: OPTIONS_START, cash: OPTIONS_START, positions: [] }));
  const [hydrated, setHydrated] = useState(false);
  const [symbol, setSymbol] = useState("AAPL");
  const [chain, setChain] = useState<ChainState>({ kind: "idle" });
  const [expiry, setExpiry] = useState<string | null>(null);
  const [right, setRight] = useState<Right>("CALL");
  const [strike, setStrike] = useState<number | null>(null);
  const [contracts, setContracts] = useState("1");
  const [notice, setNotice] = useState<string | null>(null);

  // Storage is only readable in the browser, so the first render must not
  // depend on it or the markup will not match what the server produced.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccount(loadOptionsAccount());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: OptionsAccount) => {
    setAccount(next);
    if (!saveOptionsAccount(next)) {
      setNotice("This browser is not letting the page save, so the account will not survive a reload.");
    }
  }, []);

  const loadChain = useCallback(async (sym: string, wantExpiry?: string) => {
    setChain({ kind: "loading" });
    setNotice(null);
    try {
      const url = `/api/market/options-chain?symbol=${encodeURIComponent(sym)}${wantExpiry ? `&expiry=${wantExpiry}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
        throw new Error(
          detail === "chain_unavailable"
            ? "The options feed did not answer. Nothing is wrong with the ticker — try again shortly."
            : `No options chain for ${sym} (${detail}).`,
        );
      }
      const data = body as Chain | null;
      if (!data || !Array.isArray(data.chain) || typeof data.price !== "number") {
        throw new Error(`No options chain for ${sym}.`);
      }

      setChain({ kind: "ready", data, at: Date.now() });
      setExpiry(data.expiry);
      // Default to the strike nearest the money, which is where most people start.
      const nearest = data.chain.reduce<ChainRow | null>(
        (best, r) => (best === null || Math.abs(r.strike - data.price) < Math.abs(best.strike - data.price) ? r : best),
        null,
      );
      setStrike(nearest?.strike ?? null);
    } catch (e) {
      setChain({ kind: "error", message: e instanceof Error ? e.message : "Could not load the chain." });
    }
  }, []);

  /** Quotes for the contracts currently held, taken from the loaded chain. */
  const quotes = useMemo(() => {
    const out: Record<string, ContractQuote> = {};
    if (chain.kind !== "ready") return out;
    for (const row of chain.data.chain) {
      for (const r of ["CALL", "PUT"] as Right[]) {
        const g = r === "CALL" ? row.call : row.put;
        out[contractKey({ symbol: chain.data.symbol, expiry: chain.data.expiry, right: r, strike: row.strike })] =
          { bid: g.bid, ask: g.ask, last: g.last, at: chain.at };
      }
    }
    return out;
  }, [chain]);

  const selected = useMemo(() => {
    if (chain.kind !== "ready" || strike === null) return null;
    const row = chain.data.chain.find(r => r.strike === strike);
    if (!row) return null;
    const g = right === "CALL" ? row.call : row.put;
    return { row, quote: { bid: g.bid, ask: g.ask, last: g.last, at: chain.at } as ContractQuote, greek: g };
  }, [chain, strike, right]);

  // A ticking clock rather than Date.now() during render. Reading the time
  // while rendering is impure, and it also meant an open position's value and
  // its expiry check were frozen at whatever moment the component last drew.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const summary = useMemo(() => summarise(account.positions, quotes, now), [account.positions, quotes, now]);
  const open = account.positions.filter(p => p.status === "open");
  const done = account.positions.filter(p => p.status !== "open").slice().reverse();

  const buy = useCallback(() => {
    if (chain.kind !== "ready" || !selected || strike === null || !expiry) return;
    const n = Number(contracts);
    const result = openPosition(
      { symbol: chain.data.symbol, right, strike, expiry, contracts: n },
      selected.quote,
      chain.data.price,
      account.cash,
      Date.now(),
    );
    if (!result.ok) { setNotice(result.error); return; }

    persist({ ...account, cash: account.cash - result.cost, positions: [...account.positions, result.position] });
    setNotice(`Bought ${n} × ${contractLabel(result.position)} at ${usd(result.position.entryPremium)} per share — ${usd(result.cost)} total.`);
  }, [account, chain, contracts, expiry, persist, right, selected, strike])

  const sell = useCallback((pos: OptionPosition) => {
    const result = closePosition(pos, quotes[contractKey(pos)], Date.now(), chain.kind === "ready" ? chain.data.price : null);
    if (!result.ok) { setNotice(result.error); return; }

    persist({
      ...account,
      cash: account.cash + result.proceeds,
      positions: account.positions.map(p => (p.id === pos.id ? result.position : p)),
    });
    const booked = realised(result.position);
    setNotice(`Sold ${contractLabel(pos)} at ${usd(result.position.exitPremium ?? 0)} — ${booked === null ? "" : signed(booked)}.`);
  }, [account, chain, persist, quotes])

  /** Settle an expired contract at intrinsic value against the current price. */
  const settle = useCallback((pos: OptionPosition) => {
    if (chain.kind !== "ready" || chain.data.symbol !== pos.symbol) {
      setNotice(`Load the ${pos.symbol} chain first — settling needs its price.`);
      return;
    }
    const settled = settleExpiry(pos, chain.data.price, Date.now());
    persist({
      ...account,
      cash: account.cash + costOf(settled.exitPremium ?? 0, settled.contracts),
      positions: account.positions.map(p => (p.id === pos.id ? settled : p)),
    });
    const booked = realised(settled);
    setNotice(
      (settled.exitPremium ?? 0) === 0
        ? `${contractLabel(pos)} expired worthless — ${booked === null ? "" : signed(booked)}. Most of them do.`
        : `${contractLabel(pos)} settled at ${usd(settled.exitPremium ?? 0)} — ${booked === null ? "" : signed(booked)}.`,
    );
  }, [account, chain, persist])

  const equity = summary.openValue === null ? null : account.cash + summary.openValue;

  return (
    <section aria-labelledby="optpaper-h" className="space-y-4">
      <div>
        <h2 id="optpaper-h" className="text-[20px]">Practice options</h2>
        <p className="mt-1 text-[13px] text-[var(--mx-text-3)] max-w-[66ch] leading-relaxed">
          Buy calls and puts with pretend money at real chain prices. You pay the ask and sell at the bid,
          exactly as you would with a broker — which is why a position starts underwater. Quotes are about{" "}
          {QUOTE_DELAY_MINUTES} minutes behind.
        </p>
      </div>

      {/* Account */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <Stat label="Cash" value={hydrated ? usd(account.cash) : "—"} />
          <Stat label="Open premium at risk" value={hydrated ? usd(summary.atRisk) : "—"} />
          <Stat
            label="Open positions worth"
            value={!hydrated ? "—" : summary.openValue === null ? "not priced" : usd(summary.openValue)}
            muted={summary.openValue === null}
          />
          <Stat
            label="Account value"
            value={!hydrated ? "—" : equity === null ? "not priced" : usd(equity)}
            muted={equity === null}
          />
          <Stat
            label="Closed result"
            value={hydrated && summary.closedCount > 0 ? signed(summary.realisedTotal) : "nothing closed yet"}
            tone={hydrated && summary.closedCount > 0 ? toneOf(summary.realisedTotal) : undefined}
            muted={!(hydrated && summary.closedCount > 0)}
          />
        </div>
        {summary.unpriced > 0 && (
          <p className="mt-3 text-[12.5px] text-[var(--mx-text-3)]">
            {summary.unpriced} open position{summary.unpriced === 1 ? "" : "s"} could not be priced from the loaded
            chain, so the totals above leave the value out rather than guessing it. Load that symbol’s chain to value them.
          </p>
        )}
      </div>

      {/* Pick a contract */}
      <div className={`${card} p-5 space-y-4`}>
        <form
          onSubmit={e => { e.preventDefault(); void loadChain(symbol.trim().toUpperCase()); }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="w-40">
            <label htmlFor="opt-paper-sym" className="block text-[13px] text-[var(--mx-text-3)] mb-1">Ticker</label>
            <input id="opt-paper-sym" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              autoComplete="off" spellCheck={false} className={input} placeholder="AAPL" />
          </div>
          <button type="submit" className="h-11 px-5 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">
            {chain.kind === "loading" ? "Loading…" : "Load chain"}
          </button>
          {chain.kind === "ready" && (
            <p className="text-[13px] text-[var(--mx-text-3)] tabular-nums">
              {chain.data.symbol} {usd(chain.data.price)} · {chain.data.dte} days to expiry
            </p>
          )}
        </form>

        {chain.kind === "error" && (
          <p className="text-[14px] text-[var(--mx-down)]">{chain.message}</p>
        )}

        {chain.kind === "ready" && (
          <>
            <div className="flex flex-wrap gap-3">
              <div>
                <label htmlFor="opt-paper-exp" className="block text-[13px] text-[var(--mx-text-3)] mb-1">Expiry</label>
                <select id="opt-paper-exp" value={expiry ?? ""} className={`${input} w-44`}
                  onChange={e => { setExpiry(e.target.value); void loadChain(chain.data.symbol, e.target.value); }}>
                  {chain.data.expiries.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <span className="block text-[13px] text-[var(--mx-text-3)] mb-1">Direction</span>
                <div className="flex gap-2">
                  {(["CALL", "PUT"] as Right[]).map(r => (
                    <button key={r} type="button" onClick={() => setRight(r)}
                      className={`h-11 px-5 rounded-full text-[14px] border ${right === r ? "bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] border-transparent" : "border-[var(--mx-line)] text-[var(--mx-text-2)]"}`}>
                      {r === "CALL" ? "Call (up)" : "Put (down)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-28">
                <label htmlFor="opt-paper-qty" className="block text-[13px] text-[var(--mx-text-3)] mb-1">Contracts</label>
                <input id="opt-paper-qty" value={contracts} onChange={e => setContracts(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" className={input} />
              </div>
            </div>

            <StrikeTable rows={chain.data.chain} price={chain.data.price} right={right} strike={strike} onPick={setStrike} />

            {selected && (
              <div className="rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-raised)] p-4">
                <p className="text-[15px]">
                  {contractLabel({ symbol: chain.data.symbol, expiry: expiry ?? chain.data.expiry, right, strike: strike ?? 0 })}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[var(--mx-text-2)] tabular-nums">
                  <span>Bid {selected.greek.bid === null ? "—" : usd(selected.greek.bid)}</span>
                  <span>Ask {selected.greek.ask === null ? "—" : usd(selected.greek.ask)}</span>
                  {spreadPct(selected.quote) !== null && (
                    <span className="text-[var(--mx-text-3)]">
                      spread {spreadPct(selected.quote)!.toFixed(0)}% — the move needed before it breaks even
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13px] text-[var(--mx-text-2)] tabular-nums">
                  {selected.greek.ask === null
                    ? "No ask, so this contract cannot be bought right now."
                    : `${Number(contracts) || 0} contract${Number(contracts) === 1 ? "" : "s"} costs ${usd(costOf(selected.greek.ask, Number(contracts) || 0))} — the most you can lose.`}
                </p>
                <button type="button" onClick={buy} disabled={!hydrated || selected.greek.ask === null}
                  className="mt-3 h-11 px-6 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px] disabled:opacity-40">
                  Buy at the ask
                </button>
              </div>
            )}
          </>
        )}

        {notice && <p className="text-[13.5px] text-[var(--mx-text-2)]" aria-live="polite">{notice}</p>}
      </div>

      {/* Open positions */}
      {hydrated && open.length > 0 && (
        <div className={`${card}`}>
          <p className="p-5 pb-3 text-[15px]">Open positions</p>
          <ul className="border-t border-[var(--mx-line)] divide-y divide-[var(--mx-line)]">
            {open.map(p => {
              const q = quotes[contractKey(p)];
              const pl = unrealised(p, q, now);
              const expired = isExpired(p.expiry, now);
              return (
                <li key={p.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px]">{contractLabel(p)} × {p.contracts}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--mx-text-3)] tabular-nums">
                      paid {usd(p.entryPremium)} · {usd(costOf(p.entryPremium, p.contracts))} at risk
                      {expired && " · expired"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="tabular-nums text-[15px]" style={{ color: toneOf(pl) }}>
                      {pl === null ? "not priced" : `${signed(pl)} (${pct(returnPct(p, pl) ?? 0)})`}
                    </span>
                    {expired ? (
                      <button type="button" onClick={() => settle(p)} className={btnQuiet}>Settle</button>
                    ) : (
                      <button type="button" onClick={() => sell(p)} disabled={!q} className={btnQuiet}>Sell at the bid</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-4 text-[12.5px] leading-relaxed text-[var(--mx-text-3)]">
            Value is what selling would RECEIVE — the bid. A position bought moments ago shows a loss because
            the spread is a real cost, not a display quirk.
          </p>
        </div>
      )}

      {/* Finished */}
      {hydrated && done.length > 0 && (
        <details className={`${card} group`}>
          <summary className="cursor-pointer list-none flex items-center justify-between p-5 text-[15px]">
            <span>Finished trades ({done.length})</span>
            <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
          </summary>
          <ul className="border-t border-[var(--mx-line)] divide-y divide-[var(--mx-line)]">
            {done.map(p => {
              const booked = realised(p);
              return (
                <li key={p.id} className="px-5 py-3 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-[14px]">{contractLabel(p)} × {p.contracts}</span>
                    <span className="ml-2 text-[13px] text-[var(--mx-text-3)]">
                      {p.exitReason === "expired" ? "expired" : "sold"} at {usd(p.exitPremium ?? 0)}
                    </span>
                  </span>
                  <span className="tabular-nums text-[14px] shrink-0" style={{ color: toneOf(booked) }}>
                    {booked === null ? "—" : `${signed(booked)} (${pct(returnPct(p, booked) ?? 0)})`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-4 text-[12.5px] leading-relaxed text-[var(--mx-text-3)]">
            {summary.wins} of {summary.closedCount} made money
            {summary.winRate !== null && ` (${summary.winRate}%)`}. Contracts that expire worthless are booked at a
            total loss and kept here, because that is the most common way an option ends.
          </p>
        </details>
      )}

      <div className="flex items-center gap-3">
        <button type="button" className={`${btnQuiet} shrink-0 whitespace-nowrap`}
          onClick={() => { persist(resetOptionsAccount()); setNotice("Options practice account reset."); }}>
          Start over
        </button>
        <p className="text-[12.5px] text-[var(--mx-text-3)]">
          Practice only — never real money. Buying only; writing options is not simulated here because its risk
          cannot be modelled honestly without margin rules.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, tone, muted }: { label: string; value: string; tone?: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[12.5px] text-[var(--mx-text-3)]">{label}</p>
      <p className="mt-0.5 text-[18px] tabular-nums" style={{ color: tone ?? (muted ? "var(--mx-text-3)" : undefined) }}>
        {value}
      </p>
    </div>
  );
}

/** Strikes for one side, with the money marked. */
function StrikeTable({ rows, price, right, strike, onPick }: {
  rows: ChainRow[]; price: number; right: Right; strike: number | null; onPick: (s: number) => void;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--mx-line)] overflow-hidden">
      <div className="grid grid-cols-4 px-4 py-2 text-[12px] text-[var(--mx-text-3)] border-b border-[var(--mx-line)]">
        <span>Strike</span><span className="text-right">Bid</span><span className="text-right">Ask</span><span className="text-right">Open interest</span>
      </div>
      <ul className="max-h-[260px] overflow-y-auto divide-y divide-[var(--mx-line)]">
        {rows.map(r => {
          const g = right === "CALL" ? r.call : r.put;
          const itm = intrinsic(right, r.strike, price) > 0;
          const active = r.strike === strike;
          return (
            <li key={r.strike}>
              <button type="button" onClick={() => onPick(r.strike)}
                className={`w-full grid grid-cols-4 px-4 py-2.5 text-[13.5px] tabular-nums text-left ${active ? "bg-[var(--mx-raised-2)]" : "hover:bg-[var(--mx-raised)]"}`}>
                <span>
                  {r.strike}
                  {itm && <span className="ml-2 text-[11px] text-[var(--mx-text-3)]">in the money</span>}
                </span>
                <span className="text-right">{g.bid === null ? "—" : g.bid.toFixed(2)}</span>
                <span className="text-right">{g.ask === null ? "—" : g.ask.toFixed(2)}</span>
                <span className="text-right text-[var(--mx-text-3)]">{g.oi ?? "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
