"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import StockScreener from "../components/StockScreener";
import TopMovers from "../components/TopMovers";
import EconomicCalendar from "../components/EconomicCalendar";

type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  type: string;
};

type FuturesItem = {
  symbol: string;
  ticker: string;
  name: string;
  category: string;
};

type Exchange = {
  id: string;
  short: string;
  fullName: string;
  city: string;
  description: string;
  color: string;
  items: FuturesItem[];
};

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

// ── Exchanges & their listed instruments ─────────────────────────────────────
const EXCHANGES: Exchange[] = [
  {
    id: "CBOE",
    short: "CBOE",
    fullName: "Chicago Board Options Exchange",
    city: "Chicago, IL",
    description: "World's largest options exchange — volatility products & equity options",
    color: "teal",
    items: [
      { symbol: "VX.COMM",  ticker: "VX",   name: "CBOE Volatility Index (VIX) Futures", category: "Volatility" },
      { symbol: "VA.COMM",  ticker: "VA",   name: "Mini-VIX Futures",                    category: "Volatility" },
      { symbol: "XSP.US",   ticker: "XSP",  name: "Mini-SPX Options ETF",                category: "Index Options" },
      { symbol: "SPXL.US",  ticker: "SPXL", name: "Direxion Daily S&P 500 Bull 3X",      category: "Index Options" },
    ],
  },
  {
    id: "CBOT",
    short: "CBOT",
    fullName: "Chicago Board of Trade",
    city: "Chicago, IL",
    description: "Oldest US futures exchange — grains, treasuries & Dow Jones futures",
    color: "yellow",
    items: [
      { symbol: "ZC.COMM", ticker: "ZC", name: "Corn",                 category: "Agricultural" },
      { symbol: "ZS.COMM", ticker: "ZS", name: "Soybeans",             category: "Agricultural" },
      { symbol: "ZW.COMM", ticker: "ZW", name: "Wheat (Soft Red Winter)", category: "Agricultural" },
      { symbol: "ZO.COMM", ticker: "ZO", name: "Oats",                 category: "Agricultural" },
      { symbol: "ZR.COMM", ticker: "ZR", name: "Rough Rice",           category: "Agricultural" },
      { symbol: "ZL.COMM", ticker: "ZL", name: "Soybean Oil",          category: "Agricultural" },
      { symbol: "ZM.COMM", ticker: "ZM", name: "Soybean Meal",         category: "Agricultural" },
      { symbol: "ZB.COMM", ticker: "ZB", name: "30-Year Treasury Bond",  category: "Treasuries" },
      { symbol: "ZN.COMM", ticker: "ZN", name: "10-Year Treasury Note",  category: "Treasuries" },
      { symbol: "ZF.COMM", ticker: "ZF", name: "5-Year Treasury Note",   category: "Treasuries" },
      { symbol: "ZT.COMM", ticker: "ZT", name: "2-Year Treasury Note",   category: "Treasuries" },
      { symbol: "YM.COMM", ticker: "YM", name: "E-mini Dow Jones Industrial Average", category: "Index Futures" },
    ],
  },
  {
    id: "CME",
    short: "CME",
    fullName: "Chicago Mercantile Exchange",
    city: "Chicago, IL",
    description: "World's largest futures exchange — equity indexes, FX, rates & livestock",
    color: "blue",
    items: [
      { symbol: "ES.COMM",  ticker: "ES",  name: "E-mini S&P 500",           category: "Index Futures" },
      { symbol: "NQ.COMM",  ticker: "NQ",  name: "E-mini NASDAQ-100",         category: "Index Futures" },
      { symbol: "RTY.COMM", ticker: "RTY", name: "E-mini Russell 2000",        category: "Index Futures" },
      { symbol: "MES.COMM", ticker: "MES", name: "Micro E-mini S&P 500",       category: "Index Futures" },
      { symbol: "MNQ.COMM", ticker: "MNQ", name: "Micro E-mini NASDAQ-100",    category: "Index Futures" },
      { symbol: "6E.COMM",  ticker: "6E",  name: "Euro FX",                    category: "FX Futures" },
      { symbol: "6B.COMM",  ticker: "6B",  name: "British Pound",              category: "FX Futures" },
      { symbol: "6J.COMM",  ticker: "6J",  name: "Japanese Yen",               category: "FX Futures" },
      { symbol: "6C.COMM",  ticker: "6C",  name: "Canadian Dollar",            category: "FX Futures" },
      { symbol: "6A.COMM",  ticker: "6A",  name: "Australian Dollar",          category: "FX Futures" },
      { symbol: "6M.COMM",  ticker: "6M",  name: "Mexican Peso",               category: "FX Futures" },
      { symbol: "6N.COMM",  ticker: "6N",  name: "New Zealand Dollar",         category: "FX Futures" },
      { symbol: "LE.COMM",  ticker: "LE",  name: "Live Cattle",                category: "Livestock" },
      { symbol: "HE.COMM",  ticker: "HE",  name: "Lean Hogs",                  category: "Livestock" },
      { symbol: "GF.COMM",  ticker: "GF",  name: "Feeder Cattle",              category: "Livestock" },
    ],
  },
  {
    id: "KCBT",
    short: "KCBT",
    fullName: "Kansas City Board of Trade",
    city: "Kansas City, MO",
    description: "Specialist in Hard Red Winter Wheat — now part of CME Group",
    color: "orange",
    items: [
      { symbol: "KE.COMM", ticker: "KE", name: "Hard Red Winter Wheat",        category: "Agricultural" },
      { symbol: "YK.COMM", ticker: "YK", name: "Mini Hard Red Winter Wheat",   category: "Agricultural" },
    ],
  },
  {
    id: "MGE",
    short: "MGE",
    fullName: "Minneapolis Grain Exchange",
    city: "Minneapolis, MN",
    description: "Hard Red Spring Wheat & specialty grains futures",
    color: "green",
    items: [
      { symbol: "MWE.COMM", ticker: "MWE", name: "Hard Red Spring Wheat",      category: "Agricultural" },
      { symbol: "MW.COMM",  ticker: "MW",  name: "Spring Wheat (Mini)",        category: "Agricultural" },
    ],
  },
  {
    id: "NYBOT",
    short: "NYBOT",
    fullName: "New York Board of Trade",
    city: "New York, NY",
    description: "Soft commodities — coffee, sugar, cocoa, cotton & OJ (now ICE)",
    color: "red",
    items: [
      { symbol: "KC.COMM", ticker: "KC", name: "Coffee C",           category: "Soft Commodities" },
      { symbol: "SB.COMM", ticker: "SB", name: "Sugar No. 11",       category: "Soft Commodities" },
      { symbol: "CC.COMM", ticker: "CC", name: "Cocoa",              category: "Soft Commodities" },
      { symbol: "CT.COMM", ticker: "CT", name: "Cotton No. 2",       category: "Soft Commodities" },
      { symbol: "OJ.COMM", ticker: "OJ", name: "Orange Juice",       category: "Soft Commodities" },
      { symbol: "DX.COMM", ticker: "DX", name: "US Dollar Index",    category: "FX" },
    ],
  },
  {
    id: "NYMEX",
    short: "NYMEX",
    fullName: "New York Mercantile Exchange",
    city: "New York, NY",
    description: "World's dominant energy & precious metals futures exchange",
    color: "cyan",
    items: [
      { symbol: "CL.COMM", ticker: "CL", name: "Crude Oil (WTI)",      category: "Energy" },
      { symbol: "NG.COMM", ticker: "NG", name: "Natural Gas",           category: "Energy" },
      { symbol: "HO.COMM", ticker: "HO", name: "Heating Oil (ULSD)",    category: "Energy" },
      { symbol: "RB.COMM", ticker: "RB", name: "RBOB Gasoline",         category: "Energy" },
      { symbol: "BZ.COMM", ticker: "BZ", name: "Brent Crude Oil",       category: "Energy" },
      { symbol: "GC.COMM", ticker: "GC", name: "Gold",                  category: "Metals (COMEX)" },
      { symbol: "SI.COMM", ticker: "SI", name: "Silver",                category: "Metals (COMEX)" },
      { symbol: "HG.COMM", ticker: "HG", name: "Copper",                category: "Metals (COMEX)" },
      { symbol: "PL.COMM", ticker: "PL", name: "Platinum",              category: "Metals (COMEX)" },
      { symbol: "PA.COMM", ticker: "PA", name: "Palladium",             category: "Metals (COMEX)" },
    ],
  },
];

