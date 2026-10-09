"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import "./landing.css";

// Landing page — shown to everyone at "/". No account is needed: every button
// opens the dashboard. (Only AI-model features ask for sign-in, where used.)
// Monochrome tokens (app/monochrome.css) plus app/landing.css. The console and
// preview are labelled illustrations, not live market data; the numbers in the
// "rules" strip are the real thresholds from app/lib/optionsAnalysis/rules.ts.
// No testimonials, logos or performance claims.

const CHECKS = [
  "Quote freshness", "Underlying age", "Leg sync ≤ 5 min", "Open interest ≥ 500", "Spread ≤ 8% of mid",
  "14–60 days to expiry", "Earnings before expiry", "Defined exit", "Estimated max loss", "Long-leg delta 0.30–0.60",
  "Paper trading only", "Review at 7 DTE",
];

const CONSOLE = [
  { k: "Quote freshness", v: "48s old", ok: true },
  { k: "Days to expiry", v: "32 DTE", ok: true },
  { k: "Open interest", v: "1,840", ok: true },
  { k: "Earnings before expiry", v: "None", ok: true },
  { k: "Bid–ask spread", v: "11.2% of mid", ok: false },
];

const STEPS = [
  { n: "01", h: "Read", t: "Prices, option chains, price history and the event calendar — each with its source and its time." },
  { n: "02", h: "Check", t: "Freshness, liquidity, events before expiry and a defined exit. Fixed rules, no model guessing." },
  { n: "03", h: "Decide", t: "A paper candidate with legs, max loss and exit plan — or the exact check that failed." },
];

const RULE_NUMBERS = [
  { v: "14–60", u: "days", t: "Swing window for an option expiry" },
  { v: "≥500", u: "OI", t: "Minimum open interest on every leg" },
  { v: "≤8%", u: "of mid", t: "Widest bid–ask spread allowed" },
  { v: "0", u: "AI calls", t: "Options decisions are pure rules" },
];

const MARKETS = ["Stocks", "Options", "Futures", "Crypto", "Sports", "Earnings", "IPOs", "News & sentiment"];

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

const H = { fontWeight: 450 } as const;

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

function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mx-up)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="5 12 10 17 19 7" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mx-down)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
  );
}

/** Animated illustration: one symbol running through the checks. */
function DecisionConsole() {
  return (
    <figure className="m-0">
      <div className="lp-frame">
        <div className="rounded-[17px] bg-[var(--mx-surface)] overflow-hidden" aria-hidden="true">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-11 border-b border-[var(--mx-line)]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--mx-raised-2)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--mx-raised-2)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--mx-raised-2)]" />
            </div>
            <p className="font-mono text-[11.5px] text-[var(--mx-text-3)] truncate">options / research / AAPL</p>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--mx-text-3)]">
              <span className="lp-pulse w-1.5 h-1.5 rounded-full bg-[var(--mx-text-2)]" /> checking
            </span>
          </div>

          <div className="grid md:grid-cols-[1.1fr_1fr]">
            <div className="relative p-5 sm:p-6 border-b md:border-b-0 md:border-r border-[var(--mx-line)]">
              <span className="lp-scanline" />
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="mx-label">Bull call spread · 32 DTE</p>
                  <p className="mt-2 font-mono text-[28px] leading-none tracking-[-0.02em]">AAPL</p>
                </div>
                <p className="font-mono text-[13px] text-[var(--mx-text-3)]">delayed</p>
              </div>
              <svg viewBox="0 0 300 90" className="mt-5 w-full h-[90px]" preserveAspectRatio="none">
                <line x1="0" y1="30" x2="300" y2="30" stroke="var(--mx-line-strong)" strokeDasharray="3 4" />
                <line x1="0" y1="66" x2="300" y2="66" stroke="var(--mx-line-strong)" strokeDasharray="3 4" />
                <polyline fill="none" stroke="var(--mx-text)" strokeWidth="1.6" strokeLinejoin="round"
                  points="0,70 20,64 40,68 60,58 80,61 100,52 120,55 140,47 160,50 180,42 200,46 220,38 240,41 260,35 280,39 300,33" />
              </svg>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--mx-text-3)]">
                <span>support</span><span>resistance</span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <p className="mx-label">Checks</p>
              <ul className="mt-3 space-y-2.5">
                {CONSOLE.map((c, i) => (
                  <li key={c.k} className="lp-check flex items-center justify-between gap-3 text-[13px]" style={{ animationDelay: `${0.5 + i * 0.45}s` }}>
                    <span className="flex items-center gap-2 text-[var(--mx-text-2)]"><Tick ok={c.ok} />{c.k}</span>
                    <span className="font-mono text-[12px] text-[var(--mx-text-3)]">{c.v}</span>
                  </li>
                ))}
              </ul>
              <div className="lp-verdict mt-5 rounded-[10px] border border-[var(--mx-line-strong)] p-3" style={{ animationDelay: `${0.5 + CONSOLE.length * 0.45 + 0.2}s` }}>
                <p className="text-[14px]">No trade</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--mx-text-3)]">Spread is 11.2% of mid, above the 8% limit. Re-check when quotes tighten.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center mx-label">Illustration — not live market data</figcaption>
    </figure>
  );
}

