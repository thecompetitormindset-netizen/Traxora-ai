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

function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
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

// ── Stock search input ────────────────────────────────────────────────────────

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

// ── One column of data ────────────────────────────────────────────────────────

function StockCol({ data, winner }: { data: StockData; winner: Record<string, boolean> }) {
  if (data.loading) {
    return (
      <div className="flex-1 space-y-3 animate-pulse">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-7 bg-[#1A1838] rounded-lg" />
        ))}
      </div>
    );
  }
  if (!data.symbol || (!data.quote && !data.stats)) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <p className="text-sm text-[#333368]">Enter a symbol above</p>
      </div>
    );
  }

  const change = data.quote?.price && data.quote?.previousClose
    ? ((data.quote.price - data.quote.previousClose) / data.quote.previousClose) * 100
    : null;

  const pct52 = data.stats?.yearHigh && data.stats?.yearLow && data.quote?.price
    ? ((data.quote.price - data.stats.yearLow) / (data.stats.yearHigh - data.stats.yearLow)) * 100
    : null;

  const upside = data.analyst?.targetMean && data.quote?.price
    ? ((data.analyst.targetMean - data.quote.price) / data.quote.price) * 100
    : null;

  const rows: { key: string; label: string; value: string; color?: string }[] = [
    { key: "price",    label: "Price",          value: fmtPrice(data.quote?.price ?? null) },
    { key: "change",   label: "Day Change",      value: change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—", color: changeColor(change) },
    { key: "cap",      label: "Market Cap",      value: fmtCap(data.stats?.marketCap ?? null) },
    { key: "pe",       label: "P/E Ratio",       value: data.stats?.pe ? data.stats.pe.toFixed(1) : "—" },
    { key: "eps",      label: "EPS (TTM)",       value: data.stats?.eps ? `$${data.stats.eps.toFixed(2)}` : "—" },
    { key: "beta",     label: "Beta",            value: data.stats?.beta ? data.stats.beta.toFixed(2) : "—" },
    { key: "avgvol",   label: "Avg Volume",      value: fmtVol(data.stats?.avgVolume ?? null) },
    { key: "div",      label: "Div Yield",       value: data.stats?.dividendYield ? `${data.stats.dividendYield.toFixed(2)}%` : "—" },
    { key: "52high",   label: "52w High",        value: fmtPrice(data.stats?.yearHigh ?? null), color: "text-emerald-400" },
    { key: "52low",    label: "52w Low",         value: fmtPrice(data.stats?.yearLow ?? null),  color: "text-rose-400" },
    { key: "52pos",    label: "52w Position",    value: pct52 !== null ? `${pct52.toFixed(0)}% of range` : "—",
      color: pct52 !== null ? (pct52 >= 70 ? "text-emerald-400" : pct52 >= 40 ? "text-amber-400" : "text-rose-400") : "" },
    { key: "analyst",  label: "Analyst Rating",  value: data.analyst?.consensus ?? "—", color: consensusColor(data.analyst?.consensus ?? null) },
    { key: "target",   label: "Price Target",    value: data.analyst?.targetMean ? `$${data.analyst.targetMean.toFixed(2)}` : "—" },
    { key: "upside",   label: "Target Upside",   value: upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—",
      color: upside !== null ? (upside >= 0 ? "text-emerald-400" : "text-rose-400") : "" },
    { key: "coverage", label: "# Analysts",      value: data.analyst?.numAnalysts ? String(data.analyst.numAnalysts) : "—" },
  ];

  return (
    <div className="flex-1 min-w-0 space-y-1">
      {/* Symbol header */}
      <div className="mb-4 flex items-center gap-3">
        <div>
          <p className="text-2xl font-black text-[#F1F5F9] font-mono">{data.symbol}</p>
          <Link href={`/analysis?symbol=${encodeURIComponent(data.symbol + ".US")}`}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
            Full Analysis →
          </Link>
        </div>
      </div>

      {rows.map(r => (
        <div key={r.key} className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
          winner[r.key] ? "bg-emerald-500/8 border border-emerald-500/15" : "bg-[#13112A]/60 border border-transparent"
        }`}>
          <span className="text-[10px] text-[#4B5675] uppercase tracking-wider shrink-0 hidden sm:block">{r.label}</span>
          <span className={`text-sm font-bold font-mono ml-auto ${r.color ?? "text-[#F1F5F9]"}`}>{r.value}</span>
          {winner[r.key] && <span className="ml-2 text-[8px] text-emerald-400 font-black shrink-0">▲</span>}
        </div>
      ))}
    </div>
  );
}

// ── Row labels column (center) ────────────────────────────────────────────────

const ROW_LABELS = [
  "Price", "Day Change", "Market Cap", "P/E Ratio", "EPS (TTM)",
  "Beta", "Avg Volume", "Div Yield",
  "52w High", "52w Low", "52w Position",
  "Analyst Rating", "Price Target", "Target Upside", "# Analysts",
];

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

  // Determine winners per metric (which column is "better")
  function winners(): Record<string, "a" | "b" | null> {
    const qa = stockA.quote, qb = stockB.quote;
    const sa = stockA.stats, sb = stockB.stats;
    const aa = stockA.analyst, ab = stockB.analyst;
    const changeA = qa?.price && qa?.previousClose ? ((qa.price - qa.previousClose) / qa.previousClose) * 100 : null;
    const changeB = qb?.price && qb?.previousClose ? ((qb.price - qb.previousClose) / qb.previousClose) * 100 : null;
    const upsideA = aa?.targetMean && qa?.price ? ((aa.targetMean - qa.price) / qa.price) * 100 : null;
    const upsideB = ab?.targetMean && qb?.price ? ((ab.targetMean - qb.price) / qb.price) * 100 : null;
    const pct52A = sa?.yearHigh && sa?.yearLow && qa?.price ? ((qa.price - sa.yearLow) / (sa.yearHigh - sa.yearLow)) * 100 : null;
    const pct52B = sb?.yearHigh && sb?.yearLow && qb?.price ? ((qb.price - sb.yearLow) / (sb.yearHigh - sb.yearLow)) * 100 : null;

    return {
      change:   changeA !== null && changeB !== null ? (changeA >= changeB ? "a" : "b") : null,
      pe:       sa?.pe && sb?.pe ? (sa.pe <= sb.pe ? "a" : "b") : null, // lower P/E = better value
      eps:      sa?.eps && sb?.eps ? (sa.eps >= sb.eps ? "a" : "b") : null,
      "52pos":  pct52A !== null && pct52B !== null ? (pct52A >= pct52B ? "a" : "b") : null,
      analyst:  consensusScore(aa?.consensus ?? null) !== 0 && consensusScore(ab?.consensus ?? null) !== 0
        ? (consensusScore(aa?.consensus ?? null) >= consensusScore(ab?.consensus ?? null) ? "a" : "b") : null,
      upside:   upsideA !== null && upsideB !== null ? (upsideA >= upsideB ? "a" : "b") : null,
    };
  }

  const w = winners();
  const winA: Record<string, boolean> = {};
  const winB: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(w)) { if (v === "a") winA[k] = true; if (v === "b") winB[k] = true; }

  const winCountA = Object.values(w).filter(v => v === "a").length;
  const winCountB = Object.values(w).filter(v => v === "b").length;

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[#F1F5F9]">
        <Sidebar />
        <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <Topbar />
          <div className="max-w-5xl mx-auto w-full">

            <div className="mt-3 mb-6">
              <h1 className="text-2xl font-black tracking-tight text-gradient-green">Compare Stocks</h1>
              <p className="text-xs text-[#4B5675] mt-0.5">Side-by-side fundamentals, analyst ratings &amp; 52-week ranges</p>
            </div>

            {/* Symbol pickers */}
            <div className="flex flex-col sm:flex-row gap-4 items-start mb-8">
              <SymbolInput value={symA} onChange={setSymA} label="Stock A" />
              <div className="hidden sm:flex items-center self-center pt-8 shrink-0">
                <span className="text-2xl font-black text-[#252345]">vs</span>
              </div>
              <SymbolInput value={symB} onChange={setSymB} label="Stock B" />
            </div>

            {/* Winner banner */}
            {(winCountA > 0 || winCountB > 0) && !stockA.loading && !stockB.loading && (
              <div className="mb-6 flex items-center gap-3 px-5 py-3 rounded-2xl border border-violet-500/20 bg-violet-500/5">
                <span className="text-lg">🏆</span>
                <p className="text-sm text-[#CBD5E1]">
                  <span className="font-black text-violet-300">{winCountA > winCountB ? stockA.symbol : winCountB > winCountA ? stockB.symbol : "Tie"}</span>
                  {winCountA !== winCountB && (
                    <> wins <span className="font-black">{Math.max(winCountA, winCountB)}</span> of {winCountA + winCountB} comparable metrics</>
                  )}
                  {winCountA === winCountB && <> — both stocks are evenly matched across {winCountA} metrics</>}
                </p>
              </div>
            )}

            {/* Comparison grid */}
            <div className="relative">
              {/* Desktop: 3-col (A | labels | B) */}
              <div className="hidden sm:flex gap-0 rounded-2xl border border-[#252345] overflow-hidden">
                {/* Column A */}
                <div className="flex-1 min-w-0 p-5 border-r border-[#252345]">
                  <StockCol data={stockA} winner={winA} />
                </div>

                {/* Row labels */}
                <div className="w-36 shrink-0 flex flex-col bg-[#0D0B1A] border-r border-[#252345] p-5">
                  <div className="mb-4 h-14 flex items-end justify-center">
                    <span className="text-xl font-black text-[#252345]">vs</span>
                  </div>
                  <div className="space-y-1">
                    {ROW_LABELS.map(l => (
                      <div key={l} className="h-9 flex items-center px-1">
                        <span className="text-[9px] text-[#4B5675] uppercase tracking-wider leading-tight">{l}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column B */}
                <div className="flex-1 min-w-0 p-5">
                  <StockCol data={stockB} winner={winB} />
                </div>
              </div>

              {/* Mobile: 2-col side by side without labels */}
              <div className="sm:hidden flex gap-3">
                <div className="flex-1 min-w-0 bg-[#13112A] border border-[#252345] rounded-2xl p-4">
                  <StockCol data={stockA} winner={winA} />
                </div>
                <div className="flex-1 min-w-0 bg-[#13112A] border border-[#252345] rounded-2xl p-4">
                  <StockCol data={stockB} winner={winB} />
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-[10px] text-[#333368]">
              Data from Yahoo Finance (15-min delay) · Analyst data from Yahoo Finance · Not financial advice
            </p>
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