// ── Color maps ────────────────────────────────────────────────────────────────
const COLOR: Record<string, { tab: string; activetab: string; badge: string; glow: string; dot: string }> = {
  teal: {
    tab: "border-teal-500/30 text-teal-400 bg-teal-500/10",
    activetab: "border-teal-400 bg-teal-500/20 text-teal-300",
    badge: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    glow: "hover:border-teal-500/40",
    dot: "bg-teal-500",
  },
  yellow: {
    tab: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
    activetab: "border-yellow-400 bg-yellow-500/20 text-yellow-300",
    badge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    glow: "hover:border-yellow-500/40",
    dot: "bg-yellow-500",
  },
  blue: {
    tab: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    activetab: "border-blue-400 bg-blue-500/20 text-blue-300",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    glow: "hover:border-blue-500/40",
    dot: "bg-blue-500",
  },
  orange: {
    tab: "border-orange-500/30 text-orange-400 bg-orange-500/10",
    activetab: "border-orange-400 bg-orange-500/20 text-orange-300",
    badge: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    glow: "hover:border-orange-500/40",
    dot: "bg-orange-500",
  },
  green: {
    tab: "border-green-500/30 text-green-400 bg-green-500/10",
    activetab: "border-green-400 bg-green-500/20 text-green-300",
    badge: "text-green-400 bg-green-500/10 border-green-500/20",
    glow: "hover:border-green-500/40",
    dot: "bg-green-500",
  },
  red: {
    tab: "border-red-500/30 text-red-400 bg-red-500/10",
    activetab: "border-red-400 bg-red-500/20 text-red-300",
    badge: "text-red-400 bg-red-500/10 border-red-500/20",
    glow: "hover:border-red-500/40",
    dot: "bg-red-500",
  },
  cyan: {
    tab: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
    activetab: "border-cyan-400 bg-cyan-500/20 text-cyan-300",
    badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    glow: "hover:border-cyan-500/40",
    dot: "bg-cyan-500",
  },
};

