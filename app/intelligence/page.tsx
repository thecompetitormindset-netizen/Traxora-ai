"use client";

import { useEffect, useId, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";

type FuturesCard = {
  symbol: string; name: string;
  price: number | null; change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  sparkline: number[] | null;
  loading: boolean;
};

const FUTURES_LIST = [
  { symbol: "ES.COMM",  name: "S&P 500"          },
  { symbol: "NQ.COMM",  name: "Nasdaq 100"        },
  { symbol: "YM.COMM",  name: "Dow Jones"         },
  { symbol: "RTY.COMM", name: "Russell 2000 (small companies)" },
  { symbol: "GC.COMM",  name: "Gold"               },
  { symbol: "SI.COMM",  name: "Silver"             },
  { symbol: "CL.COMM",  name: "Oil"                },
  { symbol: "NG.COMM",  name: "Natural Gas"         },
];


function Sparkline({ closes, positive }: { closes: number[]; positive: boolean }) {
  const uid = useId().replace(/:/g, "");
  if (closes.length < 2) return null;
  const min = Math.min(...closes), max = Math.max(...closes), range = max - min || 1;
  const W = 56, H = 22;
  const pts = closes.map((c, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: H - 2 - ((c - min) / range) * (H - 4),
  }));
  const ptsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
  const color  = positive ? "#34D399" : "#F87171";
  const gradId = `spark-${uid}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${ptsStr} ${W},${H}`} fill={`url(#${gradId})`} />
      <polyline points={ptsStr} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sparkline-path" />
    </svg>
  );
}

// ── Futures Panel ─────────────────────────────────────────────────────────────

