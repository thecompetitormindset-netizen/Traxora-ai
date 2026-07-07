"use client";

import { useEffect, useId, useState, useCallback, Suspense } from "react";
import { useSwipeTabs } from "@/app/lib/useSwipeTabs";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import OptionsTab from "@/app/components/paper/OptionsTab";
import OptionsChainViewer from "@/app/components/OptionsChainViewer";
import OptionsPLCalculator from "@/app/components/OptionsPLCalculator";
import OptionsFlow from "@/app/components/OptionsFlow";
import { signalBadgeCls } from "@/app/lib/signalBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

type OptionsPlay = {
  symbol: string; name: string; play: "CALLS" | "PUTS";
  price: number; changePct: number;
  iv: number | null; expiry: string | null; expiryTs?: number;
  callWall: number | null; putWall: number | null;
  expectedMove: number | null; strike: string;
  entryZone: string; target: string; stop: string; rrRatio: string;
  premiumEst: string | null; pcVolRatio: number | null; score: number; hasOptions: boolean;
  dte: number | null; dteWarning: boolean;
};

type FuturesCard = {
  symbol: string; name: string;
  price: number | null; change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  sparkline: number[] | null;
  loading: boolean;
};

const FUTURES_LIST = [
  { symbol: "ES.COMM",  name: "E-mini S&P 500"    },
  { symbol: "NQ.COMM",  name: "E-mini NASDAQ-100"  },
  { symbol: "YM.COMM",  name: "E-mini Dow Jones"   },
  { symbol: "RTY.COMM", name: "E-mini Russell 2000" },
  { symbol: "GC.COMM",  name: "Gold"               },
  { symbol: "SI.COMM",  name: "Silver"             },
  { symbol: "CL.COMM",  name: "Crude Oil (WTI)"    },
  { symbol: "NG.COMM",  name: "Natural Gas"         },
];


function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

