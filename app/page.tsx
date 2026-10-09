"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Landing page — shown to everyone at "/". No account is needed: every button
// opens the dashboard. (Only AI-model features ask for sign-in, where used.) Monochrome tokens
// (app/monochrome.css). The preview is a labelled illustration of the app's
// layout, not live market data; no testimonials or performance claims.

const AREAS = [
  { k: "Overview", t: "One sentence on whether anything needs you, then the numbers that matter." },
  { k: "Options", t: "Every symbol checked against fixed rules. A candidate, or a plain reason why not." },
  { k: "Signals", t: "Buy, hold or sell reads on any ticker, with the levels behind them." },
  { k: "Paper & journal", t: "Practise with simulated money and keep a record of every decision." },
];

const STEPS = [
  { n: "01", h: "Reads the data, with its time", t: "Prices, option chains, price history and the event calendar — each labelled with where it came from and how old it is." },
  { n: "02", h: "Checks every gate", t: "Freshness, liquidity, events before expiry, a defined exit. The same rules every time, no model guessing." },
  { n: "03", h: "Shows a candidate — or why not", t: "When everything passes you see the legs, the estimated max loss and the exit plan. When it doesn’t, you see what’s missing." },
];

const MARKETS = ["Stocks", "Options", "Futures", "Crypto", "Sports", "Earnings & IPOs", "News & sentiment", "Wheel strategy"];

const PRINCIPLES = [
  { h: "Paper first", t: "Options analysis is paper-trading only. Nothing here is an instruction to place a live trade." },
  { h: "Rules you can read", t: "Options decisions come from fixed, published checks — the same input always gives the same answer." },
  { h: "Honest about data", t: "Free public data is delayed. Times and sources are shown, and missing data is called out, never filled in." },
];

const FAQ = [
  { q: "What is Traxora?", a: "A research workspace for stocks, options, futures and crypto. It reads public market data, checks it against clear rules, and shows either a setup worth practising on paper or the reason there isn’t one." },
  { q: "Do I need an account?", a: "No. Open the dashboard and everything works. Signing in with Google is only needed for the AI features — Ask AI, deep analysis, the morning brief and journal coaching — and to sync your data across devices." },
  { q: "Why do I so often see “No trade”?", a: "Because waiting is usually the right call. A candidate only appears when every check passes — fresh quotes, enough liquidity, no event before expiry, a defined exit. Otherwise you see exactly which check failed and what would change it." },
  { q: "Is the market data live?", a: "No. It comes from free public sources and is typically delayed around 15 minutes. Every price shows its source and time, and anything missing is labelled “Unavailable” rather than guessed." },
  { q: "Can I place real trades from Traxora?", a: "No. Options analysis is paper-trading only, and the paper portfolio uses simulated money. Traxora is for research and practice, not order placement." },
  { q: "Does it use AI?", a: "The options analysis is rule-based — the same inputs always give the same answer, with no AI model involved. A few optional tools, like Ask AI and journal coaching, use an AI model and say so." },
  { q: "Do I need trading experience?", a: "No. Every result explains itself in plain words — what was observed, what passed and what didn’t — so beginners learn as they go. The guide covers the basics." },
  { q: "Is this financial advice?", a: "No. Traxora is an educational research tool built on public market data. Do your own research and consult a licensed professional before investing." },
];

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden="true" className="grid place-items-center w-6 h-6 rounded-[6px] bg-[var(--mx-text)] text-[var(--mx-canvas)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 16 9 10 13 14 21 6" /></svg>
      </span>
      <span className="text-[17px] tracking-[-0.03em]">traxora</span>
    </span>
  );
}

