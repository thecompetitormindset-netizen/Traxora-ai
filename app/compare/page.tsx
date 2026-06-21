"use client";

import React, { useCallback, useEffect, useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Link from "next/link";
import type { QuoteStats } from "@/app/api/market/quote-stats/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type Quote = {
  price:         number | null;
  previousClose: number | null;
  high:          number | null;
  low:           number | null;
};

type AnalystSummary = {
  consensus:   string | null;
  targetMean:  number | null;
  numAnalysts: number | null;
};

type StockData = {
  symbol:  string;
  quote:   Quote | null;
  stats:   QuoteStats | null;
  analyst: AnalystSummary | null;
  loading: boolean;
  error:   string;
};

const EMPTY_STOCK = (symbol = ""): StockData => ({
  symbol, quote: null, stats: null, analyst: null, loading: false, error: "",
});

const QUICK_PICKS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(p: number | null): string {
  if (p === null) return "—";
  return `$${p >= 1000 ? p.toFixed(0) : p.toFixed(2)}`;
}

function fmtCap(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function fmtVol(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

function consensusScore(c: string | null): number {
  if (!c) return 0;
  const map: Record<string, number> = { "Strong Buy": 5, "Buy": 4, "Hold": 3, "Sell": 2, "Strong Sell": 1 };
  return map[c] ?? 0;
}

function consensusColor(c: string | null): string {
  if (!c) return "text-[#4B5675]";
  if (c === "Strong Buy" || c === "Buy") return "text-emerald-400";
  if (c === "Hold")       return "text-amber-400";
  return "text-rose-400";
}

function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

// ── Symbol search input ───────────────────────────────────────────────────────

function SymbolInput({
  value, onChange, label,
}: { value: string; onChange: (s: string) => void; label: string }) {
  const [input, setInput] = useState(value);
  function submit() { const s = input.trim().toUpperCase(); if (s) onChange(s); }
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-2">{label}</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="AAPL"
          className="flex-1 bg-[#13112A] border border-[#252345] focus:border-emerald-500/50 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-[#F1F5F9] placeholder-[#4B5675] outline-none transition-colors"
        />
        <button type="button" onClick={submit}
          className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-4 py-2.5 rounded-xl text-sm font-bold">
          Load
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {QUICK_PICKS.map(s => (
          <button key={s} type="button"
            onClick={() => { setInput(s); onChange(s); }}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
              value === s
                ? "bg-violet-600/30 border-violet-500/40 text-violet-300"
                : "bg-[#1A1838] border-[#252345] text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#333368]"
            }`}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

type RowDef = {
  key:    string;
  label:  string;
  valA:   string;
  valB:   string;
  colorA: string;
  colorB: string;
};

function buildRows(a: StockData, b: StockData): RowDef[] {
  function change(d: StockData) {
    return d.quote?.price && d.quote?.previousClose
      ? ((d.quote.price - d.quote.previousClose) / d.quote.previousClose) * 100
      : null;
  }
  function pct52(d: StockData) {
    return d.stats?.yearHigh && d.stats?.yearLow && d.quote?.price
      ? ((d.quote.price - d.stats.yearLow) / (d.stats.yearHigh - d.stats.yearLow)) * 100
      : null;
  }
  function upside(d: StockData) {
    return d.analyst?.targetMean && d.quote?.price
      ? ((d.analyst.targetMean - d.quote.price) / d.quote.price) * 100
      : null;
  }
  function pct52Color(v: number | null) {
    if (v === null) return "text-[#4B5675]";
    return v >= 70 ? "text-emerald-400" : v >= 40 ? "text-amber-400" : "text-rose-400";
  }
  function upsideColor(v: number | null) {
    if (v === null) return "text-[#4B5675]";
    return v >= 0 ? "text-emerald-400" : "text-rose-400";
  }

  const chA = change(a), chB = change(b);
  const p52A = pct52(a), p52B = pct52(b);
  const upA = upside(a), upB = upside(b);

  return [
    {
      key: "price", label: "Price",
      valA: fmtPrice(a.quote?.price ?? null),
      valB: fmtPrice(b.quote?.price ?? null),
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "change", label: "Day Change",
      valA: chA !== null ? `${chA >= 0 ? "+" : ""}${chA.toFixed(2)}%` : "—",
      valB: chB !== null ? `${chB >= 0 ? "+" : ""}${chB.toFixed(2)}%` : "—",
      colorA: changeColor(chA), colorB: changeColor(chB),
    },
    {
      key: "cap", label: "Market Cap",
      valA: fmtCap(a.stats?.marketCap ?? null),
      valB: fmtCap(b.stats?.marketCap ?? null),
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "pe", label: "P/E Ratio",
      valA: a.stats?.pe ? a.stats.pe.toFixed(1) : "—",
      valB: b.stats?.pe ? b.stats.pe.toFixed(1) : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "eps", label: "EPS (TTM)",
      valA: a.stats?.eps ? `$${a.stats.eps.toFixed(2)}` : "—",
      valB: b.stats?.eps ? `$${b.stats.eps.toFixed(2)}` : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "beta", label: "Beta",
      valA: a.stats?.beta ? a.stats.beta.toFixed(2) : "—",
      valB: b.stats?.beta ? b.stats.beta.toFixed(2) : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "avgvol", label: "Avg Volume",
      valA: fmtVol(a.stats?.avgVolume ?? null),
      valB: fmtVol(b.stats?.avgVolume ?? null),
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "div", label: "Div Yield",
      valA: a.stats?.dividendYield ? `${a.stats.dividendYield.toFixed(2)}%` : "—",
      valB: b.stats?.dividendYield ? `${b.stats.dividendYield.toFixed(2)}%` : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "52high", label: "52w High",
      valA: fmtPrice(a.stats?.yearHigh ?? null),
      valB: fmtPrice(b.stats?.yearHigh ?? null),
      colorA: "text-emerald-400", colorB: "text-emerald-400",
    },
    {
      key: "52low", label: "52w Low",
      valA: fmtPrice(a.stats?.yearLow ?? null),
      valB: fmtPrice(b.stats?.yearLow ?? null),
      colorA: "text-rose-400", colorB: "text-rose-400",
    },
    {
      key: "52pos", label: "52w Position",
      valA: p52A !== null ? `${p52A.toFixed(0)}% of range` : "—",
      valB: p52B !== null ? `${p52B.toFixed(0)}% of range` : "—",
      colorA: pct52Color(p52A), colorB: pct52Color(p52B),
    },
    {
      key: "analyst", label: "Analyst Rating",
      valA: a.analyst?.consensus ?? "—",
      valB: b.analyst?.consensus ?? "—",
      colorA: consensusColor(a.analyst?.consensus ?? null),
      colorB: consensusColor(b.analyst?.consensus ?? null),
    },
    {
      key: "target", label: "Price Target",
      valA: a.analyst?.targetMean ? `$${a.analyst.targetMean.toFixed(2)}` : "—",
      valB: b.analyst?.targetMean ? `$${b.analyst.targetMean.toFixed(2)}` : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
    {
      key: "upside", label: "Target Upside",
      valA: upA !== null ? `${upA >= 0 ? "+" : ""}${upA.toFixed(1)}%` : "—",
      valB: upB !== null ? `${upB >= 0 ? "+" : ""}${upB.toFixed(1)}%` : "—",
      colorA: upsideColor(upA), colorB: upsideColor(upB),
    },
    {
      key: "coverage", label: "# Analysts",
      valA: a.analyst?.numAnalysts ? String(a.analyst.numAnalysts) : "—",
      valB: b.analyst?.numAnalysts ? String(b.analyst.numAnalysts) : "—",
      colorA: "text-[#F1F5F9]", colorB: "text-[#F1F5F9]",
    },
  ];
}

function calcWinners(a: StockData, b: StockData): Record<string, "a" | "b" | null> {
  const qa = a.quote, qb = b.quote;
  const sa = a.stats, sb = b.stats;
  const aa = a.analyst, ab = b.analyst;
  const chA = qa?.price && qa?.previousClose ? ((qa.price - qa.previousClose) / qa.previousClose) * 100 : null;
  const chB = qb?.price && qb?.previousClose ? ((qb.price - qb.previousClose) / qb.previousClose) * 100 : null;
  const upA = aa?.targetMean && qa?.price ? ((aa.targetMean - qa.price) / qa.price) * 100 : null;
  const upB = ab?.targetMean && qb?.price ? ((ab.targetMean - qb.price) / qb.price) * 100 : null;
  const p52A = sa?.yearHigh && sa?.yearLow && qa?.price ? ((qa.price - sa.yearLow) / (sa.yearHigh - sa.yearLow)) * 100 : null;
  const p52B = sb?.yearHigh && sb?.yearLow && qb?.price ? ((qb.price - sb.yearLow) / (sb.yearHigh - sb.yearLow)) * 100 : null;
  return {
    change:  chA !== null && chB !== null ? (chA >= chB ? "a" : "b") : null,
    pe:      sa?.pe && sb?.pe ? (sa.pe <= sb.pe ? "a" : "b") : null,
    eps:     sa?.eps && sb?.eps ? (sa.eps >= sb.eps ? "a" : "b") : null,
    "52pos": p52A !== null && p52B !== null ? (p52A >= p52B ? "a" : "b") : null,
    analyst: consensusScore(aa?.consensus ?? null) && consensusScore(ab?.consensus ?? null)
      ? (consensusScore(aa?.consensus ?? null) >= consensusScore(ab?.consensus ?? null) ? "a" : "b") : null,
    upside:  upA !== null && upB !== null ? (upA >= upB ? "a" : "b") : null,
  };
}

function CompareTable({
  stockA, stockB,
}: { stockA: StockData; stockB: StockData }) {
  const bothLoaded = !stockA.loading && !stockB.loading
    && (stockA.quote || stockA.stats)
    && (stockB.quote || stockB.stats);

  if (stockA.loading || stockB.loading) {
    return (
      <div className="rounded-2xl border border-[#252345] overflow-hidden animate-pulse">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.1fr)] ${i % 2 === 0 ? "bg-[#13112A]/40" : "bg-[#0D0B1A]/40"}`}>
            <div className="px-4 py-3.5"><div className="h-3 bg-[#1A1838] rounded w-24" /></div>
            <div className="px-4 py-3.5"><div className="h-3 bg-[#1A1838] rounded w-16" /></div>
            <div className="px-4 py-3.5"><div className="h-3 bg-[#1A1838] rounded w-16" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (!bothLoaded) {
    return (
      <div className="rounded-2xl border border-[#252345] py-16 flex flex-col items-center gap-2">
        <span className="text-3xl">⚖️</span>
        <p className="text-sm text-[#4B5675]">Enter two symbols above to compare</p>
      </div>
    );
  }

  const w = calcWinners(stockA, stockB);
  const rows = buildRows(stockA, stockB);

  return (
    <div className="rounded-2xl border border-[#252345] overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.1fr)] bg-[#0D0B1A] border-b border-[#252345]">
        <div className="px-4 py-3.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-[#333368]">Metric</p>
        </div>
        <div className="px-4 py-3.5 border-l border-[#252345]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black font-mono text-[#F1F5F9]">{stockA.symbol || "—"}</p>
            {stockA.symbol && (
              <Link href={`/analysis?symbol=${encodeURIComponent(stockA.symbol + ".US")}`}
                className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors shrink-0">
                Analysis →
              </Link>
            )}
          </div>
        </div>
        <div className="px-4 py-3.5 border-l border-[#252345]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black font-mono text-[#F1F5F9]">{stockB.symbol || "—"}</p>
            {stockB.symbol && (
              <Link href={`/analysis?symbol=${encodeURIComponent(stockB.symbol + ".US")}`}
                className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors shrink-0">
                Analysis →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Data rows */}
      {rows.map((row, idx) => {
        const winSide = w[row.key] ?? null;
        return (
          <div
            key={row.key}
            className={`grid grid-cols-[1fr_minmax(0,1.1fr)_minmax(0,1.1fr)] border-b border-[#1A1838] last:border-0 ${
              idx % 2 === 0 ? "bg-[#0D0B1A]" : "bg-[#13112A]/30"
            }`}
          >
            {/* Label */}
            <div className="px-4 py-3 flex items-center">
              <span className="text-[10px] text-[#4B5675] uppercase tracking-wider leading-tight">{row.label}</span>
            </div>

            {/* Value A */}
            <div className={`px-4 py-3 border-l border-[#1A1838] flex items-center gap-1.5 ${
              winSide === "a" ? "bg-emerald-500/8" : ""
            }`}>
              <span className={`text-sm font-bold font-mono ${row.colorA}`}>{row.valA}</span>
              {winSide === "a" && <span className="text-[8px] text-emerald-400 font-black shrink-0">▲</span>}
            </div>

            {/* Value B */}
            <div className={`px-4 py-3 border-l border-[#1A1838] flex items-center gap-1.5 ${
              winSide === "b" ? "bg-emerald-500/8" : ""
            }`}>
              <span className={`text-sm font-bold font-mono ${row.colorB}`}>{row.valB}</span>
              {winSide === "b" && <span className="text-[8px] text-emerald-400 font-black shrink-0">▲</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [symA, setSymA] = useState("AAPL");
  const [symB, setSymB] = useState("NVDA");
  const [stockA, setStockA] = useState<StockData>(EMPTY_STOCK("AAPL"));
  const [stockB, setStockB] = useState<StockData>(EMPTY_STOCK("NVDA"));

  const loadStock = useCallback(async (
    sym: string,
    setter: React.Dispatch<React.SetStateAction<StockData>>,
  ) => {
    const s = sym.trim().toUpperCase().replace(/\.US$/, "").replace(/\.COMM$/, "");
    if (!s) return;
    setter(prev => ({ ...prev, symbol: s, loading: true, error: "" }));
    try {
      const [quoteRes, statsRes, analystRes] = await Promise.allSettled([
        fetch(`/api/quote?symbol=${encodeURIComponent(s + ".US")}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/market/quote-stats?symbol=${encodeURIComponent(s + ".US")}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/market/analyst-ratings?symbol=${encodeURIComponent(s)}`).then(r => r.ok ? r.json() : null),
      ]);
      setter({
        symbol:  s,
        quote:   quoteRes.status === "fulfilled" && quoteRes.value && !quoteRes.value.error ? quoteRes.value : null,
        stats:   statsRes.status === "fulfilled" && statsRes.value && !statsRes.value.error ? statsRes.value : null,
        analyst: analystRes.status === "fulfilled" && analystRes.value && !analystRes.value.error ? {
          consensus:   analystRes.value.consensus   ?? null,
          targetMean:  analystRes.value.targetMean  ?? null,
          numAnalysts: analystRes.value.numAnalysts ?? null,
        } : null,
        loading: false,
        error:   "",
      });
    } catch (e) {
      setter(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : "Failed" }));
    }
  }, []);

  useEffect(() => { loadStock(symA, setStockA); }, [symA, loadStock]);
  useEffect(() => { loadStock(symB, setStockB); }, [symB, loadStock]);

  const w = calcWinners(stockA, stockB);
  const winCountA = Object.values(w).filter(v => v === "a").length;
  const winCountB = Object.values(w).filter(v => v === "b").length;
  const bothReady = !stockA.loading && !stockB.loading
    && (stockA.quote || stockA.stats)
    && (stockB.quote || stockB.stats);

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[#F1F5F9]">
        <Sidebar />
        <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <Topbar />
          <div className="max-w-3xl mx-auto w-full">

            <div className="mt-3 mb-6">
              <h1 className="text-2xl font-black tracking-tight text-gradient-green">Compare Stocks</h1>
              <p className="text-xs text-[#4B5675] mt-0.5">Side-by-side fundamentals, analyst ratings &amp; 52-week ranges</p>
            </div>

            {/* Symbol pickers */}
            <div className="flex flex-col sm:flex-row gap-4 items-start mb-6">
              <SymbolInput value={symA} onChange={setSymA} label="Stock A" />
              <div className="hidden sm:flex items-center self-center pt-8 shrink-0">
                <span className="text-2xl font-black text-[#252345]">vs</span>
              </div>
              <SymbolInput value={symB} onChange={setSymB} label="Stock B" />
            </div>

            {/* Winner banner */}
            {bothReady && (winCountA > 0 || winCountB > 0) && (
              <div className="mb-5 flex items-center gap-3 px-5 py-3 rounded-2xl border border-violet-500/20 bg-violet-500/5">
                <span className="text-lg">🏆</span>
                <p className="text-sm text-[#CBD5E1]">
                  <span className="font-black text-violet-300">
                    {winCountA > winCountB ? stockA.symbol : winCountB > winCountA ? stockB.symbol : "Tie"}
                  </span>
                  {winCountA !== winCountB
                    ? <> wins <span className="font-black">{Math.max(winCountA, winCountB)}</span> of {winCountA + winCountB} comparable metrics</>
                    : <> — both stocks are evenly matched across {winCountA} metrics</>
                  }
                </p>
              </div>
            )}

            {/* Comparison table */}
            <CompareTable stockA={stockA} stockB={stockB} />

            <p className="mt-5 text-center text-[10px] text-[#333368]">
              Data from Yahoo Finance (15-min delay) · Analyst data from Yahoo Finance · Not financial advice
            </p>
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
