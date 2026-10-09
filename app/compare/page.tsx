"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import type { CompareStats } from "@/app/api/market/compare/route";

// Compare two stocks in plain words. Data: /api/market/compare (Nasdaq +
// Yahoo prices). Every row says what the number means; missing data is shown
// as "Not available", never guessed.

type Slot = { symbol: string; data: CompareStats | null; loading: boolean; error: string | null };

const PICKS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "KO"];

const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
function size(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  return `$${(n / 1e6).toFixed(0)} million`;
}
const tone = (n: number) => (n > 0 ? "text-[var(--mx-up)]" : n < 0 ? "text-[var(--mx-down)]" : "text-[var(--mx-text-2)]");
const NA = <span className="text-[var(--mx-text-3)]">Not available</span>;

type Row = { label: string; hint: string; render: (d: CompareStats) => React.ReactNode };

const ROWS: Row[] = [
  {
    label: "Price", hint: "Last price and its change on the latest trading day.",
    render: d => d.price == null ? NA : (
      <>
        <span className="font-mono text-[18px]">{usd(d.price)}</span>
        {d.prevClose ? <span className={`block text-[13px] ${tone(d.price - d.prevClose)}`}>{d.price >= d.prevClose ? "+" : "−"}{Math.abs((d.price / d.prevClose - 1) * 100).toFixed(2)}% that day</span> : null}
      </>
    ),
  },
  {
    label: "Company size", hint: "What the whole company is worth on the stock market.",
    render: d => d.marketCap == null ? NA : <span className="font-mono">{size(d.marketCap)}</span>,
  },
  {
    label: "Profit per share", hint: "How much the company earned for each share over the last 12 months.",
    render: d => d.epsTTM == null ? NA : <span className={`font-mono ${d.epsTTM < 0 ? "text-[var(--mx-down)]" : ""}`}>{d.epsTTM < 0 ? "−" : ""}{usd(Math.abs(d.epsTTM))}{d.epsTTM < 0 ? " (a loss)" : ""}</span>,
  },
  {
    label: "Price vs. profit", hint: "How many dollars you pay for $1 of yearly profit (P/E). Lower can mean cheaper.",
    render: d => d.pe == null ? (d.epsTTM != null && d.epsTTM <= 0 ? <span className="text-[var(--mx-text-3)]">No profit to compare</span> : NA) : (
      <><span className="font-mono">{d.pe.toFixed(1)}</span><span className="block text-[13px] text-[var(--mx-text-3)]">{usd(d.pe)} per $1 of profit</span></>
    ),
  },
  {
    label: "Past year", hint: "Lowest and highest price in the last 12 months, and where it is now.",
    render: d => {
      if (d.yearLow == null || d.yearHigh == null) return NA;
      const pos = d.price != null && d.yearHigh > d.yearLow ? Math.min(1, Math.max(0, (d.price - d.yearLow) / (d.yearHigh - d.yearLow))) : null;
      return (
        <div className="max-w-[220px]">
          {pos != null && (
            <div className="relative h-1.5 mt-2 rounded-full bg-[var(--mx-raised-2)]" aria-hidden="true">
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--mx-text)] border-2 border-[var(--mx-surface)]" style={{ left: `${pos * 100}%` }} />
            </div>
          )}
          <div className="mt-1.5 flex justify-between font-mono text-[12.5px] text-[var(--mx-text-3)]"><span>{usd(d.yearLow)}</span><span>{usd(d.yearHigh)}</span></div>
          {pos != null && <span className="block text-[13px] text-[var(--mx-text-2)]">{pos > 0.85 ? "Near its high" : pos < 0.15 ? "Near its low" : "In the middle"}</span>}
        </div>
      );
    },
  },
  {
    label: "Dividend", hint: "Cash the company pays shareholders each year.",
    render: d => d.dividendYield == null ? NA : d.dividendYield === 0 ? <span className="text-[var(--mx-text-2)]">Doesn’t pay one</span> : (
      <><span className="font-mono">{d.dividendYield.toFixed(2)}% a year</span><span className="block text-[13px] text-[var(--mx-text-3)]">about {usd(d.dividendYield)} for every $100 invested</span></>
    ),
  },
  {
    label: "How bumpy", hint: "How much the price swings compared with the overall market, over the past year.",
    render: d => {
      if (d.beta == null) return NA;
      const b = d.beta;
      const words = b >= 1.3 ? "Swings a lot more than the market" : b >= 1.05 ? "Swings a bit more than the market" : b > 0.8 ? "Moves about like the market" : b > 0.3 ? "Calmer than the market" : "Moves mostly on its own";
      return <><span>{words}</span><span className="block text-[13px] text-[var(--mx-text-3)] font-mono">{b.toFixed(2)}× the market</span></>;
    },
  },
  {
    label: "What analysts say", hint: "Professional analysts’ ratings. Opinions, not guarantees.",
    render: d => {
      const a = d.analysts;
      if (!a) return NA;
      const total = a.buy + a.hold + a.sell;
      return (
        <div className="max-w-[220px]">
          <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-[var(--mx-raised-2)]" aria-hidden="true">
            <span style={{ width: `${(a.buy / total) * 100}%` }} className="bg-[var(--mx-up)]" />
            <span style={{ width: `${(a.hold / total) * 100}%` }} className="bg-[var(--mx-text-3)]" />
            <span style={{ width: `${(a.sell / total) * 100}%` }} className="bg-[var(--mx-down)]" />
          </div>
          <span className="block mt-1.5 text-[13px] text-[var(--mx-text-2)]">{a.buy} buy · {a.hold} hold · {a.sell} sell</span>
        </div>
      );
    },
  },
  {
    label: "Analysts’ price target", hint: "Where analysts on average expect the price in about a year.",
    render: d => {
      if (!d.target) return NA;
      const up = d.price ? (d.target.mean / d.price - 1) * 100 : null;
      return (
        <>
          <span className="font-mono">{usd(d.target.mean)}</span>
          {up != null && <span className={`block text-[13px] ${tone(up)}`}>{up >= 0 ? `${up.toFixed(1)}% above` : `${Math.abs(up).toFixed(1)}% below`} today’s price</span>}
        </>
      );
    },
  },
];

