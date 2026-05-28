"use client";

import { useState } from "react";
import Link from "next/link";

type NewsItem = { title: string; publisher: string; age: string };

type RawStock = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  changePercent: number;
  volume: number;
  avgVolume: number;
  high52w: number | null;
  low52w: number | null;
  volumeRatio: number;
  yearRangePct: number | null;
  history5d: number[];
  news: NewsItem[];
  score: number;
};

type ScanResult = {
  symbol: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: "High" | "Medium" | "Low";
  ictSetup: string;
  catalyst: string;
  marketStructure: string;
  priceZone: string;
  yearZone: string;
  volumeVerdict: string;
  keyLevel: string;
  target: string;
  power3Phase: string;
  newsImpact: string;
  // merged from raw
  name?: string;
  price?: number;
  changePercent?: number;
  volumeRatio?: number;
  yearRangePct?: number | null;
  volume?: number;
  avgVolume?: number;
  news?: NewsItem[];
};

function sigStyle(s: string) {
  if (s === "BUY")  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (s === "SELL") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  return "text-amber-400 bg-amber-500/10 border-amber-500/20";
}

function confStyle(c: string) {
  if (c === "High")   return "text-emerald-400";
  if (c === "Medium") return "text-amber-400";
  return "text-[#4B5675]";
}

function volColor(ratio: number) {
  if (ratio >= 3) return "bg-rose-500";
  if (ratio >= 2) return "bg-amber-500";
  return "bg-emerald-500";
}

