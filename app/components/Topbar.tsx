"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { THEME_KEY } from "../lib/theme";
import { useRouter } from "next/navigation";
import { setCurrentUser, scopedKey } from "../lib/userState";

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
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);

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
    window.addEventListener("traxora-signal", loadCount);
    return () => window.removeEventListener("traxora-signal", loadCount);
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
    <div className="h-[68px] flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 sm:px-6 shrink-0 relative bg-[#0D0B1A]/70 backdrop-blur-xl sticky top-0 z-30">
      {/* Logo — links back to landing page */}
      <Link href="/" className="flex items-center gap-2 shrink-0 group">
        <div className="w-7 h-7 rounded-lg bg-emerald-600 group-hover:bg-emerald-500 transition-colors flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <span className="text-xs font-bold text-[#4B5675] group-hover:text-[#F1F5F9] transition-colors hidden sm:block tracking-tight">Traxora</span>
      </Link>

      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <div className="flex items-center gap-2.5 bg-[#0D0B1A] border border-[#252345] hover:border-[#333368] rounded-xl px-4 py-2.5 transition-colors focus-within:border-emerald-500/50 focus-within:bg-[#0D0B1A]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
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
          <div className="absolute top-[calc(100%+6px)] left-0 w-full bg-[#13112A] border border-[#252345] rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
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
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative w-9 h-9 rounded-lg bg-[#0D0B1A] border border-[#252345] hover:border-[#333368] flex items-center justify-center text-[#7B8DB4] hover:text-[#F1F5F9] transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        {/* User */}
        {session?.user ? (
          <div className="flex items-center gap-2.5 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-1.5">
            <Link href="/settings">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
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
  );
}
