"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import TopMovers from "../components/TopMovers";
import SectorHeatmap from "../components/SectorHeatmap";
import CryptoDashboard from "../components/CryptoDashboard";

// ── Popular Stocks ────────────────────────────────────────────────────────────
const POPULAR = [
  { symbol: "AAPL.US",  name: "Apple Inc.",           sector: "Technology" },
  { symbol: "MSFT.US",  name: "Microsoft Corp.",       sector: "Technology" },
  { symbol: "NVDA.US",  name: "NVIDIA Corp.",          sector: "Semiconductors" },
  { symbol: "TSLA.US",  name: "Tesla Inc.",            sector: "Automotive" },
  { symbol: "AMZN.US",  name: "Amazon.com Inc.",       sector: "E-Commerce" },
  { symbol: "GOOGL.US", name: "Alphabet Inc.",         sector: "Technology" },
  { symbol: "META.US",  name: "Meta Platforms",        sector: "Social Media" },
  { symbol: "JPM.US",   name: "JPMorgan Chase",        sector: "Finance" },
  { symbol: "V.US",     name: "Visa Inc.",             sector: "Finance" },
  { symbol: "JNJ.US",   name: "Johnson & Johnson",     sector: "Healthcare" },
  { symbol: "WMT.US",   name: "Walmart Inc.",          sector: "Retail" },
  { symbol: "NFLX.US",  name: "Netflix Inc.",          sector: "Streaming" },
];

type ExploreView = "markets" | "movers" | "crypto";

const VIEWS: ExploreView[] = ["markets", "movers", "crypto"];

export default function ExplorePage() {
  return <Suspense><ExploreContent /></Suspense>;
}

function ExploreContent() {
  // The view lives in the URL (?view=crypto) so the sidebar's Stocks and
  // Crypto links switch it even when this page is already open.
  const params = useSearchParams();
  const router = useRouter();
  const v = params.get("view") as ExploreView | null;
  const view: ExploreView = v && VIEWS.includes(v) ? v : "markets";
  const setView = (next: ExploreView) =>
    router.replace(next === "markets" ? "/explore" : `/explore?view=${next}`, { scroll: false });
  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />

      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">

        {/* ── Header ── */}
        <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">{view === "crypto" ? "Crypto" : "Stocks"}</h1>
          <div className="flex gap-1 rounded-full border border-[var(--mx-line)] p-1 overflow-x-auto scrollbar-hide">
            {([
              ["markets",  "Today"],
              ["movers",   "Biggest movers"],
              ["crypto",   "Crypto"],
            ] as [ExploreView, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={`shrink-0 h-9 px-4 rounded-full text-[14px] transition-colors ${view === id ? "bg-[var(--mx-text)] text-[var(--mx-canvas)]" : "text-[var(--mx-text-2)] hover:text-[var(--mx-text)]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Movers view ── */}
        {view === "movers" && (
          <div className="mt-5">
            <TopMovers />
          </div>
        )}

        {/* ── Crypto view ── */}
        {view === "crypto" && (
          <div className="mt-5">
            <CryptoDashboard />
          </div>
        )}

        {/* ── Markets view ── */}
        {view === "markets" && (
          <div className="mt-6 space-y-8">
            <section aria-labelledby="today-h">
              <h2 id="today-h" className="text-[18px] mb-1">The market today</h2>
              <p className="text-[13px] text-[var(--mx-text-3)] mb-4">How the big indexes and each part of the economy moved. Green is up, red is down.</p>
              <SectorHeatmap />
            </section>

            <section aria-labelledby="pop-h">
              <h2 id="pop-h" className="text-[18px] mb-4">Popular stocks</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {POPULAR.map(stock => (
                  <li key={stock.symbol}>
                    <Link href={`/company/${encodeURIComponent(stock.symbol.replace(".US", ""))}`}
                      className="block rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-4 hover:border-[var(--mx-line-strong)] transition-colors">
                      <p className="text-[15px] text-[var(--mx-text)]">{stock.name}</p>
                      <p className="text-[12px] text-[var(--mx-text-3)]">{stock.symbol.replace(".US", "")} · {stock.sector}</p>
                      <p className="mt-3 text-[13px] text-[var(--mx-text-2)]">See the company →</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
