"use client";

import { useEffect, useId, useState, useCallback, Suspense } from "react";
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
import { sizeOptionsPosition, describeSize } from "@/app/lib/positionSizer";
import type { PreTradeFlag } from "@/app/lib/preTradeChecks";
import RiskSizerBar, { useRiskSettings } from "@/app/components/RiskSizerBar";

// ── Types ─────────────────────────────────────────────────────────────────────

type OptionsBacktest = { count: number; hitRate: number | null; avgReturn: number | null; baselineAvgReturn: number | null };

type OptionsPlay = {
  symbol: string; name: string; play: "CALLS" | "PUTS"; signal?: "BUY" | "SELL";
  price: number; changePct: number;
  iv: number | null; delta: number | null; expiry: string | null; expiryTs?: number;
  callWall: number | null; putWall: number | null;
  expectedMove: number | null; strike: string;
  entryZone: string; target: string; stop: string; rrRatio: string;
  equityRrRatio: string; rrBasis: "option" | "equity";
  optionRR: number | null; equityRR: number | null;
  thetaCost: number | null; spreadCost: number | null; holdingDays: number | null;
  recommendShares: boolean;
  entryMid: number; stopRaw: number; riskPerContract: number | null;
  preTradeFlags: PreTradeFlag[];
  premiumEst: string | null; premiumPerContract: number | null; premiumReal?: boolean; pcVolRatio: number | null; score: number; hasOptions: boolean;
  dte: number | null; dteWarning: boolean;
  backtest: OptionsBacktest | null;
};