function Bento() {
  return (
    <div className="mt-12 grid gap-3 md:grid-cols-6">
      {/* Overview */}
      <div className="lp-card md:col-span-4 rounded-[16px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-6 sm:p-7 overflow-hidden">
        <p className="mx-label">Overview</p>
        <p className="mt-3 text-[22px] tracking-[-0.02em] max-w-[24ch]" style={H}>One sentence on whether anything needs you.</p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 rounded-[10px] border border-[var(--mx-line)] overflow-hidden" aria-hidden="true">
          {[["Options", "0", "validated"], ["Watchlist", "9", "symbols"], ["Paper", "2", "open"], ["Journal", "4", "entries"]].map(([k, v, s], i) => (
            <div key={k} className={`p-3 border-[var(--mx-line)] ${i % 2 === 0 ? "border-r" : "sm:border-r"} ${i < 2 ? "border-b sm:border-b-0" : ""} ${i === 3 ? "sm:border-r-0" : ""}`}>
              <p className="mx-label">{k}</p>
              <p className="mt-1.5 font-mono text-[20px] leading-none">{v}</p>
              <p className="mt-1 text-[11px] text-[var(--mx-text-3)]">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Signals */}
      <div className="lp-card md:col-span-2 rounded-[16px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-6 sm:p-7">
        <p className="mx-label">Signals</p>
        <p className="mt-3 text-[18px] tracking-[-0.01em]">Buy, hold or sell — with the levels behind it.</p>
        <ul className="mt-5 space-y-2 font-mono text-[12.5px]" aria-hidden="true">
          {[["NVDA", "BUY", "var(--mx-up)"], ["MSFT", "HOLD", "var(--mx-text-3)"], ["TSLA", "SELL", "var(--mx-down)"]].map(([s, v, c]) => (
            <li key={s} className="flex items-center justify-between rounded-[8px] border border-[var(--mx-line)] px-3 py-2">
              <span>{s}</span><span style={{ color: c }}>{v}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Paper & journal */}
      <div className="lp-card md:col-span-2 rounded-[16px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-6 sm:p-7">
        <p className="mx-label">Paper & journal</p>
        <p className="mt-3 text-[18px] tracking-[-0.01em]">Practise with simulated money. Keep a record of every decision.</p>
        <div className="mt-5 flex items-end gap-1.5 h-16" aria-hidden="true">
          {[30, 45, 38, 60, 52, 70, 64, 82].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-[3px] bg-[var(--mx-raised-2)]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Markets */}
      <div id="markets" className="lp-card md:col-span-4 rounded-[16px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-6 sm:p-7 scroll-mt-20">
        <p className="mx-label">Markets</p>
        <p className="mt-3 text-[22px] tracking-[-0.02em] max-w-[26ch]" style={H}>Every market, one calm workspace.</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {MARKETS.map(m => (
            <li key={m} className="rounded-full border border-[var(--mx-line)] px-3.5 py-1.5 text-[13px] text-[var(--mx-text-2)]">{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const launch = () => router.push("/dashboard");
  const primaryLabel = "Open dashboard";

  return (
    <div className="min-h-screen bg-[var(--mx-canvas)] text-[var(--mx-text)] overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--mx-line)] bg-[color-mix(in_srgb,var(--mx-canvas)_80%,transparent)] backdrop-blur-md">
        <nav className="max-w-6xl mx-auto h-14 px-4 sm:px-8 flex items-center justify-between gap-4" aria-label="Main">
          <Link href="/" aria-label="Traxora home"><Wordmark /></Link>
          <div className="hidden md:flex items-center gap-7 text-[14px] text-[var(--mx-text-2)]">
            <a href="#how" className="hover:text-[var(--mx-text)]">How it works</a>
            <a href="#product" className="hover:text-[var(--mx-text)]">Product</a>
            <a href="#rules" className="hover:text-[var(--mx-text)]">Rules</a>
            <a href="#faq" className="hover:text-[var(--mx-text)]">FAQ</a>
          </div>
          <button type="button" onClick={launch} className="h-9 px-4 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px] hover:opacity-90 transition-opacity">
            {primaryLabel}
          </button>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative isolate">
          <div aria-hidden="true" className="lp-grid-bg absolute inset-0 -z-10" />
          <div aria-hidden="true" className="lp-spot absolute inset-0 -z-10" />
          <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-20 sm:pt-28 pb-14 text-center">
            <Link href="/options" className="inline-flex items-center gap-2 rounded-full border border-[var(--mx-line-strong)] bg-[var(--mx-surface)] pl-2 pr-3.5 py-1 text-[12.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] transition-colors">
              <span className="rounded-full bg-[var(--mx-text)] text-[var(--mx-canvas)] px-2 py-0.5 text-[11px]">New</span>
              Rules-based options analysis
              <span aria-hidden="true">→</span>
            </Link>
            <h1 className="lp-title mt-7 mx-auto text-[44px] sm:text-[72px] lg:text-[88px] leading-[0.98] tracking-[-0.045em] max-w-[13ch]" style={H}>
              Know when to trade. And when to wait.
            </h1>
            <p className="mt-6 mx-auto text-[16px] sm:text-[18px] leading-relaxed text-[var(--mx-text-2)] max-w-[52ch]">
              Traxora reads public market data, runs it through fixed rules, and tells you plainly whether there’s a setup worth practising — or exactly why there isn’t.
            </p>
            <div className="mt-9 flex flex-wrap justify-center items-center gap-3">
              <button type="button" onClick={launch} className="h-12 px-6 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] hover:opacity-90 transition-opacity">
                {primaryLabel} <span aria-hidden="true">→</span>
              </button>
              <a href="#how" className="h-12 px-6 inline-flex items-center rounded-full border border-[var(--mx-line-strong)] text-[15px] hover:border-[var(--mx-control)] transition-colors">
                See how it decides
              </a>
            </div>
            <p className="mt-5 text-[13px] text-[var(--mx-text-3)]">Free · No account needed · Not financial advice</p>
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-8 pb-20 sm:pb-28">
            <DecisionConsole />
          </div>
        </section>

        {/* ── Checks marquee ── */}
        <section aria-label="Checks every candidate must pass" className="border-y border-[var(--mx-line)] py-5">
          <div className="lp-marquee overflow-hidden">
            <ul className="lp-marquee-track">
              {[...CHECKS, ...CHECKS].map((c, i) => (
                <li key={i} aria-hidden={i >= CHECKS.length} className="flex items-center gap-3 px-6 font-mono text-[13px] text-[var(--mx-text-3)] whitespace-nowrap">
                  <span className="w-1 h-1 rounded-full bg-[var(--mx-control)]" />{c}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-32 scroll-mt-16">
          <div className="max-w-3xl">
            <p className="mx-label">How it decides</p>
            <h2 className="mt-4 text-[34px] sm:text-[52px] leading-[1.02] tracking-[-0.04em]" style={H}>
              The same checks. Every symbol. Every time.
            </h2>
          </div>
          <ol className="mt-14 grid md:grid-cols-3 gap-10 md:gap-0">
            {STEPS.map((s, i) => (
              <li key={s.n} className="relative md:pr-10">
                <div className="flex items-center gap-4">
                  <span className="grid place-items-center w-11 h-11 rounded-full border border-[var(--mx-line-strong)] bg-[var(--mx-surface)] font-mono text-[13px]">{s.n}</span>
                  {i < STEPS.length - 1 && <span aria-hidden="true" className="lp-flow-line hidden md:block flex-1 h-px" />}
                </div>
                <p className="mt-6 text-[24px] tracking-[-0.02em]" style={H}>{s.h}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--mx-text-2)] max-w-[34ch]">{s.t}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Product bento ── */}
        <section id="product" className="border-t border-[var(--mx-line)] scroll-mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-32">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="mx-label">Product</p>
                <h2 className="mt-4 text-[34px] sm:text-[52px] leading-[1.02] tracking-[-0.04em]" style={H}>A research desk, not a tip sheet.</h2>
              </div>
              <button type="button" onClick={launch} className="self-start md:self-auto text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">
                Explore the dashboard →
              </button>
            </div>
            <Bento />
          </div>
        </section>

        {/* ── Rule numbers ── */}
        <section id="rules" className="relative isolate border-y border-[var(--mx-line)] scroll-mt-16 overflow-hidden">
          <div aria-hidden="true" className="lp-spot absolute inset-0 -z-10 rotate-180" />
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-28">
            <p className="mx-label">The rules, in numbers</p>
            <h2 className="mt-4 text-[34px] sm:text-[44px] leading-[1.04] tracking-[-0.035em] max-w-[22ch]" style={H}>Published thresholds. Nothing hidden.</h2>
            <dl className="mt-14 grid grid-cols-2 lg:grid-cols-4 border-t border-[var(--mx-line)]">
              {RULE_NUMBERS.map((r, i) => (
                <div key={r.t} className={`pt-8 pb-2 pr-4 ${i > 0 ? "lg:pl-8 lg:border-l border-[var(--mx-line)]" : ""} ${i % 2 === 1 ? "pl-4 border-l lg:border-l" : ""} ${i >= 2 ? "mt-8 lg:mt-0" : ""}`}>
                  <dt className="sr-only">{r.t}</dt>
                  <dd className="m-0">
                    <p className="lp-title text-[44px] sm:text-[64px] leading-none tracking-[-0.05em] font-mono">{r.v}</p>
                    <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--mx-text-3)]">{r.u}</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-[var(--mx-text-2)] max-w-[24ch]">{r.t}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Principles ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-28">
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { h: "Paper first", t: "Options analysis is paper-trading only, enforced on the server. Nothing here is an instruction to place a live trade." },
              { h: "Rules you can read", t: "The same input always gives the same answer. No model output decides a candidate." },
              { h: "Honest about data", t: "Free public data is delayed. Times and sources are shown, and missing data is called out, never filled in." },
            ].map(p => (
              <div key={p.h} className="border-t border-[var(--mx-line-strong)] pt-6">
                <p className="text-[20px] tracking-[-0.015em]">{p.h}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--mx-text-2)]">{p.t}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="border-t border-[var(--mx-line)] scroll-mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 grid lg:grid-cols-[1fr_1.6fr] gap-10">
            <div>
              <p className="mx-label">FAQ</p>
              <h2 className="mt-4 text-[34px] sm:text-[44px] leading-[1.04] tracking-[-0.035em]" style={H}>Common questions.</h2>
            </div>
            <div className="divide-y divide-[var(--mx-line)] border-y border-[var(--mx-line)]">
              {FAQ.map(f => (
                <details key={f.q} className="group py-5">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[16px]">
                    {f.q}
                    <span aria-hidden="true" className="grid place-items-center w-7 h-7 shrink-0 rounded-full border border-[var(--mx-line)] text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[16px] leading-none">+</span>
                  </summary>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--mx-text-2)] max-w-[62ch]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative isolate border-t border-[var(--mx-line)] overflow-hidden">
          <div aria-hidden="true" className="lp-grid-bg absolute inset-0 -z-10" />
          <div aria-hidden="true" className="lp-spot absolute inset-0 -z-10" />
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-28 sm:py-36 text-center">
            <h2 className="lp-title mx-auto text-[40px] sm:text-[68px] leading-[1] tracking-[-0.045em] max-w-[14ch]" style={H}>
              Practise the discipline of waiting.
            </h2>
            <p className="mt-5 text-[16px] text-[var(--mx-text-2)]">Free, no account needed. Open it and look around.</p>
            <button type="button" onClick={launch} className="mt-9 h-12 px-7 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] hover:opacity-90 transition-opacity">
              {primaryLabel} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--mx-line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between text-[13px] text-[var(--mx-text-3)]">
          <div className="space-y-3">
            <Wordmark />
            <p>© {new Date().getFullYear()} Traxora · Educational analysis, not financial advice.</p>
          </div>
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
