"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PaywallGuard from "@/app/components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

// Market mood, in plain words. Built only from /api/sentiment's real inputs:
// the VIX (how much the market expects to swing), recent price moves of the
// big indexes, and news tone. No AI calls, no estimated "smart money" panels.

type Mood = {
  overallScore: number;            // −100 … +100
  fearGreed: number;               // 0 … 100
  label: string;                   // e.g. "Greed"
  vix: number | null;
  vixChange: number | null;
  regime: string;                  // "Risk-On" | "Risk-Off" | "Transitional"
  spyPrice: number | null; spyChange: number | null;
  qqqPrice: number | null; qqqChange: number | null;
  iwmPrice: number | null; iwmChange: number | null;
  fetchedAt: number;
  breakdown?: { weights?: { vix: number; momentum: number; news: number } };
};

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 sm:p-6";

function moodWords(score: number) {
  if (score >= 40) return "Very upbeat";
  if (score >= 10) return "Upbeat";
  if (score > -10) return "Mixed";
  if (score > -40) return "Worried";
  return "Very worried";
}
function jumpyWords(vix: number) {
  if (vix < 15) return { t: "Calm", d: "Prices are expected to move gently." };
  if (vix < 20) return { t: "Normal", d: "Ordinary day-to-day ups and downs." };
  if (vix < 30) return { t: "Nervous", d: "Bigger swings than usual are expected." };
  return { t: "Very nervous", d: "Large, fast swings are expected." };
}
function regimeWords(r: string) {
  if (/on/i.test(r)) return "Investors are willing to take chances right now.";
  if (/off/i.test(r)) return "Investors are playing it safe right now.";
  return "The mood is shifting — there’s no clear direction yet.";
}
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);
const tone = (v: number | null) => (v == null ? "text-[var(--mx-text-3)]" : v >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]");

export default function MarketSentimentPage() {
  const [m, setM] = useState<Mood | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sentiment", { cache: "no-store" });
      const d = await r.json() as Mood & { error?: string };
      if (!r.ok || d.error) { setFailed(true); return; }
      setM(d); setFailed(false);
    } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, then once a minute
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const pos = m ? Math.min(100, Math.max(0, (m.overallScore + 100) / 2)) : 50;
  const w = m?.breakdown?.weights;

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[var(--mx-text)]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
            <div className="max-w-4xl mx-auto w-full space-y-5">
              <header>
                <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">Market mood</h1>
                <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">
                  A quick read on how investors feel today, from how much the market is swinging and how prices have moved. Updates every minute.
                </p>
              </header>

              {failed && !m && <p className="text-[15px] text-[var(--mx-text-2)]">We couldn’t load the market mood right now. Please try again shortly.</p>}

              {!m && !failed && <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 rounded-[14px] bg-[var(--mx-raised)] animate-pulse" />)}</div>}

              {m && (
                <>
                  <section className={card} aria-labelledby="mood-h">
                    <p className="text-[13px] text-[var(--mx-text-3)]">Overall mood</p>
                    <p id="mood-h" className="mt-1 text-[28px] leading-tight tracking-[-0.02em]">{moodWords(m.overallScore)}</p>
                    <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">{regimeWords(m.regime)}</p>
                    <div className="mt-5 max-w-md">
                      <div className="relative h-1.5 rounded-full bg-[var(--mx-raised-2)]" aria-hidden="true">
                        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--mx-text)] border-2 border-[var(--mx-surface)]" style={{ left: `${pos}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[12px] text-[var(--mx-text-3)]"><span>Worried</span><span>Mixed</span><span>Upbeat</span></div>
                    </div>
                    <p className="mt-4 text-[13px] text-[var(--mx-text-3)]">Fear & greed: {Math.round(m.fearGreed)} out of 100 ({m.label.toLowerCase()})</p>
                  </section>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <section className={card} aria-labelledby="jumpy-h">
                      <p className="text-[13px] text-[var(--mx-text-3)]">How jumpy is the market?</p>
                      {m.vix != null ? (
                        <>
                          <p id="jumpy-h" className="mt-1 text-[20px]">{jumpyWords(m.vix).t}</p>
                          <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">{jumpyWords(m.vix).d}</p>
                          <p className="mt-3 text-[12px] text-[var(--mx-text-3)]">Based on the VIX “fear gauge”: {m.vix.toFixed(1)}</p>
                        </>
                      ) : <p id="jumpy-h" className="mt-1 text-[15px] text-[var(--mx-text-3)]">Not available right now</p>}
                    </section>

                    <section className={card} aria-labelledby="idx-h">
                      <p id="idx-h" className="text-[13px] text-[var(--mx-text-3)]">Big indexes today</p>
                      <ul className="mt-2 divide-y divide-[var(--mx-line)]">
                        {[
                          ["S&P 500", "500 large US companies", m.spyPrice, m.spyChange],
                          ["Nasdaq 100", "Mostly tech companies", m.qqqPrice, m.qqqChange],
                          ["Russell 2000", "Smaller companies", m.iwmPrice, m.iwmChange],
                        ].map(([name, sub, price, ch]) => (
                          <li key={name as string} className="py-2.5 flex items-center justify-between gap-3">
                            <span>
                              <span className="block text-[14px]">{name as string}</span>
                              <span className="block text-[12px] text-[var(--mx-text-3)]">{sub as string}</span>
                            </span>
                            <span className="text-right">
                              <span className={`block text-[14px] ${tone(ch as number | null)}`}>{pct(ch as number | null)}</span>
                              {price != null && <span className="block text-[12px] text-[var(--mx-text-3)]">fund price ${(price as number).toFixed(2)}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <details className={`${card} group`}>
                    <summary className="cursor-pointer list-none flex items-center justify-between text-[15px]">
                      How we work this out
                      <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
                    </summary>
                    <p className="mt-3 text-[14px] leading-relaxed text-[var(--mx-text-2)]">
                      The mood mixes three things{w ? ` — how calm the market is (${w.vix}%), how prices have moved lately (${w.momentum}%) and the tone of recent news (${w.news}%)` : ": how calm the market is, how prices have moved lately and the tone of recent news"}.
                      It describes today; it doesn’t predict tomorrow. Prices are from public sources and can be delayed.
                    </p>
                  </details>

                  <p className="text-[13px] text-[var(--mx-text-3)]">
                    Want to know what this means for a stock you follow? <Link href="/chat" className="underline">Ask AI</Link> (needs sign-in).
                  </p>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </PaywallGuard>
  );
}