// Same walk-forward-vs-baseline framing as the crypto signal backtest — hit
// rate alone can look good purely from a trending stock; the edge over
// baseline is what actually says whether the signal is adding anything.
function optionsBacktestReadout(bt: OptionsBacktest | null, direction: "CALLS" | "PUTS"): { text: string; cls: string } | null {
  if (!bt || bt.count < 10 || bt.hitRate === null || bt.avgReturn === null || bt.baselineAvgReturn === null) return null;
  const edge = direction === "CALLS" ? bt.avgReturn - bt.baselineAvgReturn : bt.baselineAvgReturn - bt.avgReturn;
  const cls  = edge > 0.3 ? "text-emerald-400/80" : edge < -0.3 ? "text-rose-400/80" : "text-[#4B5675]";
  return { text: `History: ${bt.hitRate}% right · ${bt.count} signals`, cls };
}

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
  const [cheapOnly, setCheapOnly] = useState(false);
  const { settings: riskSettings, update: updateRiskSettings } = useRiskSettings();

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
        <div className="flex items-center gap-3">
          {loaded && plays.some(p => p.premiumPerContract !== null && p.premiumPerContract < 50) && (
            <button
              type="button"
              onClick={() => setCheapOnly(v => !v)}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                cheapOnly
                  ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                  : "bg-transparent text-[#4B5675] border-[#252345] hover:text-[#94A3B8]"
              }`}
            >
              Under $50 only
            </button>
          )}
          <button type="button" onClick={scan} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors disabled:opacity-40">
            {loading
              ? <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Scanning…</>
              : "Rescan →"}
          </button>
        </div>
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
          <p className="text-[11px] text-[#4B5675] leading-snug">All four gates must pass: High confidence signal, live CBOE IV, a real bid/ask premium, and 14+ DTE. Check back when the market gives a clear directional move.</p>
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
          <RiskSizerBar settings={riskSettings} onChange={updateRiskSettings} />
          {cheapOnly && (
            <div className="mb-3 px-3 py-2.5 rounded-xl bg-violet-500/8 border border-violet-500/20">
              <p className="text-[11px] text-violet-300/70 leading-snug">
                <span className="font-semibold text-violet-300">Cheap premium isn&apos;t a bargain.</span> A contract usually costs less because the market is pricing it as less likely to pay off — further out-of-the-money or shorter-dated. Same signal engine, same unproven edge, just a smaller bet. The confidence badge and history line are the only things that speak to direction — not the price.
              </p>
            </div>
          )}

          {/* Play cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(cheapOnly
              ? [...plays].filter(p => p.premiumPerContract !== null && p.premiumPerContract < 50)
                           .sort((a, b) => (a.premiumPerContract ?? 0) - (b.premiumPerContract ?? 0))
                           .slice(0, 5)
              : plays
            ).map((p, idx, arr) => {
              const isCalls   = p.play === "CALLS";
              const borderCls = isCalls ? "border-l-emerald-500/40" : "border-l-rose-500/40";
              const badgeCls  = isCalls
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-rose-500/10 text-rose-400 border-rose-500/25";
              const isSelected = selected === p.symbol;
              const isOrphan = idx === arr.length - 1 && arr.length % 3 === 1;

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

                    {/* Trade levels — Entry/Target/Stop are the UNDERLYING STOCK's levels
                        (where the stock needs to go), not the option's own premium path. */}
                    <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${isCalls ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                      {[
                        { label: "Strike",     value: p.delta !== null ? `${p.strike} · Δ${p.delta.toFixed(2)}` : p.strike, color: "text-[#F1F5F9]"  },
                        { label: "Stock entry",value: p.entryZone, color: "text-amber-400"   },
                        { label: "Stock tgt",  value: p.target,    color: "text-emerald-400" },
                        { label: "Stock stop", value: p.stop,      color: "text-rose-400"    },
                        ...(p.premiumEst ? [{ label: "Premium", value: p.premiumEst, color: "text-violet-400" }] : []),
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">{label}</span>
                          <span className={`text-[10px] font-mono font-bold ${color} text-right`}>{value}</span>
                        </div>
                      ))}
                      {/* R:R is the CONTRACT's — delta-captured move net of theta
                          and the bid-ask round trip — not the stock leg's. */}
                      <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5">
                        {p.rrRatio}
                        <span className="text-[#333368]"> {p.rrBasis === "option" ? "on the contract" : "on the underlying"}</span>
                        {p.iv != null ? ` · IV ${p.iv}%` : ""}{p.expiry ? ` · exp ${p.expiry}` : ""}{p.pcVolRatio != null ? ` · P/C vol ${p.pcVolRatio}` : ""}
                        {!p.hasOptions && <span className="text-amber-400/70"> · price-based est</span>}
                      </p>
                      {p.rrBasis === "option" && p.thetaCost !== null && p.spreadCost !== null && (
                        <p className="text-[8px] text-[#4B5675]">
                          Stock leg {p.equityRrRatio} · friction ~${p.thetaCost} theta ({p.holdingDays}d hold) + ~${p.spreadCost} spread
                        </p>
                      )}
                      {p.recommendShares && (
                        <p className="text-[8px] font-semibold text-amber-400">
                          Buy the shares instead — theta and spread cut this contract to {p.rrRatio.replace(" R:R", "")} vs {p.equityRrRatio} on stock
                        </p>
                      )}
                      {p.preTradeFlags?.map(f => (
                        <p key={f.kind} title={f.detail}
                           className={`text-[8px] font-semibold ${f.severity === "warn" ? "text-amber-400" : "text-[#4B5675]"}`}>
                          ⚠ {f.label}
                        </p>
                      ))}
                      {(() => {
                        const bt = optionsBacktestReadout(p.backtest, p.play);
                        return bt ? <p className={`text-[8px] font-semibold pt-0.5 ${bt.cls}`}>{bt.text}</p> : null;
                      })()}
                      {(() => {
                        const size = sizeOptionsPosition(riskSettings.accountSize, riskSettings.riskPct, p.premiumPerContract, {
                          entry: p.entryMid, stop: p.stopRaw, delta: p.delta, maxPremiumPct: riskSettings.maxPremiumPct,
                        });
                        if (!size) return null;
                        const d = describeSize(size, riskSettings.riskPct);
                        return <p className={`text-[8px] font-semibold pt-0.5 ${d.tone === "warn" ? "text-rose-400" : "text-sky-400"}`}>{d.text}</p>;
                      })()}
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

type Section    = "options" | "futures" | "value" | "flow" | "tools";
type ToolsTab   = "analyze" | "chain" | "calculator";

function IntelligenceContent() {
  const params  = useSearchParams();
  const initSym = params.get("sym") ?? "";

  const [section,   setSection]   = useState<Section>(() => {
    const s = params.get("section");
    if (s === "futures")    return "futures";
    if (s === "value")      return "value";
    if (s === "flow")       return "flow";
    if (s === "analyze" || s === "chain" || s === "calculator") return "tools";
    return "options";
  });

  const [toolsTab, setToolsTab] = useState<ToolsTab>(() => {
    const s = params.get("section");
    if (s === "chain")      return "chain";
    if (s === "calculator") return "calculator";
    return "analyze";
  });

  const TABS: { id: Section; label: string }[] = [
    { id: "options",  label: "Options Plays" },
    { id: "value",    label: "Value Picks"   },
    { id: "flow",     label: "Flow"          },
    { id: "futures",  label: "Futures"       },
    { id: "tools",    label: "Tools"         },
  ];

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />

        {/* Header + tab bar */}
        <div className="mt-3 mb-5">
          <h1 className="reveal text-2xl font-black tracking-tight text-gradient-green mb-4">Markets</h1>
          <div className="flex gap-0 border-b border-[#252345] overflow-x-auto scroll-fade-x">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSection(t.id)}
                className={`shrink-0 px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  section === t.id
                    ? "text-[#F1F5F9] border-emerald-500"
                    : "text-[#4B5675] border-transparent hover:text-[#94A3B8]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {section === "options" && <OptionsPlaysPanel />}
        {section === "futures" && <FuturesPanel />}
        {section === "value"   && (
          <div className="max-w-7xl mx-auto">
            <ValuePicksPanel />
          </div>
        )}
        {section === "flow"    && (
          <div className="max-w-6xl mx-auto">
            <OptionsFlow />
          </div>
        )}
        {section === "tools"   && (
          <div className="max-w-7xl mx-auto">
            {/* Tools sub-nav */}
            <div className="flex gap-1 mb-5">
              {([
                ["analyze",    "Analyze"],
                ["chain",      "Chain"],
                ["calculator", "P&L Calculator"],
              ] as [ToolsTab, string][]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setToolsTab(id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    toolsTab === id
                      ? "bg-[#252345] text-[#F1F5F9] border-[#333368]"
                      : "text-[#4B5675] border-transparent hover:text-[#94A3B8]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {toolsTab === "analyze"    && <OptionsTab initialSymbol={initSym} />}
            {toolsTab === "chain"      && <OptionsChainViewer initialSymbol={initSym} />}
            {toolsTab === "calculator" && <div className="max-w-4xl"><OptionsPLCalculator /></div>}
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