type ExploreView = "markets" | "screener" | "movers" | "calendar";

export default function ExplorePage() {
  useEffect(() => {
  }, []);
  const [view, setView]         = useState<ExploreView>("markets");
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    setSelectedExchange(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 20) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const activeExchange = selectedExchange
    ? EXCHANGES.find((e) => e.id === selectedExchange) ?? null
    : null;

  return (
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />

      <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">

        {/* ── Header ── */}
        <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
          <h1 className="reveal section-header text-2xl font-black tracking-tight text-gradient-green">Explore Markets</h1>
          <div className="flex gap-1 bg-[#1A1838] rounded-xl p-1 text-xs overflow-x-auto scrollbar-hide">
            {([
              ["markets",  "🌍 Markets"],
              ["movers",   "🔥 Movers"],
              ["screener", "🔍 Screener"],
              ["calendar", "📅 Calendar"],
            ] as [ExploreView, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setView(id)}
                className={`shrink-0 px-4 py-2 rounded-lg font-semibold transition-colors ${view === id ? "bg-violet-600 text-white" : "text-[#4B5675] hover:text-[#F1F5F9]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Screener view ── */}
        {view === "screener" && (
          <div className="mt-5">
            <StockScreener />
          </div>
        )}

        {/* ── Movers view ── */}
        {view === "movers" && (
          <div className="mt-5">
            <TopMovers />
          </div>
        )}

        {/* ── Economic Calendar view ── */}
        {view === "calendar" && (
          <div className="mt-5 max-w-2xl">
            <EconomicCalendar />
          </div>
        )}

        {/* ── Markets view ── */}
        {view === "markets" && (<>

        {/* ── Exchange Tabs ── */}
        <div className="mt-3">
          <p className="text-xs text-[#4B5675] uppercase tracking-widest mb-3">Browse by Exchange</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setSelectedExchange(null); setSearched(false); }}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                !selectedExchange && !searched
                  ? "border-[#333368] bg-[#13112A]/80 text-[#F1F5F9]"
                  : "border-[#252345] text-[#4B5675] hover:text-[#F1F5F9] hover:bg-[#13112A]"
              }`}
            >
              All Markets
            </button>

            {EXCHANGES.map((ex) => {
              const c = COLOR[ex.color];
              const isActive = selectedExchange === ex.id;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => { setSelectedExchange(ex.id); setSearched(false); }}
                  className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                    isActive ? c.activetab : `${c.tab} hover:opacity-80`
                  }`}
                >
                  {ex.short}
                  <span className="ml-1.5 text-[10px] opacity-60">{ex.items.length}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Active Exchange Banner ── */}
        {activeExchange && (
          <div className={`mt-5 rounded-2xl p-5 border ${COLOR[activeExchange.color].tab} flex items-center justify-between gap-4`}>
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR[activeExchange.color].dot}`} />
                <p className="font-bold text-white text-lg">{activeExchange.fullName}</p>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">{activeExchange.city} · {activeExchange.description}</p>
            </div>
            <span className="text-sm font-semibold shrink-0">
              {activeExchange.items.length} contracts
            </span>
          </div>
        )}

        {/* ── Search ── */}
        <form onSubmit={handleSearch} className="mt-5 flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company name or ticker (e.g. Tesla, AAPL, ES)"
            className="flex-1 bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4 text-[#F1F5F9] placeholder-[#4B5675] outline-none focus:border-emerald-500/50 transition text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition px-6 py-4 rounded-2xl font-semibold text-sm"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {/* ── Search Results ── */}
        {searched && (
          <div className="mt-3">
            <h2 className="text-lg font-semibold mb-3">
              {results.length > 0 ? `${results.length} results` : "No results found"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((r, i) => (
                <Link
                  key={`${r.symbol}-${i}`}
                  href={`/analysis?symbol=${encodeURIComponent(r.symbol)}`}
                  className="bg-[#13112A] rounded-2xl p-5 border border-[#252345] hover:border-[#333368] transition block"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-[#F1F5F9]">{r.symbol}</p>
                      <p className="text-sm text-[#7B8DB4] mt-0.5 truncate max-w-[200px]">{r.name}</p>
                    </div>
                    <span className="text-xs text-[#4B5675] bg-[#1A1838] px-2 py-1 rounded-lg border border-[#252345]">
                      {r.exchange}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-[#4B5675]">{r.country}</span>
                    <span className="text-[#333368]">·</span>
                    <span className="text-xs text-[#4B5675]">{r.type}</span>
                  </div>
                  <p className="text-xs text-emerald-400 mt-3">Analyze with AI →</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Single Exchange View ── */}
        {!searched && activeExchange && (() => {
          const categories = Array.from(new Set(activeExchange.items.map((i) => i.category)));
          const c = COLOR[activeExchange.color];
          return (
            <div className="mt-3 space-y-8">
              {categories.map((cat) => (
                <div key={cat}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {activeExchange.items
                      .filter((item) => item.category === cat)
                      .map((item) => (
                        <Link
                          key={item.symbol}
                          href={`/analysis?symbol=${encodeURIComponent(item.symbol)}`}
                          className={`bg-[#13112A] rounded-2xl p-5 border border-[#252345] ${c.glow} transition block`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-[#F1F5F9]">{item.ticker}</p>
                              <p className="text-sm text-[#7B8DB4] mt-0.5">{item.name}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-lg border ${c.badge}`}>
                              {cat}
                            </span>
                          </div>
                          <p className="text-xs text-emerald-400 mt-4">View AI analysis →</p>
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── All Markets View ── */}
        {!searched && !activeExchange && (
          <>
            {/* Popular Stocks */}
            <div className="mt-8">
              <h2 className="text-2xl font-semibold mb-4">Popular Stocks</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {POPULAR.map((stock) => (
                  <Link
                    key={stock.symbol}
                    href={`/analysis?symbol=${encodeURIComponent(stock.symbol)}`}
                    className="bg-[#13112A] rounded-2xl p-5 border border-[#252345] hover:border-[#333368] transition block"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-[#F1F5F9]">{stock.symbol.replace(".US", "")}</p>
                        <p className="text-sm text-[#7B8DB4] mt-0.5">{stock.name}</p>
                      </div>
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                        {stock.sector}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-400 mt-4">View AI analysis →</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Exchange Overview Grid */}
            <div className="mt-10">
              <h2 className="text-2xl font-semibold mb-4">Futures Exchanges</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {EXCHANGES.map((ex) => {
                  const c = COLOR[ex.color];
                  const cats = Array.from(new Set(ex.items.map((i) => i.category)));
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setSelectedExchange(ex.id)}
                      className={`bg-[#13112A] rounded-2xl p-5 border border-[#252345] ${c.glow} transition text-left block w-full`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${c.dot} shrink-0 mt-0.5`} />
                          <p className={`font-bold text-base ${c.tab.split(" ").find((x) => x.startsWith("text-")) ?? "text-[#F1F5F9]"}`}>
                            {ex.short}
                          </p>
                        </div>
                        <span className="text-xs text-[#4B5675] bg-[#1A1838] px-2 py-1 rounded-lg border border-[#252345]">
                          {ex.items.length} contracts
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#F1F5F9]">{ex.fullName}</p>
                      <p className="text-xs text-[#4B5675] mt-1">{ex.city}</p>
                      <p className="text-xs text-[#7B8DB4] mt-2 leading-relaxed">{ex.description}</p>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {cats.slice(0, 3).map((cat) => (
                          <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded border ${c.badge}`}>
                            {cat}
                          </span>
                        ))}
                        {cats.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#1E1C42] text-gray-600">
                            +{cats.length - 3} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        </>) /* end markets view */}
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
