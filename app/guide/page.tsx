"use client";

import Link from "next/link";
import Topbar from "../components/Topbar";

// The Traxora guide — organised the same way as the app's navigation
// (Workspace → Markets → Tools), written for someone opening it for the first
// time. Monochrome tokens (app/monochrome.css).

type Item = { h: string; t: string };
type Section = { id: string; group: string; title: string; summary: string; href?: string; items: Item[]; note?: string };

const START: Item[] = [
  { h: "Read the Overview", t: "Open Overview. The headline says whether anything needs you; the four numbers below link to the detail." },
  { h: "Research one symbol", t: "Go to Options and search a ticker, or open Signals. Read the reason before the result — it tells you what was checked." },
  { h: "Practise and record", t: "Try ideas with simulated money in the Paper portfolio, and save analyses to your notebook so you can review them later." },
];

const SECTIONS: Section[] = [
  {
    id: "overview", group: "Workspace", title: "Overview", href: "/dashboard",
    summary: "Your home screen: what needs attention now, then your watchlist, futures and market mood.",
    items: [
      { h: "The headline", t: "One sentence: a validated options candidate, a strong watchlist signal, or “nothing needs your attention”. Waiting is a normal, useful answer." },
      { h: "The four numbers", t: "Options (validated vs. no trade), Watchlist (symbols and strong signals), Paper portfolio (open simulated positions) and Journal (saved entries). Each one links to its page." },
      { h: "Watchlist", t: "Each card shows Buy, Hold or Sell with confidence, a small price trend and a trade plan (entry, stop, target). Use Edit to add or remove symbols." },
      { h: "Price alerts", t: "Tap the bell on a watchlist card and set an above and/or below price. Traxora checks every minute and notifies you once when a level is hit." },
      { h: "Futures and market mood", t: "Further down: index, metal and energy futures, plus a one-line read of overall market sentiment." },
    ],
  },
  {
    id: "options", group: "Workspace", title: "Options", href: "/options",
    summary: "Every symbol is checked against the same fixed rules. You get a candidate only when all checks pass — otherwise a plain explanation of why not.",
    items: [
      { h: "States", t: "Validated estimate — every check passed. No trade — the analysis finished and found nothing qualifying. Expired — a result whose data is no longer fresh (kept as history). Data unavailable — required inputs couldn’t be fetched. Paper only — always shown, because options analysis is never a live instruction." },
      { h: "How a decision is made", t: "1) Data is read with its source and time. 2) Checks run: is the market open, are prices and quotes fresh, is there enough liquidity, is there an earnings event before expiry, is there a defined exit. 3) Seven evidence checks are scored. A candidate needs every gate and at least four checks." },
      { h: "Research page", t: "Open any symbol to see: observations with their source times, the thesis, a price chart with levels, a to-scale range diagram, every option leg, the estimated max loss and gain (calculated by the app), and the invalidation and time stop together." },
      { h: "Evidence strength", t: "Low, moderate or high describes how much of the supplied evidence agrees. It is not a probability of profit." },
      { h: "Your own data", t: "If you have quotes with the time each bid and ask was set, paste them on the Options page. The same checks run on them. Your data is checked for consistency, not verified, and is never stored or shared." },
      { h: "Saving", t: "Save to notebook records the decision exactly as it was — including no-trade results — so you can compare it with later analyses." },
    ],
    note: "Free public option quotes don’t include the time each bid and ask was set, so most results read “Quote time unavailable”. That is the analysis being honest, not a fault.",
  },
  {
    id: "signals", group: "Workspace", title: "Signals", href: "/analysis",
    summary: "A Buy, Hold or Sell read on any ticker, with the levels behind it.",
    items: [
      { h: "Search a ticker", t: "Use the search bar at the top of any page, or type it on the Signals page." },
      { h: "Read the plan", t: "Entry zone, stop and target come with the reasons behind them — order blocks, fair value gaps and liquidity levels (see the glossary)." },
      { h: "Practise it", t: "Use Trade to open a pre-filled paper position. Adjust size and stop before confirming." },
    ],
  },
  {
    id: "paper", group: "Workspace", title: "Paper portfolio", href: "/paper",
    summary: "Practise with $100,000 of simulated money. Nothing here touches a real account.",
    items: [
      { h: "Open and close positions", t: "Positions can be long or short stocks with an optional stop and target. Stops and targets close automatically when hit." },
      { h: "Risk settings", t: "Set an account size and a risk percentage per trade; the portfolio shows how much is at risk across open positions." },
      { h: "Results", t: "Open and closed simulations are kept separate. Simulated results don’t show that a strategy would work with real money." },
    ],
  },
  {
    id: "journal", group: "Workspace", title: "Journal", href: "/journal",
    summary: "A record of what you did and why — written as it happened.",
    items: [
      { h: "Trade entries", t: "Closing a paper position adds a journal entry automatically, with a short review you can read later." },
      { h: "Saved analyses", t: "Options analyses you save appear here too. Later saves for the same symbol show what changed, so earlier decisions are never rewritten." },
      { h: "Export", t: "Download your journal as a CSV file from the journal page." },
    ],
  },
  {
    id: "markets", group: "Markets", title: "Markets",
    summary: "The other markets, in the same layout. On phones, open them from the Markets tab.",
    items: [
      { h: "Stocks", t: "Screener and movers for US stocks, plus the top 500 companies." },
      { h: "Crypto", t: "Major coins with recent moves and a 30-day trend; crypto trades around the clock." },
      { h: "Futures", t: "Index, metal and energy futures. New to futures? Start with the interactive tutorial below." },
      { h: "Sports", t: "Win-probability estimates from team season records — for information only, not betting advice." },
      { h: "Earnings and IPOs", t: "Upcoming earnings dates and new listings. Earnings before an option’s expiry block single-option candidates." },
      { h: "News and sentiment", t: "A filterable news feed and an overall market mood read." },
    ],
  },
  {
    id: "tools", group: "Tools", title: "Tools",
    summary: "Extra utilities, under Tools on desktop and More on phones.",
    items: [
      { h: "Options screener", t: "A broader options and futures scan with chain viewer and P&L calculator." },
      { h: "Compare", t: "Two stocks side by side." },
      { h: "Wheel planner", t: "Track cash-secured puts and covered calls, and scan for wheel candidates." },
      { h: "Stats and history", t: "Performance statistics and the full list of closed trades." },
      { h: "Ask AI", t: "Chat about markets and the app. It uses an AI model and says so; it can be wrong." },
      { h: "Morning brief and deep scan", t: "A pre-market summary, and an on-demand scan of many tickers. The scan opens from Scan in the top bar." },
    ],
  },
  {
    id: "data", group: "Reference", title: "Reading the data",
    summary: "How to tell what’s current, what’s estimated and what’s missing.",
    items: [
      { h: "Delays", t: "Prices come from free public sources and are usually delayed around 15 minutes. Every observation shows its source and time in US Eastern time." },
      { h: "Unavailable means unknown", t: "Missing values are shown as “Unavailable”, never as zero. A missing quote time is different from an old one." },
      { h: "Event coverage", t: "“No events in verified coverage” means the calendar was checked through that date. “Event coverage unavailable” means it couldn’t be checked — that is not the same as no events." },
      { h: "Estimates", t: "Max loss, max gain and breakeven are calculated by the app at a conservative fill (pay the ask, receive the bid) and exclude fees. Real fills and early assignment can change results." },
    ],
  },
  {
    id: "settings", group: "Reference", title: "Tours, themes and settings",
    summary: "Small things that make the app easier to use.",
    items: [
      { h: "Do I need an account?", t: "No. Everything works without signing in. Sign in with Google only to use the AI features (Ask AI, deep analysis, the morning brief, journal coaching) and to keep your data in sync across devices." },
      { h: "Tours", t: "Overview and Options each have a short tour. Replay it from the Tour button; on a keyboard use ← → to move and Esc to close." },
      { h: "Light and dark", t: "Switch theme from the top bar or the sidebar. Both themes use the same layout." },
      { h: "Notifications", t: "Allow browser notifications to get signal and price alerts. You can pause them from the Overview header." },
      { h: "Install the app", t: "Add Traxora to your home screen from Settings for a full-screen app." },
    ],
  },
];

