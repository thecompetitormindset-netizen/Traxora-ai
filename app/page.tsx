"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import "./landing.css";

// Landing page — shown to everyone at "/". No account is needed: every button
// opens the dashboard. (Only AI-model features ask for sign-in, where used.)
// Monochrome tokens (app/monochrome.css) plus app/landing.css. The console and
// preview are labelled illustrations, not live market data. Copy is plain
// language with as few numbers as possible; the six checks describe the real
// gates in app/lib/optionsAnalysis/rules.ts. No testimonials or performance claims.

const CHECKS = [
  "Fresh prices", "Enough people trading", "Fair buy and sell prices", "No surprise news coming",
  "Enough time to work", "A clear exit plan", "Know your worst case", "Practice money only",
];

const CONSOLE = [
  { k: "Prices are recent", ok: true },
  { k: "Enough time left", ok: true },
  { k: "Enough people trading", ok: true },
  { k: "No earnings report coming", ok: true },
  { k: "Buy and sell prices are close", ok: false },
];

const STEPS = [
  { n: "1", h: "Look", t: "We gather prices, past moves and upcoming company news — and show you how old each piece is." },
  { n: "2", h: "Check", t: "We run the same simple checks every time. No guessing and no hidden formulas." },
  { n: "3", h: "Answer", t: "You get a clear answer in plain words: worth practising, or better to wait — and why." },
];

const SIMPLE_CHECKS = [
  { h: "Fresh prices", t: "Old prices can fool you. If the prices are too old, we say so and wait." },
  { h: "Enough people trading", t: "If few people are buying and selling, it’s hard to get out. We skip those." },
  { h: "A fair price", t: "When the buy price and sell price are far apart, you lose money just getting in." },
  { h: "No surprises", t: "We avoid ideas with big company news, like earnings, coming up soon." },
  { h: "A way out", t: "Every idea comes with a plan for when to leave — before you start." },
  { h: "Your worst case", t: "You see the most you could lose up front, so nothing catches you off guard." },
];

const MARKETS = ["Stocks", "Options", "Futures", "Crypto", "Sports", "Earnings", "New listings (IPOs)", "News"];

