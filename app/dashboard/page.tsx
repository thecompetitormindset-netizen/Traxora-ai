"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PaywallGuard from "../components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import SentimentWidget from "../components/SentimentWidget";
import MarketStatus from "../components/MarketStatus";
import OnboardingModal from "../components/OnboardingModal";
import SignalPerformance from "../components/SignalPerformance";
import { scopedKey } from "../lib/userState";
import { getSignalCache, setSignalCache } from "../lib/signalCache";
import { haptic } from "../lib/haptics";

type TradeLevels = {
  entryZone:   string;
  stopLoss:    string;
  takeProfit:  string;
  entryReason: string;
  stopReason:  string;
  tpReason:    string;
  rrRatio:     string;
};

type StockCard = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  trade: TradeLevels | null;
  loading: boolean;
  sparkline: number[] | null;
  earningsDate: string | null;
  isNew?: boolean;
};

type FuturesCard = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  signal: "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  trade: TradeLevels | null;
  sparkline: number[] | null;
  loading: boolean;
};

const DEFAULT_WATCHLIST = [
  { symbol: "AAPL.US",  name: "Apple Inc." },
  { symbol: "MSFT.US",  name: "Microsoft Corp." },
  { symbol: "NVDA.US",  name: "NVIDIA Corp." },
  { symbol: "TSLA.US",  name: "Tesla Inc." },
  { symbol: "AMZN.US",  name: "Amazon.com Inc." },
  { symbol: "GOOGL.US", name: "Alphabet Inc." },
  { symbol: "META.US",  name: "Meta Platforms" },
  { symbol: "JPM.US",   name: "JPMorgan Chase" },
  { symbol: "ES.COMM",  name: "E-mini S&P 500" },
];

const WATCHLIST_KEY = "traxora_watchlist";