function snapPct(v: number): string {
  return `w-pct-${Math.round(Math.min(Math.max(v, 0), 100) / 5) * 5}`;
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

function VolBar({ ratio, volume, avgVolume }: { ratio: number; volume?: number; avgVolume?: number }) {
  const fill = Math.min((ratio / 5) * 100, 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-[#1C2333] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${volColor(ratio)} ${snapPct(fill)}`} />
      </div>
      <span className={`text-[9px] font-mono font-bold ${ratio >= 3 ? "text-rose-400" : ratio >= 2 ? "text-amber-400" : "text-emerald-400"}`}>
        {ratio.toFixed(1)}x
      </span>
      {volume != null && (
        <span className="text-[9px] font-mono text-[#4B5675]">
          {fmtVol(volume)}{avgVolume ? ` / avg ${fmtVol(avgVolume)}` : ""}
        </span>
      )}
    </div>
  );
}

function YearBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const fill = Math.max(0, Math.min(pct, 100));
  const color = pct <= 20 ? "bg-emerald-500" : pct >= 80 ? "bg-rose-500" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-[#1C2333] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} ${snapPct(fill)}`} />
      </div>
      <span className="text-[9px] font-mono text-[#4B5675]">{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function AutoScanner() {
  const [open, setOpen]       = useState(false);
  const [scanning, setScanning] = useState(false);
  const [step, setStep]       = useState("");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [trending, setTrending] = useState<string[]>([]);
  const [marketCtx, setMarketCtx] = useState("");
  const [done, setDone]       = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setDone(false);
    setResults([]);
    setMarketCtx("");
    setExpanded(null);

    try {
      // Phase 1: Aggregate market data
      setStep("Fetching trending tickers + 55 stocks from Yahoo Finance…");
      setProgress(10);

      const scanRes = await fetch("/api/market/scan", { cache: "no-store" });
      const scanData = await scanRes.json();

      if (scanData.error) throw new Error(scanData.error);

      const top: RawStock[] = scanData.top ?? [];
      setScannedCount(scanData.scanned ?? 0);
      setTrending(scanData.trending ?? []);
      setProgress(50);

      // Phase 2: AI analysis
      setStep(`AI analyzing top ${top.length} opportunities with ICT Smart Money framework…`);
      setProgress(60);

      const aiRes = await fetch("/api/ai/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: top }),
      });
      const aiData = await aiRes.json();
      setProgress(95);

      if (aiData.error) throw new Error(aiData.error);

      // Merge AI results with raw data
      const rawMap = Object.fromEntries(top.map((s) => [s.symbol, s]));
      const merged: ScanResult[] = (aiData.ranked ?? []).slice(0, 5).map((r: ScanResult) => ({
        ...r,
        ...(rawMap[r.symbol]
          ? {
              name:         rawMap[r.symbol].name,
              price:        rawMap[r.symbol].price,
              changePercent:rawMap[r.symbol].changePercent,
              volumeRatio:  rawMap[r.symbol].volumeRatio,
              yearRangePct: rawMap[r.symbol].yearRangePct,
              volume:       rawMap[r.symbol].volume,
              avgVolume:    rawMap[r.symbol].avgVolume,
              news:         rawMap[r.symbol].news,
            }
          : {}),
      }));

      setMarketCtx(aiData.marketContext ?? "");
      setResults(merged);
      setProgress(100);
      setStep(`Scan complete — ${merged.length} high-conviction setups found`);
    } catch {
      setStep("Scan failed — check your connection or API key.");
    } finally {
      setScanning(false);
      setDone(true);
    }
  }

  return (
    <>
      <div className="fixed top-[76px] right-[84px] sm:top-[88px] sm:right-[88px] z-50 flex flex-col-reverse items-end gap-2">

        {/* Panel */}
        {open && (
          <div className="w-[290px] sm:w-[340px] lg:w-[380px] bg-[#080D14]/96 border border-[#1C2333] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col max-h-[80vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C2333] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">📡</span>
                <div>
                  <p className="text-xs font-bold text-[#F1F5F9]">Deep Market Scanner</p>
                  {scannedCount > 0 && (
                    <p className="text-[9px] text-[#4B5675]">
                      {scannedCount} stocks scanned · {trending.length > 0 ? `Trending: ${trending.slice(0,3).join(", ")}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close scanner" title="Close" className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors p-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

              {/* Idle */}
              {!scanning && !done && (
                <div className="py-4 text-center space-y-3">
                  <p className="text-[11px] text-[#7B8DB4] leading-relaxed">
                    Pulls live quotes, volume surge data, 52-week positioning, and breaking news for 55 stocks — then Claude identifies the top ICT setups right now.
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { icon: "📈", label: "55 stocks" },
                      { icon: "⚡", label: "Volume surge" },
                      { icon: "📰", label: "Live news" },
                    ].map((f) => (
                      <div key={f.label} className="bg-[#0C1017] border border-[#1C2333] rounded-xl py-2.5">
                        <p className="text-base">{f.icon}</p>
                        <p className="text-[9px] text-[#4B5675] mt-1">{f.label}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={runScan}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-2.5 rounded-xl text-xs font-bold"
                  >
                    Run Deep Scan →
                  </button>
                </div>
              )}

              {/* Scanning */}
              {scanning && (
                <div className="py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <p className="text-[10px] text-[#7B8DB4] leading-snug">{step}</p>
                  </div>
                  <div className="h-1.5 bg-[#1C2333] rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700 ${snapPct(progress)}`} />
                  </div>
                  <p className="text-[9px] text-[#2D3A50] text-right">{progress}%</p>
                </div>
              )}

              {/* Results */}
              {done && results.length > 0 && (
                <div className="space-y-2">
                  {/* Market context */}
                  {marketCtx && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2">
                      <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-semibold mb-1">Market Context</p>
                      <p className="text-[10px] text-[#7B8DB4] leading-snug">{marketCtx}</p>
                    </div>
                  )}

                  <p className="text-[9px] text-[#4B5675] uppercase tracking-widest px-1">Top {results.length} Setups</p>

                  {results.map((r, i) => {
                    const isExp = expanded === r.symbol;
                    const chgPos = (r.changePercent ?? 0) >= 0;
                    return (
                      <div key={r.symbol} className="bg-[#0C1017] border border-[#1C2333] rounded-xl overflow-hidden">

                        {/* Main row */}
                        <button
                          type="button"
                          onClick={() => setExpanded(isExp ? null : r.symbol)}
                          className="w-full text-left px-3 py-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-black text-[#4B5675] shrink-0 w-4">{i + 1}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs font-bold text-[#F1F5F9]">{r.symbol}</p>
                                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-md border ${sigStyle(r.signal)}`}>
                                    {r.signal}
                                  </span>
                                  <span className={`text-[9px] font-semibold ${confStyle(r.confidence)}`}>
                                    {r.confidence}
                                  </span>
                                </div>
                                <p className="text-[9px] text-[#4B5675] truncate">{r.name ?? ""}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-mono font-bold ${chgPos ? "text-emerald-400" : "text-rose-400"}`}>
                                {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                              </p>
                              <p className={`text-[10px] font-mono ${chgPos ? "text-emerald-400" : "text-rose-400"}`}>
                                {chgPos ? "+" : ""}{(r.changePercent ?? 0).toFixed(2)}%
                              </p>
                            </div>
                          </div>

                          {/* Volume + 52w bars */}
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-[#4B5675] w-10 shrink-0">Vol</span>
                              <VolBar ratio={r.volumeRatio ?? 1} volume={r.volume} avgVolume={r.avgVolume} />
                            </div>
                            {r.yearRangePct != null && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-[#4B5675] w-10 shrink-0">52W</span>
                                <YearBar pct={r.yearRangePct} />
                              </div>
                            )}
                          </div>

                          {/* ICT setup preview */}
                          <p className="text-[9px] text-[#4B5675] mt-2 leading-snug line-clamp-2">{r.ictSetup}</p>

                          <div className="flex items-center justify-between mt-1.5">
                            <div className="flex items-center gap-2">
                              {(r.news?.length ?? 0) > 0 && (
                                <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-px rounded-md">
                                  📰 {r.news!.length} news
                                </span>
                              )}
                              {(r.volumeRatio ?? 1) >= 2 && (
                                <span className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-px rounded-md">
                                  ⚡ Vol surge
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-[#4B5675]">{isExp ? "▲ less" : "▼ more"}</span>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExp && (
                          <div className="border-t border-[#1C2333] px-3 py-3 space-y-2.5 bg-[#060A14]">

                            {[
                              { label: "ICT Setup",    value: r.ictSetup },
                              { label: "Catalyst",     value: r.catalyst },
                              { label: "Volume",       value: r.volumeVerdict },
                              { label: "Structure",    value: r.marketStructure },
                              { label: "Price Zone",   value: r.priceZone },
                              { label: "Year Zone",    value: r.yearZone },
                              { label: "PO3 Phase",   value: r.power3Phase },
                              { label: "Key Level",    value: r.keyLevel },
                              { label: "Target",       value: r.target },
                              { label: "News Impact",  value: r.newsImpact },
                            ].map((row) => row.value ? (
                              <div key={row.label}>
                                <p className="text-[8px] text-[#4B5675] uppercase tracking-widest font-semibold">{row.label}</p>
                                <p className="text-[10px] text-[#CBD5E1] leading-snug mt-0.5">{row.value}</p>
                              </div>
                            ) : null)}

                            {/* News headlines */}
                            {(r.news?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-[8px] text-[#4B5675] uppercase tracking-widest font-semibold mb-1.5">Breaking News</p>
                                <div className="space-y-1">
                                  {r.news!.map((n, ni) => (
                                    <div key={ni} className="bg-[#0C1017] border border-[#1C2333] rounded-lg px-2 py-1.5">
                                      <p className="text-[9px] text-[#CBD5E1] leading-snug">{n.title}</p>
                                      <p className="text-[8px] text-[#4B5675] mt-0.5">{n.publisher} · {n.age}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <Link
                              href={`/analysis?symbol=${encodeURIComponent(r.symbol + ".US")}`}
                              className="flex items-center justify-center gap-1.5 w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 rounded-xl text-[10px] font-bold mt-1"
                            >
                              Full ICT Analysis →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={runScan}
                    className="w-full border border-[#1C2333] hover:border-[#2D3A50] py-2 rounded-xl text-[10px] font-semibold text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors"
                  >
                    Re-scan
                  </button>
                </div>
              )}

              {done && results.length === 0 && (
                <div className="py-6 text-center space-y-2">
                  <p className="text-xs text-[#4B5675]">No high-conviction setups found.</p>
                  <p className="text-[10px] text-[#2D3A50]">Market may be ranging — try again later.</p>
                  <button type="button" onClick={runScan} className="text-[10px] text-emerald-400 hover:underline">
                    Re-scan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Deep Market Scanner"
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95 bg-[#0C1017]/90 border border-[#1C2333] hover:border-emerald-500/40 text-[#7B8DB4] hover:text-[#F1F5F9] backdrop-blur-xl"
        >
          <span className="text-sm">📡</span>
          Scan
        </button>
      </div>
    </>
  );
}