const FAQ = [
  { q: "What is Traxora?", a: "A free tool that helps you study the markets. It looks at prices, runs simple checks, and tells you in plain words whether something is worth practising — or why it’s better to wait." },
  { q: "Do I need an account?", a: "No. Just open the dashboard. You only need to sign in with Google for the AI helpers (like Ask AI) or to keep your data on more than one device." },
  { q: "Why does it so often say “wait”?", a: "Because waiting is usually the smart move. An idea only shows up when every check passes. If one fails, we tell you which one and what would need to change." },
  { q: "Are the prices live?", a: "Not quite. They come from free public sources and are usually about 15 minutes behind. We always show how old a price is, and we never make up missing numbers." },
  { q: "Can I trade real money here?", a: "No. Everything here uses practice money. Traxora is for learning and research, not for placing real trades." },
  { q: "Does it use AI?", a: "The options checks don’t — they follow fixed rules, so the same prices always give the same answer. A few extra helpers, like Ask AI, do use AI and tell you so." },
  { q: "I’m new to trading. Is this for me?", a: "Yes. Every answer explains itself in everyday words, so you learn as you go. The guide covers the basics." },
  { q: "Is this financial advice?", a: "No. Traxora is a learning tool. Always do your own research and talk to a licensed professional before investing." },
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
                  <p className="mx-label">Option idea</p>
                  <p className="mt-2 font-mono text-[28px] leading-none tracking-[-0.02em]">AAPL</p>
                </div>
                <p className="text-[12px] text-[var(--mx-text-3)]">15 min delay</p>
              </div>
              <svg viewBox="0 0 300 90" className="mt-5 w-full h-[90px]" preserveAspectRatio="none">
                <line x1="0" y1="30" x2="300" y2="30" stroke="var(--mx-line-strong)" strokeDasharray="3 4" />
                <line x1="0" y1="66" x2="300" y2="66" stroke="var(--mx-line-strong)" strokeDasharray="3 4" />
                <polyline fill="none" stroke="var(--mx-text)" strokeWidth="1.6" strokeLinejoin="round"
                  points="0,70 20,64 40,68 60,58 80,61 100,52 120,55 140,47 160,50 180,42 200,46 220,38 240,41 260,35 280,39 300,33" />
              </svg>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--mx-text-3)]">
                <span>recent low</span><span>recent high</span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <p className="mx-label">Our checks</p>
              <ul className="mt-3 space-y-2.5">
                {CONSOLE.map((c, i) => (
                  <li key={c.k} className="lp-check flex items-center justify-between gap-3 text-[13px]" style={{ animationDelay: `${0.5 + i * 0.45}s` }}>
                    <span className="flex items-center gap-2 text-[var(--mx-text-2)]"><Tick ok={c.ok} />{c.k}</span>
                    <span className="text-[12px] text-[var(--mx-text-3)]">{c.ok ? "Yes" : "Not yet"}</span>
                  </li>
                ))}
              </ul>
              <div className="lp-verdict mt-5 rounded-[10px] border border-[var(--mx-line-strong)] p-3" style={{ animationDelay: `${0.5 + CONSOLE.length * 0.45 + 0.2}s` }}>
                <p className="text-[14px]">Better to wait</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--mx-text-3)]">The buy and sell prices are too far apart right now. Check again later.</p>
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
        <p className="mt-3 text-[22px] tracking-[-0.02em] max-w-[24ch]" style={H}>One line that tells you if anything needs you today.</p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 rounded-[10px] border border-[var(--mx-line)] overflow-hidden" aria-hidden="true">
          {[["Options", "0", "ideas today"], ["Watchlist", "9", "stocks"], ["Practice", "2", "open trades"], ["Journal", "4", "notes"]].map(([k, v, s], i) => (
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
        <p className="mt-3 text-[18px] tracking-[-0.01em]">Buy, hold or sell — with the prices to watch.</p>
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
        <p className="mx-label">Practice & journal</p>
        <p className="mt-3 text-[18px] tracking-[-0.01em]">Practise with pretend money. Write down what you did and why.</p>
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
          <Link href="/" aria-label="Traxora home" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); history.replaceState(null, "", "/"); }}>
            <Wordmark />
          </Link>
          <div className="hidden md:flex items-center gap-7 text-[14px] text-[var(--mx-text-2)]">
            <a href="#how" className="hover:text-[var(--mx-text)]">How it works</a>
            <a href="#product" className="hover:text-[var(--mx-text)]">Product</a>
            <a href="#rules" className="hover:text-[var(--mx-text)]">What we check</a>
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
              Options ideas, in plain words
              <span aria-hidden="true">→</span>
            </Link>
            <h1 className="lp-title mt-7 mx-auto text-[44px] sm:text-[72px] lg:text-[88px] leading-[0.98] tracking-[-0.045em] max-w-[13ch]" style={H}>
              Know when to trade. And when to wait.
            </h1>
            <p className="mt-6 mx-auto text-[16px] sm:text-[18px] leading-relaxed text-[var(--mx-text-2)] max-w-[52ch]">
              Traxora looks at market prices, runs simple checks, and tells you in plain words if something is worth practising — or why it’s better to wait.
            </p>
            <div className="mt-9 flex flex-wrap justify-center items-center gap-3">
              <button type="button" onClick={launch} className="h-12 px-6 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] hover:opacity-90 transition-opacity">
                {primaryLabel} <span aria-hidden="true">→</span>
              </button>
              <a href="#how" className="h-12 px-6 inline-flex items-center rounded-full border border-[var(--mx-line-strong)] text-[15px] hover:border-[var(--mx-control)] transition-colors">
                See how it works
              </a>
            </div>
            <p className="mt-5 text-[13px] text-[var(--mx-text-3)]">Free · No sign-up · For learning, not financial advice</p>
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
            <p className="mx-label">How it works</p>
            <h2 className="mt-4 text-[34px] sm:text-[52px] leading-[1.02] tracking-[-0.04em]" style={H}>
              Three steps. Same every time.
            </h2>
          </div>
          <ol className="mt-14 grid md:grid-cols-3 gap-10 md:gap-0">
            {STEPS.map((s, i) => (
              <li key={s.n} className="relative md:pr-10">
                <div className="flex items-center gap-4">
                  <span className="grid place-items-center w-11 h-11 rounded-full border border-[var(--mx-line-strong)] bg-[var(--mx-surface)] text-[15px]">{s.n}</span>
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
                <h2 className="mt-4 text-[34px] sm:text-[52px] leading-[1.02] tracking-[-0.04em]" style={H}>Everything you need, in one place.</h2>
              </div>
              <button type="button" onClick={launch} className="self-start md:self-auto text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">
                Explore the dashboard →
              </button>
            </div>
            <Bento />
          </div>
        </section>

        {/* ── What we check ── */}
        <section id="rules" className="relative isolate border-y border-[var(--mx-line)] scroll-mt-16 overflow-hidden">
          <div aria-hidden="true" className="lp-spot absolute inset-0 -z-10 rotate-180" />
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-28">
            <p className="mx-label">What we check</p>
            <h2 className="mt-4 text-[34px] sm:text-[52px] leading-[1.02] tracking-[-0.04em] max-w-[18ch]" style={H}>Simple checks. Nothing hidden.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-[var(--mx-text-2)] max-w-[52ch]">An idea only shows up when it passes all six. If one fails, we tell you which one.</p>
            <ol className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[var(--mx-line)]">
              {SIMPLE_CHECKS.map((c, i) => (
                <li key={c.h} className="border-r border-b border-[var(--mx-line)] p-6 sm:p-8">
                  <p className="text-[13px] text-[var(--mx-text-3)]">{String(i + 1).padStart(2, "0")}</p>
                  <p className="lp-title mt-6 text-[28px] sm:text-[32px] leading-[1.05] tracking-[-0.03em]" style={H}>{c.h}</p>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--mx-text-2)]">{c.t}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Principles ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 py-24 sm:py-28">
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { h: "Practice first", t: "You only ever use pretend money here. Nothing on Traxora places a real trade." },
              { h: "Same answer every time", t: "The checks follow fixed rules, so the same prices always give the same answer." },
              { h: "Honest about prices", t: "Prices are about 15 minutes behind, and we always say so. Missing numbers are never made up." },
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
            <p className="mt-5 text-[16px] text-[var(--mx-text-2)]">It’s free and there’s nothing to sign up for. Have a look around.</p>
            <button type="button" onClick={launch} className="mt-9 h-12 px-7 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] hover:opacity-90 transition-opacity">
              {primaryLabel} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--mx-line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between text-[13px] text-[var(--mx-text-3)]">
          <div className="space-y-3">
            <a href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Back to top" className="inline-block"><Wordmark /></a>
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