function loadCustomWatchlist(): Array<{ symbol: string; name: string }> {
  try {
    const raw = localStorage.getItem(scopedKey(WATCHLIST_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_WATCHLIST;
}

function saveCustomWatchlist(list: Array<{ symbol: string; name: string }>) {
  localStorage.setItem(scopedKey(WATCHLIST_KEY), JSON.stringify(list));
}

// ── Price alerts ─────────────────────────────────────────────────────────────

const ALERTS_KEY = "traxora_price_alerts";

type PriceAlert = { above: number | null; below: number | null };
type AlertMap   = Record<string, PriceAlert>;

function loadAlerts(): AlertMap {
  try { return JSON.parse(localStorage.getItem(scopedKey(ALERTS_KEY)) ?? "{}"); } catch { return {}; }
}
function saveAlerts(m: AlertMap) {
  localStorage.setItem(scopedKey(ALERTS_KEY), JSON.stringify(m));
}
function checkAlert(symbol: string, price: number, alerts: AlertMap): "above" | "below" | null {
  const a = alerts[symbol];
  if (!a) return null;
  if (a.above != null && price >= a.above) return "above";
  if (a.below != null && price <= a.below) return "below";
  return null;
}

const DEFAULT_FUTURES_LIST = [
  { symbol: "ES.COMM",  name: "E-mini S&P 500"    },
  { symbol: "NQ.COMM",  name: "E-mini NASDAQ-100"  },
  { symbol: "YM.COMM",  name: "E-mini Dow Jones"   },
  { symbol: "RTY.COMM", name: "E-mini Russell 2000" },
  { symbol: "GC.COMM",  name: "Gold"               },
  { symbol: "SI.COMM",  name: "Silver"             },
  { symbol: "CL.COMM",  name: "Crude Oil (WTI)"    },
  { symbol: "NG.COMM",  name: "Natural Gas"         },
];

const FUTURES_KEY = "traxora_futures";

function loadFuturesList(): Array<{ symbol: string; name: string }> {
  try {
    const raw = localStorage.getItem(scopedKey(FUTURES_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_FUTURES_LIST;
}

function saveFuturesList(list: Array<{ symbol: string; name: string }>) {
  localStorage.setItem(scopedKey(FUTURES_KEY), JSON.stringify(list));
}



function Sparkline({ closes, positive }: { closes: number[]; positive: boolean }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 56, h = 22;
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = h - 2 - ((c - min) / range) * (h - 4);
    return `${x},${y}`;
  });
  const ptsStr = pts.join(" ");
  const color = positive ? "#34D399" : "#F87171";
  const gradId = positive ? "spark-up" : "spark-dn";
  const areaPoints = `0,${h} ${ptsStr} ${w},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} className="sparkline-area" />
      <polyline points={ptsStr} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sparkline-path" />
    </svg>
  );
}

function signalBadge(signal: string | null) {
  if (signal === "BUY")  return "badge-buy  bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (signal === "SELL") return "badge-sell bg-rose-500/10    text-rose-400    border-rose-500/20";
  return "badge-hold bg-amber-500/10 text-amber-400 border-amber-500/20";
}

function signalBorder(signal: string | null) {
  if (signal === "BUY")  return "border-l-emerald-500/40";
  if (signal === "SELL") return "border-l-rose-500/40";
  return "border-l-[#252345]";
}

function changeColor(v: number | null) {
  if (v === null) return "text-[#4B5675]";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

function fireNotification(symbol: string, name: string, signal: "BUY" | "SELL", price: number, confidence: string) {
  if (typeof window === "undefined") return;
  // Respect pause toggle
  if (localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true") return;
  haptic.signal();
  // Persist alert so history builds even without push permission
  const existing = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]");
  existing.unshift({ symbol, name, signal, price, confidence, time: Date.now() });
  localStorage.setItem(scopedKey("traxora_alerts"), JSON.stringify(existing.slice(0, 50)));
  window.dispatchEvent(new CustomEvent("traxora-signal", {
    detail: { symbol, name, signal, price, confidence }
  }));
  if (Notification.permission !== "granted") return;
  const emoji = signal === "BUY" ? "🟢" : "🔴";
  const notif = new Notification(
    `${emoji} Traxora AI — ${signal}: ${symbol.replace(".US","").replace(".COMM","")}`,
    { body: `${name} · $${price.toFixed(2)} · ${confidence} confidence`, icon: "/icon-192.png", tag: `signal-${symbol}` }
  );
  notif.onclick = () => { window.focus(); window.location.href = `/notifications`; notif.close(); };
}

// Dedup: don't re-fire the same signal for the same symbol within 4 hours.
// Only fires again if the signal DIRECTION changes (BUY→SELL or vice versa).
function shouldFireAlert(symbol: string, signal: "BUY" | "SELL"): boolean {
  try {
    const raw = localStorage.getItem(scopedKey("traxora_last_signals"));
    const stored: Record<string, { signal: string; time: number }> = raw ? JSON.parse(raw) : {};
    const entry = stored[symbol];
    if (!entry) return true;
    if (entry.signal !== signal) return true; // direction changed → always fire
    return Date.now() - entry.time > 4 * 60 * 60 * 1000; // same direction: fire after 4 h
  } catch { return true; }
}

function markAlertFired(symbol: string, signal: "BUY" | "SELL") {
  try {
    const raw = localStorage.getItem(scopedKey("traxora_last_signals"));
    const stored: Record<string, { signal: string; time: number }> = raw ? JSON.parse(raw) : {};
    stored[symbol] = { signal, time: Date.now() };
    localStorage.setItem(scopedKey("traxora_last_signals"), JSON.stringify(stored));
  } catch { /* ignore */ }
}


const PAPER_KEY   = "paper_portfolio_v2";
const PAPER_START = 10_000;

type PaperStats = {
  accountValue: number;
  realizedPL:   number;
  openCount:    number;
  closedCount:  number;
  winRate:      number | null;
};

function loadPaperStats(storageKey: string): PaperStats {
  const empty: PaperStats = { accountValue: PAPER_START, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    const trades = JSON.parse(raw) as Array<{
      direction: string; entryPrice: number; exitPrice: number | null; shares: number; status: string;
    }>;
    const open   = trades.filter(t => t.status === "OPEN");
    const closed = trades.filter(t => t.status === "CLOSED");
    const pl     = (t: typeof trades[0], price: number) =>
      (t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price) * t.shares;
    const realizedPL  = closed.reduce((s, t) => t.exitPrice != null ? s + pl(t, t.exitPrice) : s, 0);
    const wins        = closed.filter(t => t.exitPrice != null && pl(t, t.exitPrice) > 0).length;
    return {
      accountValue: PAPER_START + realizedPL,
      realizedPL,
      openCount:   open.length,
      closedCount: closed.length,
      winRate:     closed.length > 0 ? Math.round((wins / closed.length) * 100) : null,
    };
  } catch { return empty; }
}

// ── Top Options Plays ────────────────────────────────────────────────────────

type OptionsPlay = {
  symbol: string; price: number; changePct: number;
  signal: "BUY" | "SELL"; confidence: "High" | "Medium" | "Low";
  play: "CALLS" | "PUTS"; iv: number | null; expiry: string | null;
  callWall: number | null; putWall: number | null;
  expectedMove: number | null; strike: string;
  entryZone: string; target: string; stop: string; rrRatio: string;
  premiumEst: string | null;
  pcVolRatio: number | null;
  score: number; hasOptions: boolean;
};

function OptionsPlaysSection() {
  const [plays,     setPlays]     = useState<OptionsPlay[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loaded,    setLoaded]    = useState(false);
  const [scanned,   setScanned]   = useState(0);
  const [withIV,    setWithIV]    = useState(0);
  const [err,       setErr]       = useState<string | null>(null);
  const [lastScan,  setLastScan]  = useState<Date | null>(null);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  function copyClaudePrompt(p: OptionsPlay) {
    const side = p.play === "CALLS" ? "buy calls on" : "buy puts on";
    const lines = [
      `Using my connected Robinhood Agentic account, ${side} ${p.symbol} (${p.strike} strike${p.expiry ? `, exp ${p.expiry}` : ""}).`,
      `Entry zone: ${p.entryZone}`,
      `Stop: ${p.stop}`,
      `Target: ${p.target}`,
      `R:R ${p.rrRatio}${p.premiumEst ? ` — est. premium ${p.premiumEst}` : ""}`,
      `Size the position conservatively for the account balance. Confirm the order details with me before submitting.`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedSymbol(p.symbol);
      setTimeout(() => setCopiedSymbol((s) => (s === p.symbol ? null : s)), 2000);
    });
  }

  async function scan() {
    setLoading(true);
    setErr(null);
    try {
      const res  = await fetch("/api/market/options-scan", { cache: "no-store" });
      if (!res.ok) { setErr(`Server error ${res.status}`); return; }
      const data = await res.json();
      setPlays(data.plays ?? []);
      setScanned(data.scanned ?? 0);
      setWithIV(data.withIV ?? 0);
      setLoaded(true);
      setLastScan(new Date());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error — try again");
    } finally { setLoading(false); }
  }

  // Auto-load on mount + refresh every 5 minutes
  useEffect(() => {
    scan();
    const id = setInterval(scan, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect if market is closed — uses proper ET time with DST
  const marketClosed = (() => {
    const now = new Date();
    if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return true; // weekend
    // US DST: 2nd Sun March → 1st Sun November
    const y = now.getUTCFullYear();
    const m1 = new Date(Date.UTC(y, 2, 1));
    const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - m1.getUTCDay()) % 7) + 7, 7));
    const n1 = new Date(Date.UTC(y, 10, 1));
    const dstEnd   = new Date(Date.UTC(y, 10, 1 + ((7 - n1.getUTCDay()) % 7), 6));
    const etOff    = (now >= dstStart && now < dstEnd) ? -4 : -5;
    const etMins   = (now.getUTCHours() + 24 + etOff) % 24 * 60 + now.getUTCMinutes();
    // NYSE regular session 9:30–16:00 ET
    return etMins < 570 || etMins >= 960;
  })();

  return (
    <section>
      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="text-base font-semibold">Top Options Plays</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-[#4B5675]">
            {loaded ? `${plays.length} setups · ${scanned} scanned · ${withIV} with live IV` : loading ? "Scanning 30 stocks…" : "30 stocks"}
          </span>
          {lastScan && (
            <span className="text-[9px] font-mono text-[#333368]">
              · as of {lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {marketClosed && loaded && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25">
              Market closed · pre/after-hours prices
            </span>
          )}
        </div>
        {loaded && (
          <button
            type="button"
            onClick={scan}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Scanning…
              </>
            ) : "Rescan →"}
          </button>
        )}
      </div>

      {err && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 mb-3">
          <p className="text-sm text-rose-400">{err}</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-1.5">
                  <div className="h-4 bg-[#252345] rounded w-14" />
                  <div className="h-3 bg-[#252345] rounded w-24" />
                </div>
                <div className="h-5 bg-[#252345] rounded w-14" />
              </div>
              <div className="h-6 bg-[#252345] rounded w-20 mb-1" />
              <div className="h-3 bg-[#252345] rounded w-16 mb-3" />
              <div className="space-y-1.5 mt-3">
                <div className="h-3 bg-[#252345] rounded w-full" />
                <div className="h-3 bg-[#252345] rounded w-full" />
                <div className="h-3 bg-[#252345] rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && plays.length === 0 && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-6 text-center">
          <p className="text-[#4B5675] text-sm">No clear setups right now. Try again during market hours.</p>
        </div>
      )}

      {loaded && plays.length > 0 && (
        <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3">
          {plays.map((p, i) => (
            <Link
              key={p.symbol}
              href={`/intelligence?section=analyze&sym=${encodeURIComponent(p.symbol)}`}
              className={`group bg-[#13112A] rounded-2xl p-5 border border-l-2 hover:border-[#333368] hover:bg-[#1A1838] transition-colors border-[#252345] ${
                p.play === "CALLS" ? "border-l-emerald-500/40" : "border-l-rose-500/40"
              }`}
            >
              {/* Header — same structure as watchlist */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold tracking-tight">{p.symbol}</p>
                    <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">OPTIONS</span>
                  </div>
                  <p className="text-xs text-[#4B5675] mt-0.5">#{i + 1} ranked setup</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                    p.play === "CALLS"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}>{p.play}</span>
                  <span className={`text-[9px] font-semibold ${
                    p.confidence === "High"   ? "text-emerald-400" :
                    p.confidence === "Medium" ? "text-amber-400"   : "text-[#4B5675]"
                  }`}>{p.confidence}</span>
                </div>
              </div>

              {/* Price + change — same as watchlist */}
              <p className={`text-xl font-bold font-mono ${p.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                ${p.price.toFixed(2)}
              </p>
              <p className={`text-xs mt-1 font-medium font-mono ${p.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {p.changePct >= 0 ? "+" : ""}{p.changePct.toFixed(2)}% today
              </p>

              {/* Trade details box — identical layout to watchlist */}
              <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${
                p.play === "CALLS" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Strike</span>
                  <span className="text-[10px] font-mono font-bold text-amber-400">{p.strike}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Entry</span>
                  <span className="text-[10px] font-mono font-bold text-[#F1F5F9]">{p.entryZone}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Target</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400">{p.target}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Stop</span>
                  <span className="text-[10px] font-mono font-bold text-rose-400">{p.stop}</span>
                </div>
                {p.premiumEst && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Premium</span>
                    <span className="text-[10px] font-mono font-bold text-violet-400">{p.premiumEst}</span>
                  </div>
                )}
                <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5 leading-snug">
                  {p.rrRatio}{p.iv != null ? ` · IV ${p.iv}%` : ""}{p.expiry ? ` · exp ${p.expiry}` : ""}{p.pcVolRatio != null ? ` · P/C vol ${p.pcVolRatio}` : ""}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <p className="text-[11px] text-emerald-400 group-hover:text-emerald-300 transition-colors font-medium">Analyse options →</p>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyClaudePrompt(p); }}
                  title="Copy a trade instruction to paste into Claude Code for Robinhood execution"
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
                >
                  {copiedSymbol === p.symbol ? "Copied!" : "Send to Claude →"}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [paperStats, setPaperStats] = useState<PaperStats>({
    accountValue: PAPER_START, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null,
  });

  const [watchlist, setWatchlist]           = useState<Array<{ symbol: string; name: string }>>(DEFAULT_WATCHLIST);
  const watchlistInitialized                = useRef(false);
  const [editMode, setEditMode]             = useState(false);
  const [addInput, setAddInput]             = useState("");
  const [addLoading, setAddLoading]         = useState(false);
  const [addError, setAddError]             = useState<string | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const [stocks, setStocks]                 = useState<StockCard[]>(
    DEFAULT_WATCHLIST.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, earningsDate: null, loading: true }))
  );
  const [trendingStocks, setTrendingStocks] = useState<StockCard[]>([]);
  const [poppedSymbols, setPoppedSymbols]   = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched]       = useState<number | null>(null);
  const [priceAlerts, setPriceAlerts]       = useState<AlertMap>({});
  const [copiedSymbol, setCopiedSymbol]     = useState<string | null>(null); // symbol whose Claude prompt was just copied
  const [alertForm, setAlertForm]           = useState<string | null>(null); // symbol whose form is open
  const [alertAbove, setAlertAbove]         = useState("");
  const [alertBelow, setAlertBelow]         = useState("");
  const [futuresList, setFuturesList]         = useState<Array<{ symbol: string; name: string }>>(DEFAULT_FUTURES_LIST);
  const [futures, setFutures]                 = useState<FuturesCard[]>(
    DEFAULT_FUTURES_LIST.map((f) => ({ ...f, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, loading: true }))
  );
  const [editFutures, setEditFutures]         = useState(false);
  const [addFuturesInput, setAddFuturesInput] = useState("");
  const [addFuturesLoading, setAddFuturesLoading] = useState(false);
  const [addFuturesError, setAddFuturesError] = useState<string | null>(null);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [alertsPaused, setAlertsPaused] = useState(false);

  useEffect(() => {
    const key     = scopedKey(PAPER_KEY);
    const refresh = () => setPaperStats(loadPaperStats(key));
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
    } else {
      setNotifPermission(Notification.permission);
    }
    setAlertsPaused(localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true");
    setPriceAlerts(loadAlerts());
  }, []);

  // Fetch stocks + signals — loads watchlist from localStorage on mount, then hydrates from Supabase
  useEffect(() => {
    let active = true;
    const wl = loadCustomWatchlist();
    setWatchlist(wl);
    setStocks(wl.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, earningsDate: null, loading: true })));

    // Pull from Supabase in background — overrides localStorage if server has different data
    fetch("/api/user/watchlist")
      .then((r) => r.json())
      .then((data: { items?: Array<{ symbol: string; name: string }> | null }) => {
        if (!active || !Array.isArray(data.items) || data.items.length === 0) return;
        // Only override if Supabase list differs from what we loaded
        const localSym  = wl.map((w) => w.symbol).join(",");
        const serverSym = data.items.map((w) => w.symbol).join(",");
        if (localSym === serverSym) { watchlistInitialized.current = true; return; }
        saveCustomWatchlist(data.items);
        setWatchlist(data.items);
        setStocks(data.items.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, earningsDate: null, loading: true })));
        watchlistInitialized.current = true;
      })
      .catch(() => { watchlistInitialized.current = true; });

    // Start fetching quotes regardless (use `wl` — Supabase override fetches separately via watchlist state change)
    wl.forEach(async ({ symbol, name }) => {
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price  = data?.price ?? null;
        const prev   = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, price, change, loading: false } : c));
        setLastFetched(Date.now());
        // Fetch sparkline in background (non-blocking — failure is silent)
        fetch(`/api/eod-bars?symbol=${encodeURIComponent(symbol)}`)
          .then((r) => r.json())
          .then((bars: Array<{ close: number }>) => {
            if (Array.isArray(bars) && bars.length >= 2) {
              const closes = bars.slice(-10).map((b) => b.close);
              setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, sparkline: closes } : c));
            }
          })
          .catch(() => { /* best-effort */ });
        if (price && prev) {
          // Check 30-min signal cache before hitting the AI API
          const cached = getSignalCache(symbol, price);
          let signal:     "BUY" | "HOLD" | "SELL" | null = cached?.signal ?? null;
          let confidence: "High" | "Medium" | "Low" | null = cached?.confidence ?? null;
          let trade:      TradeLevels | null = (cached?.trade as TradeLevels) ?? null;

          if (!cached) {
            const analyzeRes = await fetch("/api/ai/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbol, price, previousClose: prev, open: data?.open, high: data?.high, low: data?.low, dayChangePercent: change, quick: true }),
            });
            const analysis = await analyzeRes.json();
            signal     = analysis?.signal ?? null;
            confidence = analysis?.confidence ?? null;
            trade      = analysis?.trade ?? null;
            if (signal && confidence) {
              setSignalCache(symbol, price, { signal, confidence, trade });
            }
          }

          setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, signal, confidence, trade } : c));
          if (signal && signal !== "HOLD") {
            setPoppedSymbols((prev) => new Set([...prev, symbol]));
          }
          if (signal && signal !== "HOLD" && confidence === "High" && shouldFireAlert(symbol, signal) && price) {
            fireNotification(symbol, name, signal, price, confidence);
            markAlertFired(symbol, signal);
          }
        }
      } catch {
        setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, loading: false } : c));
      }
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync watchlist to Supabase whenever it changes (skip initial load)
  useEffect(() => {
    if (!watchlistInitialized.current) { watchlistInitialized.current = true; return; }
    const id = setTimeout(() => {
      fetch("/api/user/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: watchlist }),
      }).catch(() => { /* best-effort */ });
    }, 800);
    return () => clearTimeout(id);
  }, [watchlist]);

  // Load futures list from localStorage on mount + fetch quotes + AI signals
  useEffect(() => {
    const fl = loadFuturesList();
    setFuturesList(fl);
    setFutures(fl.map((f) => ({ ...f, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, loading: true })));

    fl.forEach(async ({ symbol, name }) => {
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price  = data?.price ?? null;
        const prev   = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        setFutures((f) => f.map((c) => c.symbol === symbol ? { ...c, price, change, loading: false } : c));

        // Sparkline
        fetch(`/api/eod-bars?symbol=${encodeURIComponent(symbol)}`)
          .then((r) => r.json())
          .then((bars: Array<{ close: number }>) => {
            if (Array.isArray(bars) && bars.length >= 2) {
              const closes = bars.slice(-10).map((b) => b.close);
              setFutures((f) => f.map((c) => c.symbol === symbol ? { ...c, sparkline: closes } : c));
            }
          })
          .catch(() => { /* best-effort */ });

        // AI signal
        if (price && prev) {
          const ar = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, price, previousClose: prev, open: data?.open, high: data?.high, low: data?.low, dayChangePercent: change, quick: true }),
          });
          const analysis = await ar.json();
          const signal: "BUY" | "HOLD" | "SELL" | null      = analysis?.signal     ?? null;
          const confidence: "High" | "Medium" | "Low" | null = analysis?.confidence ?? null;
          const trade: TradeLevels | null                     = analysis?.trade      ?? null;
          setFutures((f) => f.map((c) => c.symbol === symbol ? { ...c, signal, confidence, trade } : c));
          if (signal && signal !== "HOLD" && confidence === "High" && shouldFireAlert(symbol, signal) && price) {
            fireNotification(symbol, name, signal, price, confidence);
            markAlertFired(symbol, signal);
          }
        }
      } catch {
        setFutures((f) => f.map((c) => c.symbol === symbol ? { ...c, loading: false } : c));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Price-only refresh (no AI re-run) — extracted so countdown can call it directly
  const refreshPrices = useCallback(() => {
    if (watchlist.length === 0) return;
    const currentAlerts = loadAlerts();
    watchlist.forEach(async ({ symbol, name }) => {
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price  = data?.price ?? null;
        const prev   = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        if (price) {
          setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, price, change } : c));
          const hit = checkAlert(symbol, price, currentAlerts);
          if (hit) {
            const dir    = hit === "above" ? "↑ Above" : "↓ Below";
            const thresh = hit === "above" ? currentAlerts[symbol].above : currentAlerts[symbol].below;
            fireNotification(symbol, name, "BUY", price, "High");
            if (Notification.permission === "granted") {
              new Notification(`${dir} $${thresh} — ${symbol.replace(/\.(US|COMM)$/, "")}`, {
                body: `${name} · now $${price.toFixed(2)}`,
                icon: "/icon-192.png",
                tag:  `price-alert-${symbol}`,
              });
            }
            const updated = { ...currentAlerts, [symbol]: { ...currentAlerts[symbol], [hit]: null } };
            saveAlerts(updated);
            setPriceAlerts(updated);
          }
        }
      } catch { /* silent */ }
    });
    setLastFetched(Date.now());
  }, [watchlist]);

  // Countdown timer — fires refreshPrices when it hits 0, then resets to 60
  const refreshPricesRef = useRef(refreshPrices);
  useEffect(() => { refreshPricesRef.current = refreshPrices; }, [refreshPrices]);

  useEffect(() => {
    setRefreshCountdown(60);
    const tick = setInterval(() => {
      setRefreshCountdown(c => {
        if (c <= 1) {
          refreshPricesRef.current();
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [watchlist]);

  // Fetch earnings dates once the watchlist is set (background, non-blocking)
  useEffect(() => {
    if (watchlist.length === 0) return;
    const stockSyms = watchlist.filter(w => w.symbol.endsWith(".US")).map(w => w.symbol);
    if (stockSyms.length === 0) return;
    fetch(`/api/earnings?symbols=${encodeURIComponent(stockSyms.join(","))}`)
      .then((r) => r.json())
      .then((data: Record<string, string | null>) => {
        setStocks((s) => s.map((c) => data[c.symbol] !== undefined ? { ...c, earningsDate: data[c.symbol] } : c));
      })
      .catch(() => { /* best-effort */ });
  }, [watchlist]);

  // After all watchlist signals load, fetch trending stocks and pop them in
  useEffect(() => {
    const allDone = stocks.length > 0 && stocks.every(
      (s) => !s.loading && (s.signal !== null || s.price === null),
    );
    if (!allDone || trendingStocks.length > 0) return;

    const existingSyms = new Set(
      watchlist.map((w) => w.symbol.replace(/\.(US|COMM)$/, "")),
    );

    async function loadTrending() {
      try {
        const res  = await fetch("/api/market/trending");
        const data = await res.json();
        const fresh: StockCard[] = ((data.trending ?? []) as Array<{
          symbol: string; name: string; price: number; previousClose: number;
          changePct: number; open: number | null; high: number | null; low: number | null;
        }>)
          .filter((t) => !existingSyms.has(t.symbol))
          .slice(0, 4)
          .map((t) => ({
            symbol:     t.symbol,
            name:       t.name,
            price:      t.price,
            change:     t.changePct,
            signal:     null,
            confidence: null,
            trade:      null,
            sparkline:    null,
            earningsDate: null,
            loading:      false,
            isNew:        true,
          }));

        if (fresh.length === 0) return;
        setTrendingStocks(fresh);

        for (const s of fresh) {
          try {
            const ar = await fetch("/api/ai/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: s.symbol, price: s.price,
                previousClose: s.price, dayChangePercent: s.change, quick: true,
              }),
            });
            const analysis = await ar.json();
            const signal: "BUY" | "HOLD" | "SELL" | null      = analysis?.signal     ?? null;
            const confidence: "High" | "Medium" | "Low" | null  = analysis?.confidence ?? null;
            const trade: TradeLevels | null                      = analysis?.trade      ?? null;
            setTrendingStocks((prev) =>
              prev.map((t) => t.symbol === s.symbol ? { ...t, signal, confidence, trade } : t),
            );
            if (signal && signal !== "HOLD") {
              setPoppedSymbols((prev) => new Set([...prev, s.symbol]));
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    loadTrending();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  function toggleAlertPause() {
    setAlertsPaused(prev => {
      const next = !prev;
      localStorage.setItem(scopedKey("traxora_alerts_paused"), String(next));
      return next;
    });
  }

  async function addTicker() {
    const sym = addInput.trim().toUpperCase();
    if (!sym) return;
    const fullSym = sym.includes(".") ? sym : `${sym}.US`;
    if (watchlist.some((w) => w.symbol === fullSym)) {
      setAddError("Already in watchlist");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(fullSym)}`);
      const data = await res.json();
      if (!data?.price) { setAddError("Symbol not found — try AAPL, SPY, BTC-USD"); setAddLoading(false); return; }

      let name = sym;
      try {
        const sr      = await fetch(`/api/search?q=${encodeURIComponent(sym)}`);
        const results = await sr.json();
        const match   = (results as Array<{ symbol: string; code?: string; name: string }>)
          .find((r) => r.symbol === sym || r.code === sym);
        if (match?.name) name = match.name;
      } catch { /* use ticker as name */ }

      const entry   = { symbol: fullSym, name };
      const newWl   = [...watchlist, entry];
      setWatchlist(newWl);
      saveCustomWatchlist(newWl);
      setAddInput("");

      const price  = data.price as number;
      const prev   = data.previousClose as number | null;
      const change = price && prev ? ((price - prev) / prev) * 100 : null;
      setStocks((s) => [...s, { ...entry, price, change, signal: null, confidence: null, trade: null, sparkline: null, earningsDate: null, loading: false }]);

      if (price && prev) {
        try {
          const ar       = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: fullSym, price, previousClose: prev, open: data.open, high: data.high, low: data.low, dayChangePercent: change, quick: true }) });
          const analysis = await ar.json();
          const signal: "BUY" | "HOLD" | "SELL" | null      = analysis?.signal     ?? null;
          const confidence: "High" | "Medium" | "Low" | null = analysis?.confidence ?? null;
          const trade: TradeLevels | null                     = analysis?.trade      ?? null;
          setStocks((s) => s.map((c) => c.symbol === fullSym ? { ...c, signal, confidence, trade } : c));
          if (signal && signal !== "HOLD") setPoppedSymbols((p) => new Set([...p, fullSym]));
          if (signal && signal !== "HOLD" && confidence === "High" && shouldFireAlert(fullSym, signal)) {
            fireNotification(fullSym, name, signal, price, confidence);
            markAlertFired(fullSym, signal);
          }
        } catch { /* signal fetch is best-effort */ }
      }
    } catch {
      setAddError("Network error — try again");
    } finally {
      setAddLoading(false);
    }
  }

  function removeTicker(symbol: string) {
    const newWl = watchlist.filter((w) => w.symbol !== symbol);
    setWatchlist(newWl);
    saveCustomWatchlist(newWl);
    setStocks((s) => s.filter((c) => c.symbol !== symbol));
  }

  function copyClaudePrompt(item: { symbol: string; name: string; signal: "BUY" | "HOLD" | "SELL" | null; trade: TradeLevels | null }) {
    if (!item.trade || !item.signal || item.signal === "HOLD") return;
    const side = item.signal === "BUY" ? "buy" : "sell";
    const lines = [
      `Using my connected Robinhood Agentic account, ${side} ${item.symbol.replace(".US", "").replace(".COMM", "")} (${item.name}).`,
      `Entry zone: ${item.trade.entryZone}`,
      `Stop loss: ${item.trade.stopLoss}`,
      `Target: ${item.trade.takeProfit}`,
      `R:R ${item.trade.rrRatio} — ${item.trade.entryReason}`,
      `Size the position conservatively for the account balance. Confirm the order details with me before submitting.`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedSymbol(item.symbol);
      setTimeout(() => setCopiedSymbol((s) => (s === item.symbol ? null : s)), 2000);
    });
  }

  function openAlertForm(symbol: string) {
    const existing = priceAlerts[symbol];
    setAlertAbove(existing?.above != null ? String(existing.above) : "");
    setAlertBelow(existing?.below != null ? String(existing.below) : "");
    setAlertForm((prev) => prev === symbol ? null : symbol);
  }

  function saveAlert(symbol: string) {
    const above = alertAbove.trim() ? parseFloat(alertAbove) : null;
    const below = alertBelow.trim() ? parseFloat(alertBelow) : null;
    const updated = { ...priceAlerts, [symbol]: { above: isNaN(above as number) ? null : above, below: isNaN(below as number) ? null : below } };
    setPriceAlerts(updated);
    saveAlerts(updated);
    setAlertForm(null);
  }

  function clearAlert(symbol: string) {
    const updated = { ...priceAlerts };
    delete updated[symbol];
    setPriceAlerts(updated);
    saveAlerts(updated);
    setAlertForm(null);
  }

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

  function signalRank(s: StockCard): number {
    if (s.signal === "BUY"  && s.confidence === "High")   return 0;
    if (s.signal === "SELL" && s.confidence === "High")   return 1;
    if (s.signal === "BUY"  && s.confidence === "Medium") return 2;
    if (s.signal === "SELL" && s.confidence === "Medium") return 3;
    if (s.signal === "BUY")                               return 4;
    if (s.signal === "SELL")                              return 5;
    if (s.loading || (s.price !== null && s.signal === null)) return 6;
    return 7; // HOLD or no data
  }


  const buyCount  = stocks.filter((s) => s.signal === "BUY").length;
  const holdCount = stocks.filter((s) => s.signal === "HOLD").length;
  const sellCount = stocks.filter((s) => s.signal === "SELL").length;
  const sentiment = buyCount > sellCount ? "Bullish" : sellCount > buyCount ? "Bearish" : "Neutral";
  // true while any stock is still fetching a quote or waiting on AI signal
  const isAnalyzing = stocks.some((s) => s.loading || (s.price !== null && s.signal === null));

  // Keep original order while loading; sort by signal strength once done
  const displayStocks: StockCard[] = isAnalyzing
    ? stocks
    : [...stocks, ...trendingStocks].sort((a, b) => signalRank(a) - signalRank(b));

  async function addFuture() {
    const sym = addFuturesInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym) return;
    const fullSym = `${sym}.COMM`;
    if (futuresList.some((f) => f.symbol === fullSym)) {
      setAddFuturesError("Already in list"); return;
    }
    setAddFuturesLoading(true);
    setAddFuturesError(null);
    try {
      const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(fullSym)}`);
      const data = await res.json();
      if (!data?.price) { setAddFuturesError("Symbol not found — try ES, GC, CL, ZN…"); setAddFuturesLoading(false); return; }
      const entry  = { symbol: fullSym, name: sym };
      const newList = [...futuresList, entry];
      setFuturesList(newList);
      saveFuturesList(newList);
      setAddFuturesInput("");
      const price  = data.price as number;
      const prev   = data.previousClose as number | null;
      const change = price && prev ? ((price - prev) / prev) * 100 : null;
      setFutures((f) => [...f, { symbol: fullSym, name: sym, price, change, signal: null, confidence: null, trade: null, sparkline: null, loading: false }]);
      // Kick off AI signal
      if (price && prev) {
        try {
          const ar = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: fullSym, price, previousClose: prev, open: data.open, high: data.high, low: data.low, dayChangePercent: change, quick: true }) });
          const analysis = await ar.json();
          const signal: "BUY" | "HOLD" | "SELL" | null      = analysis?.signal     ?? null;
          const confidence: "High" | "Medium" | "Low" | null = analysis?.confidence ?? null;
          const trade: TradeLevels | null                     = analysis?.trade      ?? null;
          setFutures((f) => f.map((c) => c.symbol === fullSym ? { ...c, signal, confidence, trade } : c));
        } catch { /* best-effort */ }
      }
    } catch {
      setAddFuturesError("Network error — try again");
    } finally { setAddFuturesLoading(false); }
  }

  function removeFuture(symbol: string) {
    const newList = futuresList.filter((f) => f.symbol !== symbol);
    setFuturesList(newList);
    saveFuturesList(newList);
    setFutures((f) => f.filter((c) => c.symbol !== symbol));
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <OnboardingModal />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 overflow-y-auto !pb-36 page-enter">
          <div className="max-w-7xl mx-auto w-full">

            {/* ── PAGE HEADER ── */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="reveal text-2xl font-black tracking-tight text-gradient-green">Dashboard</h1>
                <MarketStatus />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#13112A] border border-[#252345]">
                <span className="ping-live w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-mono text-[#4B5675]">Live · refreshes in <span className="text-emerald-400 font-bold">{refreshCountdown}s</span></span>
              </div>
              {notifPermission === "default" && (
                <button type="button" onClick={requestNotifications}
                  className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2 rounded-xl text-sm font-medium transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Enable Signal Alerts
                </button>
              )}
              {notifPermission === "granted" && (
                <button
                  type="button"
                  onClick={toggleAlertPause}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    alertsPaused
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  }`}
                >
                  {alertsPaused ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Resume Alerts
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause Alerts
                    </>
                  )}
                </button>
              )}
              {notifPermission === "denied" && (
                <span className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1.5 rounded-xl text-xs font-medium">Alerts Blocked</span>
              )}
            </div>
            </div>

            {/* ── BENTO GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Morning Brief — full width */}
            <div className="lg:col-span-3">
              <div
                className="reveal flex items-center gap-4 bg-gradient-to-r from-emerald-600/10 to-teal-600/10 border border-emerald-500/20 rounded-2xl px-5 py-4 cursor-pointer hover:border-emerald-500/40 transition-all group"
                onClick={() => window.dispatchEvent(new Event("traxora-show-briefing"))}
              >
                <div className="hover-float w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/25 transition-colors">
                  <span className="text-xl">🌅</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#F1F5F9]">Today's Market Brief</p>
                  <p className="text-xs text-[#4B5675] mt-0.5">Full AI briefing — macro, top plays, options setups &amp; risk levels</p>
                </div>
                <span className="text-xs text-emerald-400 font-semibold shrink-0 group-hover:text-emerald-300 transition-colors">Open →</span>
              </div>
            </div>

            {/* Stats — full width */}
            <div className="lg:col-span-3">
            <div className="reveal stagger-container grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Sentiment card */}
              <div className="glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
                <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">Sentiment</p>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 mt-2">
                    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span className="text-sm text-[#4B5675] animate-pulse">Analyzing…</span>
                  </div>
                ) : (
                  <p className={`num-reveal text-2xl font-bold mt-2 font-mono ${sentiment === "Bullish" ? "text-emerald-400" : sentiment === "Bearish" ? "text-rose-400" : "text-amber-400"}`}>
                    {sentiment}
                  </p>
                )}
              </div>
              {[
                { label: "Buy Signals",  value: buyCount.toString(),  color: "text-emerald-400" },
                { label: "Hold Signals", value: holdCount.toString(), color: "text-amber-400" },
                { label: "Sell Signals", value: sellCount.toString(), color: "text-rose-400" },
              ].map((s) => (
                <div key={s.label} className="card-shine card-hover-lift glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
                  <p className="text-xs text-[#4B5675] font-medium uppercase tracking-wider">{s.label}</p>
                  <p className={`num-reveal text-2xl font-bold mt-2 font-mono ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            </div>{/* /Stats col-span-3 */}

            {/* Watchlist — 2/3 */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Watchlist</h2>
                  <span className="text-[10px] font-mono text-[#333368]">
                    {displayStocks.length}
                    {trendingStocks.length > 0 && <span className="text-teal-400/70"> +{trendingStocks.length}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditMode((v) => !v); setAddInput(""); setAddError(null); }}
                    className={`text-xs font-medium transition-colors ${editMode ? "text-amber-400 hover:text-amber-300" : "text-[#4B5675] hover:text-[#94A3B8]"}`}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                  <Link href="/explore" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium">All →</Link>
                </div>
              </div>

              {editMode && (
                <div className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addInput}
                      onChange={(e) => { setAddInput(e.target.value.toUpperCase()); setAddError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") addTicker(); }}
                      placeholder="Add ticker — AAPL, SPY, BTC-USD…"
                      className="flex-1 bg-[#13112A] border border-[#252345] focus:border-[#333368] rounded-xl px-4 py-2.5 text-sm text-[#F1F5F9] placeholder:text-[#4B5675] outline-none transition-colors font-mono"
                      disabled={addLoading}
                    />
                    <button
                      type="button"
                      onClick={addTicker}
                      disabled={addLoading || !addInput.trim()}
                      className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                    >
                      {addLoading ? (
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      )}
                      Add
                    </button>
                  </div>
                  {addError && <p className="text-[11px] text-rose-400 mt-1.5 ml-1">{addError}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] gap-3">
                {displayStocks.map((stock) => {
                  const hasPopped = poppedSymbols.has(stock.symbol);
                  const animClass = stock.isNew
                    ? "animate-stock-arrive"
                    : hasPopped
                    ? "animate-stock-pop"
                    : "";
                  const cardBody = (
                    <>
                      {editMode && !stock.isNew && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeTicker(stock.symbol); }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center transition-colors z-10 text-[11px] font-bold shadow-lg leading-none"
                        >
                          ×
                        </button>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold tracking-tight">{stock.symbol.replace(".US","").replace(".COMM","")}</p>
                            {stock.isNew && (
                              <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20">TRENDING</span>
                            )}
                          </div>
                          <p className="text-xs text-[#4B5675] mt-0.5 truncate max-w-[130px]">{stock.name}</p>
                        </div>
                        {stock.loading
                          ? <span className="text-xs text-[#4B5675] animate-pulse">…</span>
                          : stock.signal
                          ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`signal-pop text-[11px] font-bold px-2 py-0.5 rounded-lg border ${signalBadge(stock.signal)}`}>{stock.signal}</span>
                              {stock.confidence && (
                                <span className={`text-[9px] font-semibold ${stock.confidence === "High" ? "text-emerald-400" : stock.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>
                                  {stock.confidence}
                                </span>
                              )}
                            </div>
                          )
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-[#1A1838] text-[#4B5675] border-[#252345]">—</span>
                        }
                      </div>
                      <p className={`num-reveal text-xl font-bold font-mono ${stock.change !== null && stock.change >= 0 ? "price-glow-up" : stock.change !== null ? "price-glow-down" : changeColor(stock.change)}`}>
                        {stock.price !== null ? `$${stock.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                      </p>
                      <div className="flex items-end justify-between mt-1">
                        <p className={`text-xs font-medium font-mono ${changeColor(stock.change)}`}>
                          {stock.change !== null ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% today` : "—"}
                        </p>
                        {stock.sparkline && (
                          <Sparkline closes={stock.sparkline} positive={(stock.change ?? 0) >= 0} />
                        )}
                      </div>

                      {stock.trade && stock.signal !== "HOLD" ? (
                        <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${stock.signal === "BUY" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                          <div className="data-row flex items-center justify-between gap-2 px-1 py-0.5">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Entry</span>
                            <span className="text-[10px] font-mono font-bold text-amber-400 text-right">{stock.trade.entryZone}</span>
                          </div>
                          <div className="data-row flex items-center justify-between gap-2 px-1 py-0.5">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Stop</span>
                            <span className="text-[10px] font-mono font-bold text-rose-400">{stock.trade.stopLoss}</span>
                          </div>
                          <div className="data-row flex items-center justify-between gap-2 px-1 py-0.5">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">Target</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-400">{stock.trade.takeProfit}</span>
                          </div>
                          <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5 leading-snug">{stock.trade.rrRatio} R:R · {stock.trade.entryReason}</p>
                        </div>
                      ) : stock.signal === "HOLD" ? (
                        <p className="text-[10px] text-[#4B5675] mt-3">No clear setup — wait for direction</p>
                      ) : null}

                      {stock.earningsDate && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-1.5 py-px rounded-md border ${
                            stock.earningsDate.includes("Tomorrow") || stock.earningsDate.includes("in 1d") || stock.earningsDate.includes("in 2d") || stock.earningsDate.includes("in 3d")
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : stock.earningsDate.includes("in ")
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-[#1A1838] text-[#4B5675] border-[#252345]"
                          }`}>
                            {stock.earningsDate}
                          </span>
                        </div>
                      )}
                      {!editMode && (
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Link href={`/analysis?symbol=${encodeURIComponent(stock.isNew ? stock.symbol + ".US" : stock.symbol)}`} onClick={(e) => { e.stopPropagation(); haptic.tap(); }} className="glow-green text-[11px] text-emerald-400 font-medium">Analyse →</Link>
                            {(stock.signal === "BUY" || stock.signal === "SELL") && stock.price && (
                              <Link
                                href={`/paper?symbol=${encodeURIComponent(stock.symbol)}&direction=${stock.signal === "BUY" ? "LONG" : "SHORT"}&price=${stock.price.toFixed(2)}`}
                                onClick={(e) => { e.stopPropagation(); haptic.medium(); }}
                                className="text-[11px] text-violet-400 hover:text-violet-300 font-medium transition-colors"
                              >
                                Trade →
                              </Link>
                            )}
                            {(stock.signal === "BUY" || stock.signal === "SELL") && stock.trade && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); haptic.medium(); copyClaudePrompt(stock); }}
                                title="Copy a trade instruction to paste into Claude Code for Robinhood execution"
                                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
                              >
                                {copiedSymbol === stock.symbol ? "Copied!" : "Send to Claude →"}
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); haptic.light(); openAlertForm(stock.symbol); }}
                            title="Set price alert"
                            className={`press-scale p-1 rounded-lg transition-colors ${priceAlerts[stock.symbol]?.above != null || priceAlerts[stock.symbol]?.below != null ? "text-amber-400 hover:text-amber-300" : "text-[#4B5675] hover:text-[#94A3B8]"}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            </svg>
                          </button>
                        </div>
                      )}
                      {!editMode && alertForm === stock.symbol && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 bg-[#0D0B1A] border border-[#252345] rounded-xl p-3 space-y-2"
                        >
                          <p className="text-[9px] font-semibold uppercase tracking-widest text-[#4B5675]">Price Alert</p>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[9px] text-[#4B5675] block mb-0.5">Above $</label>
                              <input
                                type="number"
                                value={alertAbove}
                                onChange={(e) => setAlertAbove(e.target.value)}
                                placeholder="—"
                                className="w-full bg-[#13112A] border border-[#252345] rounded-lg px-2 py-1 text-xs font-mono text-[#F1F5F9] outline-none focus:border-[#333368]"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[9px] text-[#4B5675] block mb-0.5">Below $</label>
                              <input
                                type="number"
                                value={alertBelow}
                                onChange={(e) => setAlertBelow(e.target.value)}
                                placeholder="—"
                                className="w-full bg-[#13112A] border border-[#252345] rounded-lg px-2 py-1 text-xs font-mono text-[#F1F5F9] outline-none focus:border-[#333368]"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => saveAlert(stock.symbol)} className="flex-1 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors">Save</button>
                            {(priceAlerts[stock.symbol]?.above != null || priceAlerts[stock.symbol]?.below != null) && (
                              <button type="button" onClick={() => clearAlert(stock.symbol)} className="flex-1 py-1 rounded-lg text-[10px] font-bold bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 transition-colors">Clear</button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );

                  const signalGlow = stock.signal === "BUY" ? "signal-card-buy" : stock.signal === "SELL" ? "signal-card-sell" : "";
                  const idx = displayStocks.indexOf(stock);
                  const staggerClass = !animClass ? `card-stagger card-stagger-${Math.min(idx + 1, 12)}` : animClass;
                  const sharedClass = `${signalGlow} relative group bg-[#13112A] rounded-2xl p-4 border border-l-2 border-[#252345] ${signalBorder(stock.signal)} ${staggerClass} transition-colors hover:border-[#333368]`;
                  const analysisHref = `/analysis?symbol=${encodeURIComponent(stock.isNew ? stock.symbol + ".US" : stock.symbol)}`;

                  return (
                    <div
                      key={stock.symbol}
                      className={`${sharedClass} ${!editMode ? "card-tappable cursor-pointer" : ""}`}
                      onClick={!editMode ? () => router.push(analysisHref) : undefined}
                    >
                      {cardBody}
                    </div>
                  );
                })}
              </div>
            </div>{/* /watchlist lg:col-span-2 */}

            {/* Right sidebar — 1/3 */}
            <div className="lg:col-span-1 flex flex-col gap-3">

              {/* Sentiment */}
              <SentimentWidget />

              {/* Paper Portfolio */}
              <Link href="/paper" className="block group">
                <div className="card-shine card-premium surface-sheen rounded-2xl px-4 py-4 transition-all hover:border-emerald-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[#F1F5F9]">Paper Portfolio</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${paperStats.realizedPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                      {paperStats.realizedPL >= 0 ? "+" : ""}{paperStats.realizedPL.toFixed(2)} P&amp;L
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Value",      value: `$${paperStats.accountValue.toFixed(0)}`,                                                                                    color: "text-[#F1F5F9]" },
                      { label: "Realized",   value: `${paperStats.realizedPL >= 0 ? "+" : ""}$${paperStats.realizedPL.toFixed(2)}`,                                             color: paperStats.realizedPL >= 0 ? "text-emerald-400" : "text-rose-400" },
                      { label: "Open",       value: paperStats.openCount.toString(),                                                                                              color: "text-[#F1F5F9]" },
                      { label: "Win Rate",   value: paperStats.winRate != null ? `${paperStats.winRate}%` : "—",                                                                 color: paperStats.winRate != null ? (paperStats.winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#7B8DB4]" },
                    ].map((s) => (
                      <div key={s.label}>
                        <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-0.5">{s.label}</p>
                        <p className={`num-reveal text-base font-black font-mono tabular-nums ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-emerald-400 group-hover:text-emerald-300 font-medium transition-colors mt-3">View trades →</p>
                </div>
              </Link>

              {/* Signal Track Record */}
              <SignalPerformance />

              {/* Earnings compact */}
              {(() => {
                const upcoming = displayStocks
                  .filter(s => s.earningsDate && !s.earningsDate.includes("—"))
                  .sort((a, b) => {
                    const order = (d: string) =>
                      d.includes("Tomorrow") ? 0 :
                      d.includes("in 1d") || d.includes("in 2d") || d.includes("in 3d") ? 1 :
                      d.includes("in ") ? 2 : 3;
                    return order(a.earningsDate!) - order(b.earningsDate!);
                  })
                  .slice(0, 5);
                if (upcoming.length === 0) return null;
                return (
                  <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Earnings</h2>
                      <span className="text-[10px] text-[#333368] font-mono">{upcoming.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {upcoming.map(s => (
                        <div key={s.symbol}
                          className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0D0B1A] rounded-xl cursor-pointer hover:bg-[#1A1838] transition-colors"
                          onClick={() => window.location.href = `/analysis?symbol=${encodeURIComponent(s.symbol)}`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold font-mono text-[#F1F5F9]">{s.symbol.replace(".US","").replace(".COMM","")}</p>
                            <p className="text-[10px] text-[#4B5675] truncate">{s.name}</p>
                          </div>
                          <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                            s.earningsDate!.includes("Tomorrow") || s.earningsDate!.includes("in 1d") || s.earningsDate!.includes("in 2d") || s.earningsDate!.includes("in 3d")
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>{s.earningsDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>{/* /right sidebar */}

            {/* Futures — full width */}
            <div className="lg:col-span-3">
            <section>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Futures</h2>
                <span className="text-[10px] font-mono text-[#333368]">{futures.length}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setEditFutures((v) => !v); setAddFuturesInput(""); setAddFuturesError(null); }}
                  className={`text-xs font-medium transition-colors ${editFutures ? "text-amber-400 hover:text-amber-300" : "text-[#4B5675] hover:text-[#94A3B8]"}`}
                >
                  {editFutures ? "Done" : "Edit"}
                </button>
              </div>
            </div>

            {editFutures && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addFuturesInput}
                    onChange={(e) => { setAddFuturesInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setAddFuturesError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") addFuture(); }}
                    placeholder="Add futures root — ES, GC, CL, ZN, HG, PL…"
                    className="flex-1 bg-[#13112A] border border-[#252345] focus:border-[#333368] rounded-xl px-4 py-2.5 text-sm text-[#F1F5F9] placeholder:text-[#4B5675] outline-none transition-colors font-mono"
                    disabled={addFuturesLoading}
                  />
                  <button
                    type="button"
                    onClick={addFuture}
                    disabled={addFuturesLoading || !addFuturesInput.trim()}
                    className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  >
                    {addFuturesLoading
                      ? <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    }
                    Add
                  </button>
                </div>
                {addFuturesError && <p className="text-[11px] text-rose-400 mt-1.5 ml-1">{addFuturesError}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-3">
              {futures.map((f) => {
                const analysisHref = `/analysis?symbol=${encodeURIComponent(f.symbol)}`;
                return (
                  <div
                    key={f.symbol}
                    className={`relative group bg-[#13112A] rounded-2xl p-4 border border-l-2 border-[#252345] ${signalBorder(f.signal)} ${!editFutures ? "cursor-pointer hover:border-[#333368] hover:bg-[#1A1838] transition-colors" : ""}`}
                    onClick={!editFutures ? () => router.push(analysisHref) : undefined}
                  >
                    {editFutures && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFuture(f.symbol); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center transition-colors z-10 text-[11px] font-bold shadow-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold tracking-tight">{f.symbol.replace(".COMM", "")}</p>
                          <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">FUT</span>
                        </div>
                        <p className="text-xs text-[#4B5675] mt-0.5 truncate max-w-[130px]">{f.name}</p>
                      </div>
                      {f.loading
                        ? <span className="text-xs text-[#4B5675] animate-pulse">…</span>
                        : f.signal
                        ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${signalBadge(f.signal)}`}>{f.signal}</span>
                            {f.confidence && (
                              <span className={`text-[9px] font-semibold ${f.confidence === "High" ? "text-emerald-400" : f.confidence === "Medium" ? "text-amber-400" : "text-[#4B5675]"}`}>
                                {f.confidence}
                              </span>
                            )}
                          </div>
                        )
                        : <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-[#1A1838] text-[#4B5675] border-[#252345]">—</span>
                      }
                    </div>
                    {/* Price */}
                    <p className={`text-xl font-bold font-mono ${changeColor(f.change)}`}>
                      {f.price !== null ? `$${f.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                    </p>
                    <div className="flex items-end justify-between mt-1">
                      <p className={`text-xs font-medium font-mono ${changeColor(f.change)}`}>
                        {f.change !== null ? `${f.change >= 0 ? "+" : ""}${f.change.toFixed(2)}% today` : "—"}
                      </p>
                      {f.sparkline && <Sparkline closes={f.sparkline} positive={(f.change ?? 0) >= 0} />}
                    </div>
                    {/* Trade plan */}
                    {f.trade && f.signal !== "HOLD" ? (
                      <div className={`mt-3 rounded-xl p-2.5 space-y-1.5 border ${f.signal === "BUY" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                        {[
                          { label: "Entry", value: f.trade.entryZone, color: "text-amber-400" },
                          { label: "Stop",  value: f.trade.stopLoss,  color: "text-rose-400"  },
                          { label: "Target",value: f.trade.takeProfit,color: "text-emerald-400"},
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex items-center justify-between gap-2">
                            <span className="text-[8px] text-[#4B5675] uppercase tracking-widest shrink-0">{label}</span>
                            <span className={`text-[10px] font-mono font-bold ${color} text-right`}>{value}</span>
                          </div>
                        ))}
                        <p className="text-[8px] text-[#4B5675] pt-0.5 border-t border-white/5 leading-snug">{f.trade.rrRatio} R:R · {f.trade.entryReason}</p>
                      </div>
                    ) : f.signal === "HOLD" ? (
                      <p className="text-[10px] text-[#4B5675] mt-3">No clear setup — wait for direction</p>
                    ) : null}
                    {/* Footer link */}
                    {!editFutures && (
                      <div className="mt-3 flex items-center gap-3">
                        <Link
                          href={analysisHref}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                        >
                          Analyse →
                        </Link>
                        {(f.signal === "BUY" || f.signal === "SELL") && f.trade && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); haptic.medium(); copyClaudePrompt(f); }}
                            title="Copy a trade instruction to paste into Claude Code for Robinhood execution"
                            className="text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
                          >
                            {copiedSymbol === f.symbol ? "Copied!" : "Send to Claude →"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          </div>{/* /futures lg:col-span-3 */}

          {/* Options Plays — full width */}
          <div className="lg:col-span-3">
            <OptionsPlaysSection />
          </div>

          {/* Risk Rules + Exchange CTA — full width */}
          <div className="lg:col-span-3">
          <section>
            {/* Risk rules */}
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5 mb-6">
              <p className="text-sm font-semibold mb-4 text-center">5 rules to protect your money</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: "💰", rule: "Never risk more than 5–10% per trade", detail: "If you have $500, max $25–$50 per signal." },
                  { icon: "🛡️", rule: "Always set a stop-loss", detail: "4–5% below your buy price on Robinhood. Non-negotiable." },
                  { icon: "🧠", rule: "Understand before you act", detail: "Read the market analysis. Know why the signal fired." },
                  { icon: "⏳", rule: "Patience beats FOMO", detail: "Not every signal is worth taking. Wait for high confidence." },
                  { icon: "📓", rule: "Keep a trade journal", detail: "Note why you entered, what happened, what you learned." },
                  { icon: "⚠️", rule: "AI is not 100% right", detail: "No tool is. This is a starting point, not a guarantee." },
                ].map((r) => (
                  <div key={r.rule} className="flex gap-3 bg-[#0D0B1A] border border-[#252345] rounded-xl p-3">
                    <span className="text-base shrink-0">{r.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-[#F1F5F9]">{r.rule}</p>
                      <p className="text-[11px] text-[#4B5675] mt-0.5">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exchange CTA */}
            <div className="mt-4 rounded-2xl border border-[#252345] bg-gradient-to-r from-emerald-600/10 to-teal-600/10 p-6 flex flex-col items-center gap-4 text-center">
              <div>
                <h3 className="font-semibold">Explore all exchanges</h3>
                <p className="text-sm text-[#7B8DB4] mt-1">CBOE, CBOT, CME, KCBT, MGE, NYBOT &amp; NYMEX — instant AI analysis on every contract.</p>
              </div>
              <Link href="/explore" className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-semibold text-white">
                Open Explorer
              </Link>
            </div>
          </section>
          </div>{/* /risk rules lg:col-span-3 */}

            </div>{/* /bento grid */}
          </div>{/* /max-w-7xl */}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PaywallGuard>
      <DashboardContent />
    </PaywallGuard>
  );
}
