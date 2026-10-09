"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { THEME_KEY } from "../lib/theme";
import ThemeToggle from "./ThemeToggle";
import { useRouter } from "next/navigation";
import { setCurrentUser, scopedKey } from "../lib/userState";
import { signalBadgeCls } from "../lib/signalBadge";
import { loadDiscoverData, topGames, topCoins, nextIpos, scanLocalSignals } from "../lib/discoverData";
import type { DiscoverData, LocalSignal } from "../lib/discoverData";
import type { IndexRow } from "@/app/api/market/indices/route";

type SearchItem = {
  code: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  type: string;
  symbol: string;
  sector?: string;
};

const INDICES_CACHE_KEY = "traxora_indices_cache";
const INDICES_TTL_MS    = 60_000; // 1 minute

type IndexCache = { rows: IndexRow[]; ts: number };

function loadCachedIndices(): IndexRow[] | null {
  try {
    const raw = sessionStorage.getItem(INDICES_CACHE_KEY);
    if (!raw) return null;
    const c: IndexCache = JSON.parse(raw);
    if (Date.now() - c.ts > INDICES_TTL_MS) return null;
    return c.rows;
  } catch { return null; }
}

function cacheIndices(rows: IndexRow[]) {
  try { sessionStorage.setItem(INDICES_CACHE_KEY, JSON.stringify({ rows, ts: Date.now() })); } catch { /* ignore */ }
}

function fmtIdx(price: number | null, symbol: string): string {
  if (price === null) return "—";
  if (symbol === "BTC-USD") return price >= 1000 ? `$${(price / 1000).toFixed(1)}k` : `$${price.toFixed(0)}`;
  return `$${price.toFixed(2)}`;
}

// ── Market Indices Bar ────────────────────────────────────────────────────────

