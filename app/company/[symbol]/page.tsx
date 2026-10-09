"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import type { CompanyProfile } from "../../api/company/route";
import type { CompareStats } from "../../api/market/compare/route";

// A company at a glance: what it does, a few key facts in plain words, and
// where to go next. Profile from /api/company, facts from /api/market/compare.

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 sm:p-6";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function size(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} billion`;
  return `$${(n / 1e6).toFixed(0)} million`;
}

export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const sym = decodeURIComponent(symbol).toUpperCase().replace(/\.(US|COMM)$/, "");
  const [profile, setProfile] = useState<CompanyProfile | null | "none">(null);
  const [facts, setFacts] = useState<CompareStats | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/company?symbol=${encodeURIComponent(sym)}`).then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (live) setProfile(ok && !d.error ? d as CompanyProfile : "none"); })
      .catch(() => { if (live) setProfile("none"); });
    fetch(`/api/market/compare?symbol=${encodeURIComponent(sym)}`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d && !d.error) setFacts(d as CompareStats); }).catch(() => {});
    return () => { live = false; };
  }, [sym]);

  const p = profile && profile !== "none" ? profile : null;
  const name = p?.name ?? facts?.name ?? sym;
  const change = facts?.price && facts.prevClose ? (facts.price / facts.prevClose - 1) * 100 : null;
  const a = facts?.analysts;
  const desc = p?.description ?? "";
  const short = desc.length > 360 && !more ? desc.slice(0, 360).replace(/\s+\S*$/, "") + "…" : desc;

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-4xl mx-auto w-full space-y-5">
            <header>
              <p className="text-[13px] text-[var(--mx-text-3)]">{sym}{p?.sector ? ` · ${p.sector}` : ""}</p>
              <h1 className="mt-1 text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">{profile === null && !facts ? sym : name}</h1>
              {facts?.price != null && (
                <p className="mt-2 text-[15px]">
                  {usd(facts.price)}
                  {change != null && <span className={change >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"}> {change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(2)}% on the latest day</span>}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/analysis?symbol=${encodeURIComponent(sym + ".US")}`} className="h-10 px-5 inline-flex items-center rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">See our read</Link>
                <Link href={`/paper?symbol=${encodeURIComponent(sym)}`} className="h-10 px-5 inline-flex items-center rounded-full border border-[var(--mx-line)] text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Practise</Link>
                <Link href="/compare" className="h-10 px-5 inline-flex items-center rounded-full border border-[var(--mx-line)] text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Compare</Link>
              </div>
            </header>

            <section className={card} aria-labelledby="about-h">
              <h2 id="about-h" className="text-[16px]">About {p?.name ?? sym}</h2>
              {profile === null ? <div className="mt-3 h-16 rounded bg-[var(--mx-raised)] animate-pulse" />
                : desc ? (
                  <>
                    <p className="mt-2 text-[14px] leading-relaxed text-[var(--mx-text-2)]">{short}</p>
                    {desc.length > 360 && <button type="button" onClick={() => setMore(v => !v)} className="mt-2 text-[13px] underline text-[var(--mx-text-2)]">{more ? "Show less" : "Read more"}</button>}
                  </>
                ) : <p className="mt-2 text-[14px] text-[var(--mx-text-3)]">No description available for this company.</p>}
              {p && (p.industry || p.website) && (
                <p className="mt-3 text-[13px] text-[var(--mx-text-3)]">
                  {p.industry}{p.industry && p.website ? " · " : ""}
                  {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="underline">{p.website.replace(/^https?:\/\/(www\.)?/, "")}</a>}
                </p>
              )}
            </section>

            {facts && (
              <section className={card} aria-labelledby="facts-h">
                <h2 id="facts-h" className="text-[16px]">Key facts</h2>
                <dl className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-4">
                  {facts.marketCap != null && <div><dt className="text-[13px] text-[var(--mx-text-3)]">Company size</dt><dd className="text-[15px]">{size(facts.marketCap)}</dd></div>}
                  {facts.epsTTM != null && <div><dt className="text-[13px] text-[var(--mx-text-3)]">Profit per share (last 12 months)</dt><dd className="text-[15px]">{facts.epsTTM < 0 ? `A loss of ${usd(-facts.epsTTM)}` : usd(facts.epsTTM)}</dd></div>}
                  {facts.dividendYield != null && <div><dt className="text-[13px] text-[var(--mx-text-3)]">Dividend</dt><dd className="text-[15px]">{facts.dividendYield === 0 ? "Doesn’t pay one" : `${facts.dividendYield.toFixed(2)}% a year`}</dd></div>}
                  {facts.yearLow != null && facts.yearHigh != null && <div><dt className="text-[13px] text-[var(--mx-text-3)]">Past year</dt><dd className="text-[15px]">{usd(facts.yearLow)} – {usd(facts.yearHigh)}</dd></div>}
                  {a && <div><dt className="text-[13px] text-[var(--mx-text-3)]">What analysts say</dt><dd className="text-[15px]">{a.buy} buy · {a.hold} hold · {a.sell} sell</dd></div>}
                  {facts.target && <div><dt className="text-[13px] text-[var(--mx-text-3)]">Analysts’ average target</dt><dd className="text-[15px]">{usd(facts.target.mean)}</dd></div>}
                </dl>
                <p className="mt-4 text-[12.5px] text-[var(--mx-text-3)]">Source: Nasdaq and Yahoo Finance. Prices can be delayed. Not financial advice.</p>
              </section>
            )}

            {profile === "none" && !facts && (
              <p className="text-[15px] text-[var(--mx-text-2)]">We couldn’t find details for {sym}. Check the ticker and try again.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