function Preview() {
  const stats = [["Options", "0", "validated · 31 no trade"], ["Watchlist", "9", "0 strong signals"], ["Paper portfolio", "2", "open positions"], ["Journal", "4", "saved entries"]];
  return (
    <figure className="m-0">
      <div className="rounded-[16px] border border-[var(--mx-line)] bg-[var(--mx-surface)] overflow-hidden shadow-[var(--mx-shadow)]" aria-hidden="true">
        <div className="flex">
          <div className="hidden sm:block w-[150px] shrink-0 border-r border-[var(--mx-line)] p-4 space-y-4">
            <Wordmark />
            {[["Workspace", ["Overview", "Options", "Signals", "Paper portfolio", "Journal"]], ["Markets", ["Stocks", "Crypto", "Futures", "Sports"]]].map(([g, items]) => (
              <div key={g as string}>
                <p className="mx-label mb-1.5">{g as string}</p>
                {(items as string[]).map((i, n) => (
                  <p key={i} className={`text-[12.5px] px-2 py-1 rounded-[6px] ${g === "Workspace" && n === 0 ? "bg-[var(--mx-raised-2)] text-[var(--mx-text)]" : "text-[var(--mx-text-3)]"}`}>{i}</p>
                ))}
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0 p-5 sm:p-6">
            <p className="mx-label">NYSE closed · Delayed data</p>
            <p className="mt-3 text-[22px] sm:text-[26px] leading-[1.1] tracking-[-0.025em]" style={{ fontWeight: 450 }}>Nothing needs your attention right now.</p>
            <div className="mt-5 grid grid-cols-2 rounded-[10px] border border-[var(--mx-line)] overflow-hidden">
              {stats.map(([k, v, s], i) => (
                <div key={k} className={`p-3 border-[var(--mx-line)] ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}>
                  <p className="mx-label">{k}</p>
                  <p className="mt-1.5 font-mono text-[20px] leading-none">{v}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--mx-text-3)]">{s}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[10px] border border-[var(--mx-line)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px]">Options</p>
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--mx-line-strong)] text-[var(--mx-text-2)]">Paper only</span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--mx-text-3)]">Quote time unavailable — refresh won’t help; supply timestamped data or wait.</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 mx-label">Illustration of the app layout — not live market data</figcaption>
    </figure>
  );
}

export default function HomePage() {
  const router = useRouter();
  const launch = () => router.push("/dashboard");
  const primaryLabel = "Open dashboard";

  return (
    <div className="min-h-screen bg-[var(--mx-canvas)] text-[var(--mx-text)]">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-20 border-b border-[var(--mx-line)] bg-[color-mix(in_srgb,var(--mx-canvas)_88%,transparent)] backdrop-blur-sm">
        <nav className="max-w-6xl mx-auto h-14 px-5 sm:px-8 flex items-center justify-between gap-4" aria-label="Main">
          <Link href="/" aria-label="Traxora home"><Wordmark /></Link>
          <div className="hidden md:flex items-center gap-7 text-[14px] text-[var(--mx-text-2)]">
            <a href="#how" className="hover:text-[var(--mx-text)]">How it works</a>
            <a href="#markets" className="hover:text-[var(--mx-text)]">Markets</a>
            <a href="#faq" className="hover:text-[var(--mx-text)]">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={launch} className="h-9 px-4 rounded-[8px] bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">
              {primaryLabel}
            </button>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-14 items-center">
          <div>
            <p className="mx-label">Options · Stocks · Crypto · Paper trading</p>
            <h1 className="mt-5 text-[40px] sm:text-[56px] leading-[1.02] tracking-[-0.035em] max-w-[14ch]" style={{ fontWeight: 450 }}>
              Know when to trade — and when to wait.
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-[var(--mx-text-2)] max-w-[48ch]">
              Traxora reads public market data, checks it against clear rules, and tells you plainly whether there’s a setup worth practising — or why there isn’t.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={launch} className="h-11 px-5 rounded-[9px] bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px]">
                {primaryLabel}
              </button>
              <a href="#how" className="h-11 px-5 inline-flex items-center rounded-[9px] border border-[var(--mx-line-strong)] text-[15px] hover:border-[var(--mx-control)]">
                How it works
              </a>
            </div>
            <p className="mt-4 text-[13px] text-[var(--mx-text-3)]">
              No account needed. Educational tool — not financial advice.
            </p>
          </div>
          <Preview />
        </section>

        {/* ── Workspace areas ── */}
        <section className="border-y border-[var(--mx-line)]">
          <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4">
            {AREAS.map((a, i) => (
              <div key={a.k} className={`px-5 sm:px-8 py-8 border-[var(--mx-line)] ${i > 0 ? "border-t sm:border-t-0" : ""} ${i % 2 === 1 ? "sm:border-l" : ""} ${i >= 2 ? "sm:border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}>
                <p className="mx-label">{a.k}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--mx-text-2)]">{a.t}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16">
          <p className="mx-label">How it decides</p>
          <h2 className="mt-4 text-[32px] sm:text-[40px] leading-[1.06] tracking-[-0.03em] max-w-[20ch]" style={{ fontWeight: 450 }}>
            The same checks, every symbol, every time.
          </h2>
          <ol className="mt-12 grid md:grid-cols-3 gap-4">
            {STEPS.map(s => (
              <li key={s.n} className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-6">
                <p className="font-mono text-[13px] text-[var(--mx-text-3)]">{s.n}</p>
                <p className="mt-6 text-[18px] tracking-[-0.01em]">{s.h}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--mx-text-2)]">{s.t}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Markets ── */}
        <section id="markets" className="bg-[var(--mx-surface)] border-y border-[var(--mx-line)] scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-[1fr_1.4fr] gap-10">
            <div>
              <p className="mx-label">Markets</p>
              <h2 className="mt-4 text-[32px] leading-[1.08] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Everything in one calm workspace.</h2>
              <p className="mt-4 text-[15px] text-[var(--mx-text-2)] max-w-[42ch]">Stocks and options lead. The other markets sit one tap away, in the same layout and language.</p>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {MARKETS.map(m => (
                <li key={m} className="rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-canvas)] p-4 text-[14px]">{m}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Principles ── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <p className="mx-label">Principles</p>
          <div className="mt-8 grid md:grid-cols-3 gap-10">
            {PRINCIPLES.map(p => (
              <div key={p.h} className="border-t border-[var(--mx-line-strong)] pt-5">
                <p className="text-[18px] tracking-[-0.01em]">{p.h}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--mx-text-2)]">{p.t}</p>
              </div>
            ))}
          </div>
        </section>


        {/* ── FAQ ── */}
        <section id="faq" className="border-t border-[var(--mx-line)] scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-[1fr_1.6fr] gap-10">
            <div>
              <p className="mx-label">FAQ</p>
              <h2 className="mt-4 text-[32px] leading-[1.08] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Common questions.</h2>
            </div>
            <div className="divide-y divide-[var(--mx-line)] border-y border-[var(--mx-line)]">
              {FAQ.map(f => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[16px]">
                    {f.q}
                    <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                  </summary>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--mx-text-2)] max-w-[62ch]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-24">
          <div className="border-t border-[var(--mx-line-strong)] pt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <h2 className="text-[32px] sm:text-[44px] leading-[1.04] tracking-[-0.035em] max-w-[16ch]" style={{ fontWeight: 450 }}>
              Practise the discipline of waiting.
            </h2>
            <button type="button" onClick={launch} className="h-11 px-5 rounded-[9px] bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] self-start sm:self-auto">
              {primaryLabel}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--mx-line)]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row gap-4 sm:items-center justify-between text-[13px] text-[var(--mx-text-3)]">
          <p>© {new Date().getFullYear()} Traxora · Educational analysis, not financial advice.</p>
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            <Link href="/guide" className="hover:text-[var(--mx-text)]">Guide</Link>
            <Link href="/privacy" className="hover:text-[var(--mx-text)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--mx-text)]">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