const GLOSSARY: Item[] = [
  { h: "DTE", t: "Days to expiry of an option contract." },
  { h: "IV / IV rank", t: "Implied volatility — the market’s expected movement. IV rank compares today’s IV with its own past; it is not a valuation." },
  { h: "Delta", t: "Roughly how much an option’s price moves for a 1-point move in the underlying." },
  { h: "Spread", t: "Buying one option and selling another of the same type and expiry, which caps both risk and reward." },
  { h: "Iron condor", t: "Two spreads — a put spread below price and a call spread above — for a range-bound view." },
  { h: "Expected move", t: "An estimate, from option prices, of how far the underlying might move by a given expiry." },
  { h: "Invalidation", t: "The supplied price condition that says the idea is wrong. A plan can’t guarantee a fill at that level." },
  { h: "Order block", t: "The last opposing candle before a strong move — a zone where large orders may sit." },
  { h: "Fair value gap", t: "A gap left by a fast three-candle move that price often revisits." },
  { h: "Liquidity", t: "Clusters of stop orders above highs or below lows that price may sweep." },
];

export default function GuidePage() {
  const groups = [...new Set(SECTIONS.map(s => s.group))];
  return (
    <div className="min-h-screen bg-[var(--mx-canvas)] text-[var(--mx-text)]">
      <Topbar />
      <main className="px-4 sm:px-6 lg:px-8 pb-28">
        <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          {/* Table of contents */}
          <nav aria-label="Guide contents" className="hidden lg:block pt-14">
            <div className="sticky top-20 space-y-5">
              {groups.map(g => (
                <div key={g}>
                  <p className="mx-label mb-2">{g}</p>
                  <ul className="space-y-1">
                    {SECTIONS.filter(s => s.group === g).map(s => (
                      <li key={s.id}><a href={`#${s.id}`} className="text-[13.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">{s.title}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <p className="mx-label mb-2">More</p>
                <ul className="space-y-1">
                  <li><a href="#glossary" className="text-[13.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Glossary</a></li>
                  <li><Link href="/futures-tutorial" className="text-[13.5px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Futures tutorial</Link></li>
                </ul>
              </div>
            </div>
          </nav>

          <div className="min-w-0">
            <header className="pt-10 sm:pt-14">
              <p className="mx-label">Guide</p>
              <h1 className="mt-4 text-[36px] sm:text-[48px] leading-[1.04] tracking-[-0.035em] max-w-[18ch]" style={{ fontWeight: 450 }}>
                How Traxora works.
              </h1>
              <p className="mt-4 text-[16px] leading-relaxed text-[var(--mx-text-2)] max-w-[60ch]">
                Traxora reads public market data, checks it against clear rules, and tells you whether there’s something worth practising — or why there isn’t. This guide follows the same order as the app.
              </p>
              {/* Mobile contents */}
              <div className="lg:hidden mt-6 flex flex-wrap gap-2">
                {SECTIONS.map(s => (
                  <a key={s.id} href={`#${s.id}`} className="h-8 px-3 inline-flex items-center rounded-full border border-[var(--mx-line-strong)] text-[13px] text-[var(--mx-text-2)]">{s.title}</a>
                ))}
                <a href="#glossary" className="h-8 px-3 inline-flex items-center rounded-full border border-[var(--mx-line-strong)] text-[13px] text-[var(--mx-text-2)]">Glossary</a>
              </div>
            </header>

            <section className="mt-10 rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 sm:p-6" aria-labelledby="start-h">
              <h2 id="start-h" className="mx-label">Start in three steps</h2>
              <ol className="mt-4 grid sm:grid-cols-3 gap-5">
                {START.map((s, i) => (
                  <li key={s.h}>
                    <p className="font-mono text-[12px] text-[var(--mx-text-3)]">0{i + 1}</p>
                    <p className="mt-2 text-[16px]">{s.h}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--mx-text-2)]">{s.t}</p>
                  </li>
                ))}
              </ol>
            </section>

            {SECTIONS.map(s => (
              <section key={s.id} id={s.id} className="mt-14 scroll-mt-20" aria-labelledby={`${s.id}-h`}>
                <div className="flex items-end justify-between gap-4 flex-wrap border-b border-[var(--mx-line)] pb-4">
                  <div className="min-w-0">
                    <p className="mx-label">{s.group}</p>
                    <h2 id={`${s.id}-h`} className="mt-2 text-[26px] sm:text-[30px] leading-[1.1] tracking-[-0.025em]" style={{ fontWeight: 450 }}>{s.title}</h2>
                    <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">{s.summary}</p>
                  </div>
                  {s.href && (
                    <Link href={s.href} className="h-9 px-4 inline-flex items-center rounded-[8px] border border-[var(--mx-line-strong)] text-[13.5px] hover:border-[var(--mx-control)]">
                      Open {s.title}
                    </Link>
                  )}
                </div>
                <dl className="mt-2 divide-y divide-[var(--mx-line)]">
                  {s.items.map(it => (
                    <div key={it.h} className="py-4 grid sm:grid-cols-[180px_minmax(0,1fr)] gap-1 sm:gap-6">
                      <dt className="text-[15px]">{it.h}</dt>
                      <dd className="m-0 text-[14.5px] leading-relaxed text-[var(--mx-text-2)]">{it.t}</dd>
                    </div>
                  ))}
                </dl>
                {s.note && (
                  <p className="mt-2 rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-raised)] px-4 py-3 text-[14px] text-[var(--mx-text-2)]">{s.note}</p>
                )}
              </section>
            ))}

            <section id="glossary" className="mt-14 scroll-mt-20" aria-labelledby="glossary-h">
              <div className="border-b border-[var(--mx-line)] pb-4">
                <p className="mx-label">Reference</p>
                <h2 id="glossary-h" className="mt-2 text-[26px] sm:text-[30px] leading-[1.1] tracking-[-0.025em]" style={{ fontWeight: 450 }}>Glossary</h2>
              </div>
              <dl className="mt-2 grid sm:grid-cols-2 gap-x-10">
                {GLOSSARY.map(g => (
                  <div key={g.h} className="py-3 border-b border-[var(--mx-line)]">
                    <dt className="text-[15px]">{g.h}</dt>
                    <dd className="m-0 mt-1 text-[14px] leading-relaxed text-[var(--mx-text-2)]">{g.t}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <Link href="/futures-tutorial" className="mt-14 flex items-center justify-between gap-4 rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 hover:border-[var(--mx-line-strong)]">
              <div>
                <p className="mx-label">Interactive</p>
                <p className="mt-2 text-[17px]">Futures tutorial for beginners</p>
                <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">Eight short steps with a quiz after each one.</p>
              </div>
              <span aria-hidden="true" className="text-[var(--mx-text-3)]">→</span>
            </Link>

            <p className="mt-10 text-[13px] text-[var(--mx-text-3)]">Educational analysis, not financial advice. Options involve risk of loss, including the full amount invested.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