function Sparkline({ closes, positive }: { closes: number[]; positive: boolean }) {
  if (closes.length < 2) return null;
  const uid    = useId().replace(/:/g, "");
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

// ── Options Plays Panel ───────────────────────────────────────────────────────

function OptionsPlaysPanel() {
  const [plays,    setPlays]    = useState<OptionsPlay[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loaded,   setLoaded]   = useState(false);
  const [scanned,  setScanned]  = useState(0);
  const [withIV,   setWithIV]   = useState(0);
  const [err,      setErr]      = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const scan = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res  = await fetch("/api/market/options-scan", { cache: "no-store" });
      if (!res.ok) { setErr(`Scan failed (${res.status})`); return; }
      const data = await res.json();
      setPlays(data.plays ?? []);
      setScanned(data.scanned ?? 0);
      setWithIV(data.withIV ?? 0);
      setLoaded(true);
      setLastScan(new Date());
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, []);

  // Load on mount + auto-refresh every 5 minutes
  useEffect(() => {
    scan();
    const id = setInterval(scan, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [scan]);

  const marketClosed = (() => {
    const now = new Date();
    if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return true;
    const y = now.getUTCFullYear();
    const m1 = new Date(Date.UTC(y, 2, 1));
    const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - m1.getUTCDay()) % 7) + 7, 7));
    const n1 = new Date(Date.UTC(y, 10, 1));
    const dstEnd   = new Date(Date.UTC(y, 10, 1 + ((7 - n1.getUTCDay()) % 7), 6));
    const etOff    = (now >= dstStart && now < dstEnd) ? -4 : -5;
    const etMins   = (now.getUTCHours() + 24 + etOff) % 24 * 60 + now.getUTCMinutes();
    return etMins < 570 || etMins >= 960;
  })();

  const calls = plays.filter(p => p.play === "CALLS");
  const puts  = plays.filter(p => p.play === "PUTS");

  return (
    <div className="scan-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Options Plays</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-[#4B5675]">
              {loaded ? `${plays.length} setups · ${scanned} scanned · ${withIV} with live IV` : "Scanning 30 liquid stocks…"}
            </p>
            {lastScan && (
              <span className="text-[9px] font-mono text-[#333368]">
                · {lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {marketClosed && loaded && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25">
                Market closed
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={scan} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors disabled:opacity-40">
          {loading
            ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Scanning…</>
            : "Rescan →"}
        </button>
      </div>

      {err && <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 mb-4"><p className="text-xs text-rose-400">{err}</p></div>}

      {loading && !loaded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-[#252345] rounded w-14 mb-2" />
              <div className="h-3 bg-[#252345] rounded w-24 mb-4" />
              <div className="h-6 bg-[#252345] rounded w-20 mb-3" />
              <div className="space-y-1.5"><div className="h-3 bg-[#252345] rounded" /><div className="h-3 bg-[#252345] rounded" /></div>
            </div>
          ))}
        </div>
      )}

      {loaded && plays.length === 0 && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-[#F1F5F9] mb-1">No premium setups right now</p>
          <p className="text-[11px] text-[#4B5675] leading-snug">All three gates must pass: High confidence signal, live CBOE IV, and 14+ DTE. Check back when the market gives a clear directional move.</p>
        </div>
      )}

      {loaded && plays.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Calls",    value: calls.length, color: "text-emerald-400" },
              { label: "Puts",     value: puts.length,  color: "text-rose-400"    },
              { label: "With IV",  value: withIV,       color: "text-violet-400"  },
            ].map(s => (
              <div key={s.label} className="card-shine glass surface-sheen border border-[#252345] rounded-xl px-4 py-3 text-center">
                <p className={`num-reveal text-2xl font-black font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 mt-0.5 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <p className="text-[11px] text-amber-300/80 leading-snug">
              <span className="font-semibold text-amber-300">Educational signals only — not financial advice.</span> Options can lose 100% of their value. Always verify DTE, IV environment, and earnings dates before trading.
            </p>
          </div>

          {/* Play cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {plays.map((p, idx) => {
              const isCalls   = p.play === "CALLS";
              const borderCls = isCalls ? "border-l-emerald-500/40" : "border-l-rose-500/40";
              const badgeCls  = isCalls
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-rose-500/10 text-rose-400 border-rose-500/25";
              const isSelected = selected === p.symbol;
              const isOrphan = idx === plays.length - 1 && plays.length % 3 === 1;

              return (
                <div key={p.symbol} className={`${isOrphan ? "sm:col-span-2 xl:col-span-3" : ""} bg-[#13112A] rounded-2xl border border-l-2 border-[#252345] ${borderCls} overflow-hidden`}>
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold tracking-tight">{p.symbol}</p>
                          {p.dte !== null && (
                            <span className={`text-[8px] font-bold px-1.5 py-px rounded-md border ${
                              p.dte < 7  ? "bg-rose-500/15 text-rose-400 border-rose-500/30" :
                              p.dte < 14 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                           "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}>{p.dte}d</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#4B5675] mt-0.5 truncate max-w-[130px]">{p.name}</p>
                      </div>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${badgeCls}`}>{p.play}</span>
                    </div>

                    {/* Price */}
                    <p className="text-xl font-bold font-mono text-[#F1F5F9]">${p.price.toFixed(2)}</p>
                    <p className={`text-xs font-mono mt-0.5 ${changeColor(p.changePct)}`}>
                      {p.changePct >= 0 ? "+" : ""}{p.changePct.toFixed(2)}% today
                    </p>

                    {/* Trade levels */}
                    <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${isCalls ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                      {[
                        { label: "Strike",  value: p.strike,    color: "text-[#F1F5F9]"  },
                        { label: "Entry",   value: p.entryZone, color: "text-amber-400"   },
                        { label: "Target",  value: p.target,    color: "text-emerald-400" },
                        { label: "Stop",    value: p.stop,      color: "text-rose-400"    },
                        ...(p.premiumEst ? [{ label: "Premium", value: p.premiumEst, color: "text-violet-400" }] : []),
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">{label}</span>
                          <span className={`text-[10px] font-mono font-bold ${color} text-right`}>{value}</span>
                        </div>
                      ))}
                      <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5">
                        {p.rrRatio}{p.iv != null ? ` · IV ${p.iv}%` : ""}{p.expiry ? ` · exp ${p.expiry}` : ""}{p.pcVolRatio != null ? ` · P/C vol ${p.pcVolRatio}` : ""}
                        {!p.hasOptions && <span className="text-amber-400/70"> · price-based est</span>}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3">
                      <Link href={`/analysis?symbol=${encodeURIComponent(p.symbol + ".US")}`}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                        Analyse →
                      </Link>
                      <button type="button"
                        onClick={() => setSelected(isSelected ? null : p.symbol)}
                        className="text-[11px] text-violet-400 hover:text-violet-300 font-medium transition-colors ml-auto">
                        {isSelected ? "Hide options ▲" : "Options analysis ▼"}
                      </button>
                    </div>
                  </div>

                  {/* Inline options analysis */}
                  {isSelected && (
                    <div className="border-t border-[#252345] p-4">
                      <OptionsTab initialSymbol={p.symbol} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
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
            body: JSON.stringify({ symbol, price, previousClose: prev, dayChangePercent: change ?? 0 }),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Futures Markets</h2>
          <p className="text-xs text-[#4B5675] mt-0.5">Live prices + AI signals across 8 major contracts</p>
        </div>
        <Link href="/explore" className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">All markets →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {futures.map(f => (
          <Link key={f.symbol} href={`/analysis?symbol=${encodeURIComponent(f.symbol)}`}
            className={`card-shine surface-sheen card-hover-lift group bg-[#13112A] rounded-2xl p-5 border border-l-2 border-[#252345] hover:border-[#333368] hover:bg-[#1A1838] ${
              f.signal === "BUY" ? "border-l-emerald-500/40 signal-card-buy" : f.signal === "SELL" ? "border-l-rose-500/40 signal-card-sell" : "border-l-[#252345]"
            }`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-bold tracking-tight">{f.symbol.replace(".COMM", "")}</p>
                  <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">FUT</span>
                </div>
                <p className="text-xs text-[#4B5675] mt-0.5 truncate max-w-[110px]">{f.name}</p>
              </div>
              {f.loading
                ? <span className="text-[#4B5675] text-xs animate-pulse">…</span>
                : f.signal
                ? <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${signalBadgeCls(f.signal)}`}>{f.signal}</span>
                    {f.confidence && <span className={`text-[9px] font-semibold ${f.confidence === "High" ? "text-emerald-400" : f.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>{f.confidence}</span>}
                  </div>
                : <span className="text-[11px] px-2 py-0.5 rounded-lg border bg-[#1A1838] text-[#4B5675] border-[#252345]">—</span>
              }
            </div>

            {/* Price */}
            <p className={`text-xl font-bold font-mono ${changeColor(f.change)}`}>
              {f.price !== null ? `$${f.price.toFixed(2)}` : <span className="text-[#4B5675] animate-pulse">——</span>}
            </p>
            <div className="flex items-end justify-between mt-1">
              <p className={`text-xs font-mono ${changeColor(f.change)}`}>
                {f.change !== null ? `${f.change >= 0 ? "+" : ""}${f.change.toFixed(2)}%` : "—"}
              </p>
              {f.sparkline && <Sparkline closes={f.sparkline} positive={(f.change ?? 0) >= 0} />}
            </div>

            <p className="text-[11px] text-emerald-400 mt-3 group-hover:text-emerald-300 transition-colors font-medium">Analyse →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Value Picks ───────────────────────────────────────────────────────────────

type ValuePick = {
  symbol:   string;
  name:     string;
  sector:   string;
  pe:       string;
  metric:   string;
  metaKey:  string;
  why:      string;
};

const VALUE_PICKS: ValuePick[] = [
  { symbol: "PFE",  name: "Pfizer",           sector: "Healthcare",  pe: "~11x",  metric: "6.5%",  metaKey: "Div Yield", why: "Trading at multi-year lows after COVID windfall ended. Pipeline re-rated too harshly — oncology acquisitions add long-term upside at current price." },
  { symbol: "INTC", name: "Intel",             sector: "Technology",  pe: "~13x",  metric: "0.8x",  metaKey: "P/B",       why: "Near book value with CHIPS Act fabrication subsidies providing a floor. Foundry turnaround is slow but the margin of safety at this price is significant." },
  { symbol: "DVN",  name: "Devon Energy",      sector: "Energy",      pe: "~7x",   metric: "4.2%",  metaKey: "FCF Yield", why: "Deeply discounted against oil sector peers. Variable dividend model returns cash efficiently. Strong balance sheet with minimal debt." },
  { symbol: "KEY",  name: "KeyCorp",           sector: "Financials",  pe: "~10x",  metric: "0.9x",  metaKey: "P/B",       why: "Regional bank trading below book value. Rate cycle pressures are fading — NIM expansion likely as deposit costs normalize in 2025–26." },
  { symbol: "CSCO", name: "Cisco Systems",     sector: "Technology",  pe: "~13x",  metric: "3.2%",  metaKey: "Div Yield", why: "Mature but still growing. AI infrastructure spending boosts networking demand. Strong FCF and a growing security/software recurring revenue base." },
  { symbol: "MO",   name: "Altria Group",      sector: "Consumer",    pe: "~9x",   metric: "8.4%",  metaKey: "Div Yield", why: "Priced for a decline that has been slower than feared. Pricing power sustains margins; on! nicotine pouch growth partially offsets cigarette volume decline." },
  { symbol: "VZ",   name: "Verizon",           sector: "Telecom",     pe: "~9x",   metric: "6.5%",  metaKey: "Div Yield", why: "Bond-like income at a steep equity discount. Spectrum value understated on the balance sheet. 5G capex cycle is peaking — FCF set to rise." },
  { symbol: "WBA",  name: "Walgreens",         sector: "Retail",      pe: "N/A",   metric: "~0.05x",metaKey: "P/S",       why: "Deep restructuring story — store closures cutting costs, VillageMD exit reducing losses. Pharmacy services are sticky; market pricing in worst case." },
];

type LiveQuote = { price: number; change: number };

function ValuePicksPanel() {
  const [quotes,  setQuotes]  = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const results = await Promise.allSettled(
        VALUE_PICKS.map(p =>
          fetch(`/api/quote?symbol=${encodeURIComponent(p.symbol + ".US")}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => ({ symbol: p.symbol, price: d?.price ?? null, prev: d?.previousClose ?? null }))
        )
      );
      const map: Record<string, LiveQuote> = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.price) {
          const { symbol, price, prev } = r.value;
          const change = price && prev ? ((price - prev) / prev) * 100 : 0;
          map[symbol] = { price, change };
        }
      }
      setQuotes(map);
      setLoading(false);
    }
    fetchAll();
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Undervalued Picks</h2>
          <p className="text-xs text-[#4B5675] mt-0.5">8 stocks trading below intrinsic value — live prices, fundamental rationale</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span className="text-[10px] text-amber-300/80 font-medium">Educational only — not financial advice</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {VALUE_PICKS.map((p) => {
          const q = quotes[p.symbol];
          const up = (q?.change ?? 0) >= 0;
          return (
            <div key={p.symbol}
              className="bg-[#13112A] rounded-2xl border border-[#252345] border-l-2 border-l-sky-500/40 p-5 flex flex-col gap-3 hover:border-[#333368] transition-colors">

              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black font-mono text-[#F1F5F9] tracking-tight">{p.symbol}</p>
                  <p className="text-[10px] text-[#4B5675] truncate mt-0.5">{p.name}</p>
                  <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 mt-1 inline-block">{p.sector}</span>
                </div>
                <div className="text-right shrink-0">
                  {loading && !q
                    ? <div className="h-5 w-16 bg-[#252345] rounded animate-pulse mb-1" />
                    : q
                    ? <>
                        <p className="text-lg font-black font-mono text-[#F1F5F9]">${q.price.toFixed(2)}</p>
                        <p className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                          {up ? "+" : ""}{q.change.toFixed(2)}%
                        </p>
                      </>
                    : <p className="text-sm text-[#4B5675]">—</p>
                  }
                </div>
              </div>

              {/* Key metrics */}
              <div className="flex gap-3">
                <div className="flex-1 bg-[#0D0B1A] rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">P/E</p>
                  <p className="text-xs font-black font-mono text-sky-400">{p.pe}</p>
                </div>
                <div className="flex-1 bg-[#0D0B1A] rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">{p.metaKey}</p>
                  <p className="text-xs font-black font-mono text-sky-400">{p.metric}</p>
                </div>
              </div>

              {/* Why undervalued */}
              <p className="text-[10px] text-[#7B8DB4] leading-relaxed line-clamp-3">{p.why}</p>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-auto pt-1 border-t border-[#252345]">
                <Link
                  href={`/analysis?symbol=${encodeURIComponent(p.symbol + ".US")}`}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                >
                  Analyse →
                </Link>
                <Link
                  href={`/paper?symbol=${encodeURIComponent(p.symbol)}`}
                  className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/25 hover:bg-sky-500/20 transition-colors"
                >
                  Paper Trade
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-[#333368] mt-4 leading-relaxed">
        Fundamentals sourced from analyst consensus data as of mid-2025. P/E and yield figures are approximate — verify with latest filings before trading. These picks represent sectors historically discounted to fair value, not guaranteed outperformers.
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Section = "options" | "futures" | "analyze" | "chain" | "calculator" | "flow" | "value";

const SECTION_TABS = ["options", "futures", "flow", "chain", "calculator", "analyze", "value"] as const satisfies readonly Section[];

function IntelligenceContent() {
  const params  = useSearchParams();
  const initSym = params.get("sym") ?? "";
  const [section, setSection] = useState<Section>(() => {
    const s = params.get("section");
    return (s === "futures" || s === "analyze" || s === "options" || s === "chain" || s === "flow" || s === "calculator" || s === "value") ? s as Section : "options";
  });

  useSwipeTabs(SECTION_TABS, section, setSection);

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />

        {/* Header */}
        <div className="mt-3 mb-6">
          <h1 className="reveal text-2xl font-black tracking-tight text-gradient-green">Markets</h1>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap gap-1 bg-[#1A1838] rounded-xl p-1 text-xs mb-6 w-fit">
          {([
            ["options",     "📊 Options Plays"],
            ["futures",     "⚡ Futures"],
            ["flow",        "🌊 Flow"],
            ["chain",       "⛓️ Chain"],
            ["calculator",  "💹 P&L"],
            ["analyze",     "🔍 Analyze"],
            ["value",       "💎 Value"],
          ] as [Section, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSection(id)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${section === id ? (id === "value" ? "bg-sky-600 text-white" : "bg-violet-600 text-white") : "text-[#4B5675] hover:text-[#F1F5F9]"}`}>
              {label}
            </button>
          ))}
        </div>

        {section === "options"  && <OptionsPlaysPanel />}
        {section === "futures"  && <FuturesPanel />}
        {section === "flow"     && (
          <div className="max-w-6xl mx-auto">
            <OptionsFlow />
          </div>
        )}
        {section === "chain"    && (
          <div className="max-w-7xl mx-auto">
            <OptionsChainViewer initialSymbol={initSym} />
          </div>
        )}
        {section === "calculator" && (
          <div className="max-w-4xl mx-auto">
            <OptionsPLCalculator />
          </div>
        )}
        {section === "analyze"  && (
          <div className="max-w-7xl mx-auto">
            <OptionsTab initialSymbol={initSym} />
          </div>
        )}
        {section === "value" && (
          <div className="max-w-7xl mx-auto">
            <ValuePicksPanel />
          </div>
        )}
      </main>
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