function FuturesPanel() {
  const [futures, setFutures] = useState<FuturesCard[]>(
    FUTURES_LIST.map(f => ({ ...f, price: null, change: null, signal: null, confidence: null, sparkline: null, loading: true }))
  );

  useEffect(() => {
    FUTURES_LIST.forEach(async ({ symbol }) => {
      try {
        const [quoteRes, barsRes] = await Promise.all([
          fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()),
          fetch(`/api/eod-bars?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()),
        ]);

        const price  = quoteRes?.price ?? null;
        const prev   = quoteRes?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;

        const closes: number[] = Array.isArray(barsRes)
          ? barsRes.slice(-10).map((b: { close: number }) => b.close).filter(Boolean)
          : [];

        let signal: "BUY" | "HOLD" | "SELL" | null = null;
        let confidence: "High" | "Medium" | "Low" | null = null;

        if (price && prev) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, price, previousClose: prev, dayChangePercent: change ?? 0, quick: true }),
          }).then(r => r.json());
          signal     = analyzeRes?.signal ?? null;
          confidence = analyzeRes?.confidence ?? null;
        }

        setFutures(prev => prev.map(f =>
          f.symbol === symbol ? { ...f, price, change, signal, confidence, sparkline: closes.length >= 2 ? closes : null, loading: false } : f
        ));
      } catch {
        setFutures(prev => prev.map(f => f.symbol === symbol ? { ...f, loading: false } : f));
      }
    });
  }, []);

  const read = (sig: string | null) => sig === "BUY" ? "Leaning up" : sig === "SELL" ? "Leaning down" : sig === "HOLD" ? "No clear direction" : null;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {futures.map(f => (
        <li key={f.symbol}>
          <Link href={`/analysis?symbol=${encodeURIComponent(f.symbol)}`}
            className="block h-full rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 hover:border-[var(--mx-line-strong)] transition-colors">
            <p className="text-[15px] text-[var(--mx-text)]">{f.name}</p>
            <p className="text-[12px] text-[var(--mx-text-3)]">{f.symbol.replace(".COMM", "")}</p>
            <div className="mt-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-[20px] text-[var(--mx-text)]">{f.price !== null ? `$${f.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="inline-block h-5 w-24 rounded bg-[var(--mx-raised)] animate-pulse" />}</p>
                <p className={`text-[13px] ${f.change == null ? "text-[var(--mx-text-3)]" : f.change >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"}`}>
                  {f.change !== null ? `${f.change >= 0 ? "+" : "−"}${Math.abs(f.change).toFixed(2)}% today` : " "}
                </p>
              </div>
              {f.sparkline && <Sparkline closes={f.sparkline} positive={(f.change ?? 0) >= 0} />}
            </div>
            <p className="mt-4 pt-3 border-t border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)]">
              {f.loading ? "Reading the trend…" : read(f.signal) ?? "No read right now"}
              {f.confidence && !f.loading && <span className="text-[var(--mx-text-3)]"> · {f.confidence.toLowerCase()} confidence</span>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Value Picks ───────────────────────────────────────────────────────────────

type ValueStock = {
  symbol:    string;
  name:      string;
  price:     number | null;
  changePct: number | null;
  pe:        number | null;
  forwardPe: number | null;
  pb:        number | null;
  divYield:  number | null;
  marketCap: number | null;
  sector:    string | null;
  score:     number;
  isDip:     boolean;
};

type ScanResult = { valuePicks: ValueStock[]; dipAlerts: ValueStock[]; scanned: number; updatedAt: string };

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`w-1.5 h-2.5 rounded-sm ${i < score ? "bg-sky-400" : "bg-[#252345]"}`} />
        ))}
      </div>
      <span className="text-[9px] font-bold font-mono text-sky-400">{score}/10</span>
    </div>
  );
}

function ValueCard({ s, isDip }: { s: ValueStock; isDip: boolean }) {
  const up = (s.changePct ?? 0) >= 0;
  return (
    <div className={`bg-[#13112A] rounded-2xl border-l-2 p-5 flex flex-col gap-3 transition-colors hover:border-[#333368] ${
      isDip
        ? "border border-amber-500/30 border-l-amber-400"
        : "border border-[#252345] border-l-sky-500/40"
    }`}>
      {isDip && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 w-fit">
          <span className="text-amber-400 text-[9px] font-black">DIP ALERT</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-black font-mono text-[#F1F5F9] tracking-tight">{s.symbol}</p>
          <p className="text-[10px] text-[#4B5675] truncate mt-0.5">{s.name || s.symbol}</p>
        </div>
        <div className="text-right shrink-0">
          {s.price !== null
            ? <>
                <p className="text-lg font-black font-mono text-[#F1F5F9]">${s.price.toFixed(2)}</p>
                <p className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? "+" : ""}{(s.changePct ?? 0).toFixed(2)}%
                </p>
              </>
            : <p className="text-sm text-[#4B5675] animate-pulse">—</p>
          }
        </div>
      </div>

      {/* Metric chips */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "P/E",       value: s.pe        !== null ? `${s.pe.toFixed(1)}x`        : "—" },
          { label: "Fwd P/E",   value: s.forwardPe !== null ? `${s.forwardPe.toFixed(1)}x` : "—" },
          { label: "P/B",       value: s.pb        !== null ? `${s.pb.toFixed(2)}x`        : "—" },
          { label: "Div Yield", value: s.divYield  !== null ? `${s.divYield.toFixed(1)}%`  : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0D0B1A] rounded-lg px-2 py-1.5 text-center">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">{label}</p>
            <p className="text-[11px] font-black font-mono text-sky-400">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {s.sector && <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-[#0D0B1A] text-[#4B5675] border border-[#252345]">{s.sector}</span>}
        {s.marketCap !== null && (
          <span className="text-[9px] text-[#4B5675]">
            ${s.marketCap >= 1000 ? `${(s.marketCap/1000).toFixed(1)}T` : `${s.marketCap.toFixed(0)}B`}
          </span>
        )}
      </div>

      <ScoreBar score={s.score} />

      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-[#252345]">
        <Link
          href={`/analysis?symbol=${encodeURIComponent(s.symbol + ".US")}`}
          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
        >
          Analyse →
        </Link>
        <Link
          href={`/paper?symbol=${encodeURIComponent(s.symbol)}`}
          className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/25 hover:bg-sky-500/20 transition-colors"
        >
          Paper Trade
        </Link>
      </div>
    </div>
  );
}

function ValuePicksPanel() {
  const [data,    setData]    = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [lastScan,setLastScan]= useState<Date | null>(null);

  const scan = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/market/value-scan", { cache: "no-store" });
      if (!res.ok) { setErr(`Scan failed (${res.status})`); return; }
      const d: ScanResult = await res.json();
      setData(d);
      setLastScan(new Date());
    } catch { setErr("Network error — try again"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    scan();
    const id = setInterval(scan, 5 * 60 * 1_000);
    return () => clearInterval(id);
  }, [scan]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Live Value Screener</h2>
          <p className="text-xs text-[#4B5675] mt-0.5">
            {data
              ? `${data.scanned} stocks scanned · ${data.valuePicks.length} undervalued · ${data.dipAlerts.length} dip alerts`
              : "Scanning 30 quality stocks for real-time fundamentals…"}
            {lastScan && (
              <span className="text-[#333368] ml-2">
                · {lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span className="text-[10px] text-amber-300/80 font-medium">Educational only · not financial advice</span>
          </div>
          <button type="button" onClick={scan} disabled={loading}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {loading
              ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Scanning…</>
              : "Rescan →"}
          </button>
        </div>
      </div>

      {err && <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 mb-4 text-xs text-rose-400">{err}</div>}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 animate-pulse space-y-3">
              <div className="flex justify-between"><div className="h-4 bg-[#252345] rounded w-12" /><div className="h-5 bg-[#252345] rounded w-16" /></div>
              <div className="grid grid-cols-2 gap-1.5">{Array.from({length:4}).map((_,j)=><div key={j} className="h-10 bg-[#252345] rounded-lg"/>)}</div>
              <div className="h-3 bg-[#252345] rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Dip alerts — shown first when present */}
          {data.dipAlerts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest">Buy the Dip</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  {data.dipAlerts.length} alert{data.dipAlerts.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[9px] text-[#4B5675]">— strong fundamentals, down ≥4% today</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {data.dipAlerts.map(s => <ValueCard key={s.symbol} s={s} isDip={true} />)}
              </div>
            </div>
          )}

          {/* Value picks */}
          {data.valuePicks.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">Undervalued — live fundamentals</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {data.valuePicks.map(s => <ValueCard key={s.symbol} s={s} isDip={false} />)}
              </div>
            </div>
          )}

          {data.valuePicks.length === 0 && data.dipAlerts.length === 0 && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 text-center">
              <p className="text-sm font-medium text-[#F1F5F9] mb-1">No clear value opportunities right now</p>
              <p className="text-xs text-[#4B5675]">Market may be fairly valued across these 30 stocks. Check back when a correction creates entry points.</p>
            </div>
          )}

          <p className="text-[10px] text-[#333368] mt-4">
            Powered by Yahoo Finance market-wide screener — scans 8,000+ US equities, no hardcoded list. Value picks from undervalued_large_caps + undervalued_growth_stocks screens. Dip alerts from real-time losers screener filtered to profitable companies (PE &gt; 0) with market cap &gt; $200M. Refreshes every 5 min.
          </p>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Futures and Value picks live here as single pages. The old options screener
// sections (plays, flow, chain, calculator) disagreed with the rules-based
// Options page, so those links now go to /options.
function IntelligenceContent() {
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get("section") === "value" ? "value" : params.get("section") === "futures" ? "futures" : "options";
  useEffect(() => { if (section === "options") router.replace("/options"); }, [section, router]);

  const head = section === "futures"
    ? { t: "Futures", d: "Futures follow big markets like the S&P 500, gold and oil. Tap one to see our read on it." }
    : { t: "Value picks", d: "Well-known companies whose price looks low compared with what they earn. A starting point, not advice." };

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-6xl mx-auto w-full space-y-6">
            {section === "options" ? (
              <p className="text-[15px] text-[var(--mx-text-2)]">Opening Options…</p>
            ) : (
              <>
                <header>
                  <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">{head.t}</h1>
                  <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">{head.d}</p>
                </header>
                {section === "futures" ? <FuturesPanel /> : <ValuePicksPanel />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  return (
    <PaywallGuard>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center text-[#4B5675] text-sm animate-pulse">
          Loading…
        </div>
      }>
        <IntelligenceContent />
      </Suspense>
    </PaywallGuard>
  );
}
