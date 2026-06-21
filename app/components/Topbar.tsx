"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { THEME_KEY } from "../lib/theme";
import { useRouter } from "next/navigation";
import { setCurrentUser, scopedKey } from "../lib/userState";
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

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-t border-white/[0.04] px-4 py-1">
      {rows.map(r => {
        const up = (r.change ?? 0) >= 0;
        return (
          <div key={r.symbol} className="shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#0D0B1A]/60">
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
      <span className="ml-auto shrink-0 text-[8px] text-[#333368] pr-1">15-min delay</span>
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
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [bellShake, setBellShake] = useState(false);
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
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
    setQuery(symbol);
    setOpen(false);
    saveRecent(symbol);
    onSearch?.(symbol);
    router.push(`/analysis?symbol=${encodeURIComponent(symbol)}`);
  }

  return (
    <div className="topbar-glass flex flex-col shrink-0 sticky top-0 z-30">
    <div className="h-[68px] flex items-center justify-between gap-4 px-4 sm:px-6 relative">
      {/* Logo — links back to landing page */}
      <Link href="/" className="flex items-center gap-2 shrink-0 group">
        <div className="w-7 h-7 rounded-lg bg-emerald-600 group-hover:bg-emerald-500 transition-colors flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <span className="logo-text text-xs font-bold hidden sm:block tracking-tight">Traxora</span>
      </Link>

      {/* Search */}
      <div className="flex-1 max-w-xl relative">
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
            onFocus={() => { if (results.length > 0 || (!query.trim() && recentSymbols.length > 0)) setOpen(true); }}
            className="flex-1 bg-transparent text-[#F1F5F9] text-sm outline-none placeholder:text-[#4B5675]"
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
        {open && (results.length > 0 || (!query.trim() && recentSymbols.length > 0)) && (
          <div className="dropdown-enter absolute top-[calc(100%+6px)] left-0 w-full bg-[#13112A] border border-[#252345] rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
            {/* Recent symbols — shown when query is empty */}
            {!query.trim() && recentSymbols.length > 0 && (
              <>
                <div className="px-4 py-2 flex items-center justify-between border-b border-[#252345]">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Recent</p>
                  <button
                    type="button"
                    onClick={() => {
                      try { localStorage.removeItem(scopedKey("recent_symbols")); } catch { /* ignore */ }
                      setRecentSymbols([]);
                      setOpen(false);
                    }}
                    className="text-[10px] text-[#4B5675] hover:text-rose-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {recentSymbols.map(sym => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleSelect(sym)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#1A1838] transition-colors border-b border-[#252345] last:border-0"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p className="text-sm font-bold text-[#F1F5F9] font-mono">{sym.replace(".US", "").replace(".COMM", "")}</p>
                    <p className="text-xs text-[#4B5675] ml-1">{sym}</p>
                  </button>
                ))}
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

      {/* Right side */}
      <div className="flex items-center gap-2">
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
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold bounce-in">
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
                <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
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
              className="text-[10px] text-[#4B5675] hover:text-rose-400 transition-colors ml-1 font-medium"
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