function Picker({ value, onPick, label }: { value: string; onPick: (s: string) => void; label: string }) {
  const [text, setText] = useState(value);
  return (
    <form className="flex-1 min-w-0" onSubmit={e => { e.preventDefault(); const s = text.trim().toUpperCase(); if (s) onPick(s); }}>
      <label className="block text-[13px] text-[var(--mx-text-3)] mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value.toUpperCase())} placeholder="AAPL" spellCheck={false} autoComplete="off"
          className="flex-1 min-w-0 h-11 rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-canvas)] px-3 font-mono text-[15px] text-[var(--mx-text)] focus:outline-none focus:border-[var(--mx-control)]" aria-label={label} />
        <button type="submit" className="h-11 px-4 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">Show</button>
      </div>
    </form>
  );
}

export default function ComparePage() {
  const [slots, setSlots] = useState<[Slot, Slot]>([
    { symbol: "AAPL", data: null, loading: true, error: null },
    { symbol: "MSFT", data: null, loading: true, error: null },
  ]);

  const load = useCallback(async (i: 0 | 1, symbol: string) => {
    setSlots(prev => { const n = [...prev] as [Slot, Slot]; n[i] = { symbol, data: null, loading: true, error: null }; return n; });
    let data: CompareStats | null = null, error: string | null = null;
    try {
      const r = await fetch(`/api/market/compare?symbol=${encodeURIComponent(symbol)}`);
      const j = await r.json();
      if (r.ok) data = j as CompareStats; else error = j.error ?? "Couldn't load this stock.";
    } catch { error = "Couldn't load this stock. Check your connection."; }
    setSlots(prev => { const n = [...prev] as [Slot, Slot]; if (n[i].symbol === symbol) n[i] = { symbol, data, loading: false, error }; return n; });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { load(0, "AAPL"); load(1, "MSFT"); }, [load]);

  const [a, b] = slots;
  const sources = [...new Set([...(a.data?.sources ?? []), ...(b.data?.sources ?? [])])];

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[var(--mx-text)]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <header>
                <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Compare two stocks</h1>
                <p className="mt-2 text-[15px] text-[var(--mx-text-2)]">The important facts side by side, each explained in plain words.</p>
              </header>

              <section className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Picker key={`a-${a.symbol}`} value={a.symbol} onPick={s => load(0, s)} label="First stock" />
                  <Picker key={`b-${b.symbol}`} value={b.symbol} onPick={s => load(1, s)} label="Second stock" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-[var(--mx-text-3)] mr-1">Popular:</span>
                  {PICKS.map(s => (
                    <button key={s} type="button" onClick={() => load(a.symbol === s ? 1 : b.symbol === s ? 0 : 1, s)}
                      className="h-8 px-3 rounded-full border border-[var(--mx-line)] font-mono text-[12.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] hover:border-[var(--mx-line-strong)]">{s}</button>
                  ))}
                </div>
              </section>

              <section className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] overflow-hidden" aria-label="Comparison">
                {/* Column heads */}
                <div className="grid grid-cols-2 sm:grid-cols-[1.1fr_1fr_1fr] border-b border-[var(--mx-line)]">
                  <div className="hidden sm:block" />
                  {slots.map((s, i) => (
                    <div key={i} className={`p-4 sm:p-5 ${i === 1 ? "border-l border-[var(--mx-line)]" : "sm:border-l sm:border-[var(--mx-line)]"}`}>
                      <p className="font-mono text-[20px]">{s.symbol}</p>
                      <p className="mt-0.5 text-[13px] text-[var(--mx-text-3)] truncate">{s.loading ? "Loading…" : s.data?.name ?? s.error ?? ""}</p>
                      {s.data?.sector && <p className="text-[12px] text-[var(--mx-text-3)] truncate">{s.data.sector}</p>}
                      {s.data && <Link href={`/company/${encodeURIComponent(s.symbol)}`} className="mt-2 inline-block text-[12.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">More about {s.symbol} →</Link>}
                    </div>
                  ))}
                </div>

                {ROWS.map(row => (
                  <div key={row.label} className="grid grid-cols-2 sm:grid-cols-[1.1fr_1fr_1fr] border-b border-[var(--mx-line)] last:border-0">
                    <div className="col-span-2 sm:col-span-1 px-4 sm:px-5 pt-4 sm:py-4">
                      <p className="text-[15px]">{row.label}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--mx-text-3)]">{row.hint}</p>
                    </div>
                    {slots.map((s, i) => (
                      <div key={i} className={`px-4 sm:px-5 py-3 sm:py-4 text-[15px] ${i === 1 ? "border-l border-[var(--mx-line)]" : "sm:border-l sm:border-[var(--mx-line)]"}`}>
                        {s.loading ? <span className="inline-block h-4 w-20 rounded bg-[var(--mx-raised-2)] animate-pulse" />
                          : s.data ? row.render(s.data) : <span className="text-[var(--mx-text-3)]">—</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </section>

              <p className="text-[12.5px] text-[var(--mx-text-3)]">
                Sources: {sources.length ? sources.join(" and ") : "Nasdaq and Yahoo Finance"}. Prices can be up to 15 minutes behind. Profit per share adds up the last four reported quarters. For learning — not financial advice.
              </p>
            </div>
          </main>
        </div>
      </div>
    </PaywallGuard>
  );
}