function IndicesBar({ session }: { session: { user?: unknown } | null }) {
  const [rows, setRows] = useState<IndexRow[]>(() => loadCachedIndices() ?? []);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchIndices() {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/market/indices", { cache: "no-store" });
      if (!res.ok) return;
      const data: IndexRow[] = await res.json();
      if (Array.isArray(data)) { setRows(data); cacheIndices(data); }
    } catch { /* silently ignore */ }
  }

  useEffect(() => {
    if (!session?.user) return;
    if (!loadCachedIndices()) fetchIndices();
    timerRef.current = setInterval(fetchIndices, INDICES_TTL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user]);

  if (!session?.user || rows.length === 0) return null;

  // Duration scales with the list so per-item pace stays roughly constant
  // regardless of how many indices the API returns.
  const duration = Math.max(14, rows.length * 3.5);

  return (
    <div className="flex items-center border-t border-white/[0.04] py-1">
      <div className="ticker-mask flex-1 min-w-0">
        <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
          {[0, 1].map(copy => (
            <div key={copy} className="flex items-center gap-1 pl-4" aria-hidden={copy === 1}>
              {rows.map(r => {
                const up = (r.change ?? 0) >= 0;
                return (
                  <div key={`${copy}-${r.symbol}`} className="shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#0D0B1A]/60">
                    <span className="text-[10px] text-[#4B5675] font-medium">{r.label}</span>
                    <span className="text-[10px] font-mono font-bold text-[#CBD5E1]">{fmtIdx(r.price, r.symbol)}</span>
                    {r.change !== null && (
                      <span className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                        {up ? "+" : ""}{r.change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <span className="shrink-0 text-[8px] text-[#333368] px-3">15-min delay</span>
    </div>
  );
}

// ── Main Topbar ───────────────────────────────────────────────────────────────

type TopbarProps = {
  onSearch?: (symbol: string) => void;
};

export default function Topbar({ onSearch }: TopbarProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false); // phone: expand search to full topbar width
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [bellShake, setBellShake] = useState(false);
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  const [discover, setDiscover] = useState<DiscoverData | null>(null);
  const [signals, setSignals]   = useState<LocalSignal[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Keep module-level _userId in sync with session so scopedKey works in this component
  useEffect(() => {
    setCurrentUser(session?.user?.email ?? null);
  }, [session]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedKey("recent_symbols"));
      setRecentSymbols(raw ? JSON.parse(raw) : []);
    } catch { setRecentSymbols([]); }
  }, [session]); // re-run when session changes so key is recomputed with correct user

  useEffect(() => {
    function loadCount() {
      try {
        const alerts = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]");
        setAlertCount(Array.isArray(alerts) ? alerts.length : 0);
      } catch { setAlertCount(0); }
    }
    loadCount();
    const shake = () => { setBellShake(true); loadCount(); setTimeout(() => setBellShake(false), 800); };
    window.addEventListener("traxora-signal", shake);
    return () => window.removeEventListener("traxora-signal", shake);
  }, [session]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setResults(data);
          setOpen(true);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function saveRecent(symbol: string) {
    try {
      const key  = scopedKey("recent_symbols"); // recompute fresh — _userId now set by effect above
      const prev: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      const next = [symbol, ...prev.filter(s => s !== symbol)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
      setRecentSymbols(next);
    } catch { /* ignore */ }
  }

  function handleSelect(symbol: string) {
    setQuery("");
    setOpen(false);
    saveRecent(symbol);
    onSearch?.(symbol);
    router.push(`/analysis?symbol=${encodeURIComponent(symbol)}`);
  }

  return (
    <div className="topbar-glass flex flex-col shrink-0 sticky top-0 z-30">
    <div className="h-[60px] flex items-center justify-between gap-4 px-4 sm:px-6 relative">
      {/* Logo — links back to landing page */}
      <Link href="/" className={`topbar-logo ${searchFocused ? "hidden sm:flex" : "flex"} items-center gap-2 shrink-0 group`}>
        <div className="logo-icon-bg w-7 h-7 rounded-lg bg-emerald-600 group-hover:bg-emerald-500 transition-colors flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <span className="logo-text text-xs font-bold hidden sm:block tracking-tight">Traxora</span>
      </Link>

      {/* Search */}
      <div data-tour="search" className="flex-1 min-w-0 max-w-xl relative">
        <div className="focus-ring glass surface-sheen flex items-center gap-2.5 border border-[#252345] hover:border-[#333368] rounded-xl px-4 py-2.5 transition-all duration-100 focus-within:border-emerald-500/40">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search any symbol or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              setSignals(scanLocalSignals(6));
              if (!discover) loadDiscoverData().then(setDiscover).catch(() => { /* palette shows skeletons */ });
              if (results.length > 0 || !query.trim()) setOpen(true);
            }}
            onBlur={() => { setTimeout(() => setOpen(false), 150); setTimeout(() => setSearchFocused(false), 150); }}
            className="flex-1 min-w-0 bg-transparent text-[#F1F5F9] text-sm outline-none placeholder:text-[#4B5675]"
          />
          {loading && (
            <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#252345] text-[#4B5675] text-[10px] font-mono shrink-0">
            ⌘K
          </kbd>
        </div>

        {/* Dropdown */}
        {open && (results.length > 0 || !query.trim()) && (
          <div className={`dropdown-enter absolute top-[calc(100%+6px)] left-0 w-full bg-[#13112A] border border-[#252345] rounded-xl shadow-2xl z-[var(--z-dropdown)] overflow-hidden overflow-y-auto ${query.trim() ? "max-h-80" : "max-h-[72vh]"}`}>
            {/* Command palette — shown when query is empty */}
            {!query.trim() && (
              <>
                {/* Browse quick links */}
                <div className="px-4 pt-3 pb-2.5 border-b border-[#252345]">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-2">Browse</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "🏆 Sports",   href: "/sports",                       cls: "border-amber-500/25 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20" },
                      { label: "₿ Crypto",    href: "/explore?view=crypto",          cls: "border-violet-500/25 text-violet-400 bg-violet-500/10 hover:bg-violet-500/20" },
                      { label: "🚀 IPOs",     href: "/ipo",                          cls: "border-sky-500/25 text-sky-400 bg-sky-500/10 hover:bg-sky-500/20" },
                      { label: "🎯 Options",  href: "/intelligence?section=options", cls: "border-emerald-500/25 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20" },
                      { label: "📅 Earnings", href: "/earnings",                     cls: "border-teal-500/25 text-teal-400 bg-teal-500/10 hover:bg-teal-500/20" },
                    ].map(b => (
                      <button key={b.href} type="button"
                        onClick={() => { setOpen(false); router.push(b.href); }}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${b.cls}`}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent symbols — compact chips */}
                {recentSymbols.length > 0 && (
                  <div className="px-4 pt-2.5 pb-2.5 border-b border-[#252345]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Recent</p>
                      <button
                        type="button"
                        onClick={() => {
                          try { localStorage.removeItem(scopedKey("recent_symbols")); } catch { /* ignore */ }
                          setRecentSymbols([]);
                        }}
                        className="text-[10px] text-[#4B5675] hover:text-rose-400 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSymbols.map(sym => (
                        <button key={sym} type="button" onClick={() => handleSelect(sym)}
                          className="text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg bg-[#0D0B1A] border border-[#252345] text-[#CBD5E1] hover:border-emerald-500/40 hover:text-emerald-400 transition-colors">
                          {sym.replace(".US", "").replace(".COMM", "")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live AI signals — from this device's fresh signal cache */}
                {signals.length > 0 && (
                  <div className="px-4 pt-2.5 pb-2.5 border-b border-[#252345]">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="ping-live w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Live AI Signals</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {signals.map(s => (
                        <button key={s.symbol} type="button" onClick={() => handleSelect(s.symbol)}
                          className="flex items-center gap-2 rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-[#333368] hover:bg-[#1A1838] px-2.5 py-1.5 transition-colors text-left">
                          <span className="text-[11px] font-bold font-mono text-[#F1F5F9] truncate flex-1">{s.symbol.replace(".US", "").replace(".COMM", "")}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-px rounded-md border shrink-0 ${signalBadgeCls(s.signal)}`}>{s.signal}</span>
                          <span className={`text-[9px] font-semibold shrink-0 ${s.confidence === "High" ? "text-emerald-400" : s.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>{s.confidence}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sports · Crypto · IPO snapshots */}
                {discover === null ? (
                  <div className="px-4 py-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-9 rounded-lg bg-[#0D0B1A] border border-[#252345] animate-pulse" />
                    ))}
                    <p className="text-[10px] text-[#4B5675] text-center pt-1">Loading today&apos;s picks…</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2">

                    {/* Sports picks */}
                    {topGames(discover.games, 3).length > 0 && (
                      <div className="px-4 pt-2.5 pb-2.5 border-b border-[#252345] sm:border-r">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Top Sports Picks</p>
                          </div>
                          <button type="button" onClick={() => { setOpen(false); router.push("/sports"); }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors">All →</button>
                        </div>
                        <div className="space-y-1.5">
                          {topGames(discover.games, 3).map(g => (
                            <button key={g.id} type="button" onClick={() => { setOpen(false); router.push("/sports"); }}
                              className="w-full rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-amber-500/30 px-2.5 py-1.5 transition-colors text-left">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold text-[#F1F5F9] truncate">{g.awayTeam} @ {g.homeTeam}</p>
                                <span className="text-[8px] font-bold text-[#4B5675] shrink-0">{g.league}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] text-amber-300 font-bold truncate">{g.predictedWinner}</span>
                                <span className="ml-auto text-[9px] font-mono font-bold text-[#F1F5F9] shrink-0">{g.winnerConfidence}%</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Crypto movers */}
                    {topCoins(discover.coins, 3).length > 0 && (
                      <div className="px-4 pt-2.5 pb-2.5 border-b border-[#252345]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Crypto Movers</p>
                          </div>
                          <button type="button" onClick={() => { setOpen(false); router.push("/explore?view=crypto"); }}
                            className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold transition-colors">All →</button>
                        </div>
                        <div className="space-y-1.5">
                          {topCoins(discover.coins, 3).map(c => {
                            const up = (c.changePct ?? 0) >= 0;
                            return (
                              <button key={c.symbol} type="button" onClick={() => handleSelect(c.symbol)}
                                className="w-full flex items-center gap-2 rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-violet-500/30 px-2.5 py-1.5 transition-colors text-left">
                                <span className="text-[10px] font-black font-mono text-violet-300 w-10 shrink-0">{c.ticker}</span>
                                <span className="text-[10px] font-mono text-[#7B8DB4] truncate flex-1">
                                  {c.price !== null ? `$${c.price >= 100 ? c.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.price.toFixed(2)}` : "—"}
                                </span>
                                {c.bigMove && <span className="text-[7px] font-bold px-1 py-px rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0">MOVE</span>}
                                {!c.bigMove && c.squeeze && <span className="text-[7px] font-bold px-1 py-px rounded bg-sky-500/10 text-sky-400 border border-sky-500/25 shrink-0">COIL</span>}
                                <span className={`text-[10px] font-mono font-bold shrink-0 ${up ? "text-emerald-400" : "text-rose-400"}`}>
                                  {up ? "+" : ""}{(c.changePct ?? 0).toFixed(1)}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Upcoming IPOs */}
                    {nextIpos(discover.ipos, 3).length > 0 && (
                      <div className="px-4 pt-2.5 pb-3 sm:col-span-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Upcoming IPOs</p>
                          </div>
                          <button type="button" onClick={() => { setOpen(false); router.push("/ipo"); }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold transition-colors">All →</button>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-1.5">
                          {nextIpos(discover.ipos, 3).map(i => (
                            <button key={`${i.symbol || i.name}-${i.date}`} type="button" onClick={() => { setOpen(false); router.push("/ipo"); }}
                              className="rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-sky-500/30 px-2.5 py-1.5 transition-colors text-left">
                              <div className="flex items-center justify-between gap-1.5">
                                <p className="text-[10px] font-semibold text-[#F1F5F9] truncate">{i.name}</p>
                                <span className={`text-[8px] font-bold shrink-0 ${i.rating === "Strong" ? "text-emerald-400" : i.rating === "Watch" ? "text-amber-400" : "text-rose-400"}`}>{i.rating}</span>
                              </div>
                              <p className="text-[9px] font-mono text-[#4B5675] mt-px">
                                {i.symbol || "TBD"} · {new Date(`${i.date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </>
            )}
            {/* Search results */}
            {results.length > 0 && <div className="stagger-container">
            {results.map((item, i) => (
              <button
                key={`${item.symbol}-${i}`}
                type="button"
                onClick={() => handleSelect(item.symbol)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#1A1838] transition-colors border-b border-[#252345] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#F1F5F9] font-mono">{item.symbol}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#252345] text-[#4B5675] font-medium capitalize shrink-0">
                      {item.type}
                    </span>
                  </div>
                  <p className="text-xs text-[#7B8DB4] truncate mt-0.5">{item.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-[#4B5675]">{item.exchange}</p>
                  {item.sector && <p className="text-[10px] text-[#4B5675] mt-0.5 truncate max-w-[100px]">{item.sector}</p>}
                </div>
              </button>
            ))}
            </div>}
          </div>
        )}
      </div>

      {/* Right side — hidden on phones while searching so the input gets full width */}
      <div className={`${searchFocused ? "hidden sm:flex" : "flex"} items-center gap-2`}>
        {/* Scan shortcut */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("traxora-open-scanner"))}
          className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-[#333368] hover:text-[#F1F5F9] text-[#7B8DB4] transition-colors shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          <span className="text-[11px] font-semibold">Scan</span>
        </button>
        {/* Theme toggle */}
        <ThemeToggle />
        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative w-9 h-9 rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-[#333368] flex items-center justify-center text-[#7B8DB4] hover:text-[#F1F5F9] transition-all duration-100 hover:scale-110 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            className={bellShake ? "bell-ring" : alertCount > 0 ? "" : ""}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--mx-text)] rounded-full text-[var(--mx-canvas)] text-[9px] flex items-center justify-center font-bold">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        {/* User */}
        {session?.user ? (
          <div className="flex items-center gap-2.5 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-1.5">
            <Link href="/settings">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt="Profile"
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-lg object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-[var(--mx-text)] flex items-center justify-center text-xs font-semibold text-[var(--mx-canvas)]">
                  {session.user.name?.[0] ?? "U"}
                </div>
              )}
            </Link>
            <Link href="/settings" className="hidden sm:block leading-tight">
              <p className="text-xs font-semibold text-[#F1F5F9] truncate max-w-[120px]">
                {session.user.name ?? "User"}
              </p>
              <p className="text-[10px] text-[#4B5675] truncate max-w-[120px]">
                {session.user.email ?? ""}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => { localStorage.removeItem(THEME_KEY); sessionStorage.clear(); signOut({ callbackUrl: "/login" }); }}
              className="hidden sm:block text-[10px] text-[#4B5675] hover:text-rose-400 transition-colors ml-1 font-medium"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-4 py-2 rounded-xl text-sm font-semibold text-white"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
    <IndicesBar session={session} />
    </div>
  );
}
