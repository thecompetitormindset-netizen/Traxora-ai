"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PaywallGuard from "../components/PaywallGuard";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import SentimentWidget from "../components/SentimentWidget";
import DiscoverSection from "../components/DiscoverSection";
import OnboardingModal from "../components/OnboardingModal";
import { scopedKey } from "../lib/userState";
import { getSignalCache, setSignalCache } from "../lib/signalCache";
import { haptic } from "../lib/haptics";
import { signalBadgeCls } from "../lib/signalBadge";
import { loadTrades, STARTING_CAPITAL, calcPL } from "../lib/paperTrades";
import type { PaperTrade } from "../lib/paperTrades";
import { OptionsAttentionView } from "../components/fieldnotes/OptionsAttention";
import { useOptionsList } from "../components/fieldnotes/useOptionsList";
import OverviewHeader from "../components/OverviewHeader";
import { syncFetch } from "../lib/syncFetch";

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
  const uid   = useId().replace(/:/g, "");
  if (closes.length < 2) return null;
  const min   = Math.min(...closes);
  const max   = Math.max(...closes);
  const range = max - min || 1;
  const w = 56, h = 22;
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = h - 2 - ((c - min) / range) * (h - 4);
    return `${x},${y}`;
  });
  const ptsStr     = pts.join(" ");
  const color      = positive ? "#34D399" : "#F87171";
  const gradId     = `dash-spark-${uid}`;
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
const ACCOUNT_KEY = "traxora_planner_account";
const TAKEN_KEY   = "traxora_taken_trades";
const PAPER_START = 100_000;

// Trades taken on the /paper page — a separate store from paper_portfolio_v2,
// synced to Supabase via /api/paper-trades. The portfolio card must reflect
// both systems or trades closed on /paper never show up here.
type TakenTradeLite = {
  signal:      "BUY" | "SELL";
  entry:       number;
  shares:      number;
  status?:     string;
  closePrice?: number;
  closedAt?:   number;
  potential?:  number;
  riskDollar?: number;
};

function takenTradePL(t: TakenTradeLite): number {
  // Mirrors the /paper page: no close price recorded → assume stop/target fill
  if (t.closePrice == null) return t.status === "WIN" ? (t.potential ?? 0) : -(t.riskDollar ?? 0);
  return (t.signal === "BUY" ? 1 : -1) * (t.closePrice - t.entry) * t.shares;
}

function loadTakenTrades(key: string): TakenTradeLite[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as TakenTradeLite[]; }
  catch { return []; }
}

type PaperStats = {
  accountValue: number;
  realizedPL:   number;
  openCount:    number;
  closedCount:  number;
  winRate:      number | null;
};

function loadPaperStats(storageKey: string, accountKey: string): PaperStats {
  let startBalance = PAPER_START;
  try {
    const acct = JSON.parse(localStorage.getItem(accountKey) ?? "null") as { size: number } | null;
    if (acct?.size && acct.size > 0) startBalance = acct.size;
  } catch { /* ignore */ }

  const empty: PaperStats = { accountValue: startBalance, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null };
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
      accountValue: startBalance + realizedPL,
      realizedPL,
      openCount:   open.length,
      closedCount: closed.length,
      winRate:     closed.length > 0 ? Math.round((wins / closed.length) * 100) : null,
    };
  } catch { return empty; }
}

// ── Top Options Plays ────────────────────────────────────────────────────────

// ── Value Picks Dashboard Section ────────────────────────────────────────────

type DashValueStock = {
  symbol: string; name: string; price: number | null; changePct: number | null;
  pe: number | null; forwardPe: number | null; pb: number | null;
  divYield: number | null; marketCap: number | null; sector: string | null;
  score: number; isDip: boolean;
};

function ValueStockCard({ s }: { s: DashValueStock }) {
  const up = (s.changePct ?? 0) >= 0;
  const fullSym = s.symbol.includes(".") ? s.symbol : `${s.symbol}.US`;
  const [watched, setWatched] = useState(() =>
    typeof window !== "undefined" && loadCustomWatchlist().some(w => w.symbol === fullSym)
  );

  function toggleWatch(e: React.MouseEvent) {
    e.preventDefault();
    const wl = loadCustomWatchlist();
    if (watched) {
      saveCustomWatchlist(wl.filter(w => w.symbol !== fullSym));
    } else {
      saveCustomWatchlist([...wl, { symbol: fullSym, name: s.name }]);
    }
    setWatched(v => !v);
  }

  return (
    <div className={`bg-[#0D0B1A] rounded-xl border border-l-2 p-3.5 flex flex-col gap-2 hover:border-[#333368] transition-colors ${
      s.isDip ? "border-amber-500/20 border-l-amber-400" : "border-[#252345] border-l-sky-500/40"
    }`}>
      {/* Symbol row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-black font-mono text-sm text-[var(--text-primary,#F1F5F9)]">{s.symbol}</span>
            {s.isDip && (
              <span className="text-[8px] font-black px-1 py-px rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">DIP</span>
            )}
          </div>
          <p className="text-[9px] text-[#4B5675] truncate mt-px">{s.name}</p>
        </div>
        <div className="text-right shrink-0">
          {s.price !== null
            ? <>
                <p className="text-sm font-black font-mono text-[var(--text-primary,#F1F5F9)]">${s.price.toFixed(2)}</p>
                <p className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? "+" : ""}{(s.changePct ?? 0).toFixed(2)}%
                </p>
              </>
            : <p className="text-sm text-[#4B5675] animate-pulse">—</p>
          }
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-2 flex-wrap">
        {s.pe       !== null && <span className="text-[9px] font-mono text-[#4B5675]">P/E <span className="text-sky-400 font-bold">{s.pe}x</span></span>}
        {s.forwardPe !== null && <span className="text-[9px] font-mono text-[#4B5675]">Fwd <span className="text-sky-400 font-bold">{s.forwardPe}x</span></span>}
        {s.pb       !== null && <span className="text-[9px] font-mono text-[#4B5675]">P/B <span className="text-sky-400 font-bold">{s.pb}x</span></span>}
        {s.divYield !== null && s.divYield > 0 && <span className="text-[9px] font-mono text-[#4B5675]">Yield <span className="text-emerald-400 font-bold">{s.divYield.toFixed(1)}%</span></span>}
      </div>

      {/* Score dots */}
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`flex-1 h-1 rounded-full ${i < s.score ? "bg-sky-400" : "bg-[#252345]"}`} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1A1838]">
        <Link href={`/analysis?symbol=${encodeURIComponent(s.symbol + ".US")}`}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
          Analyse →
        </Link>
        <button type="button" onClick={toggleWatch}
          title={watched ? "Remove from watchlist" : "Add to watchlist"}
          className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-colors ${
            watched
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20"
              : "bg-[#1A1838] text-[#4B5675] border-[#252345] hover:text-emerald-400 hover:border-emerald-500/30"
          }`}>
          {watched ? "★ Watching" : "☆ Watch"}
        </button>
      </div>
    </div>
  );
}

function ValuePicksSection() {
  const [valuePicks, setValuePicks] = useState<DashValueStock[]>([]);
  const [dipAlerts,  setDipAlerts]  = useState<DashValueStock[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showAllVal, setShowAllVal] = useState(false);
  const [showAllDip, setShowAllDip] = useState(false);

  const [scanEmpty, setScanEmpty] = useState(false);

  useEffect(() => {
    fetch("/api/market/value-scan", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { valuePicks?: DashValueStock[]; dipAlerts?: DashValueStock[]; scanned?: number } | null) => {
        if (!d) { setScanEmpty(true); return; }
        setValuePicks(d.valuePicks ?? []);
        setDipAlerts(d.dipAlerts  ?? []);
        // scanned === 0 means every screener source failed — not "still running"
        if ((d.scanned ?? 0) === 0) setScanEmpty(true);
      })
      .catch(() => setScanEmpty(true))
      .finally(() => setLoading(false));
  }, []);

  const skeletons = Array.from({ length: 6 });
  const visibleVal = showAllVal ? valuePicks : valuePicks.slice(0, 6);
  const visibleDip = showAllDip ? dipAlerts  : dipAlerts.slice(0, 6);

  return (
    <div className="lg:col-span-3 space-y-5">

      {/* ── Dip Alerts ── */}
      {(loading || dipAlerts.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Buy the Dip</h2>
              {!loading && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse">{dipAlerts.length} today</span>}
            </div>
            {dipAlerts.length > 6 && (
              <button type="button" onClick={() => setShowAllDip(v => !v)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors">
                {showAllDip ? "Show less ↑" : `See all ${dipAlerts.length} ↓`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
            {loading
              ? skeletons.map((_, i) => <div key={i} className="h-32 bg-[#13112A] rounded-xl border border-[#252345] animate-pulse" />)
              : visibleDip.map(s => <ValueStockCard key={s.symbol} s={s} />)
            }
          </div>
        </div>
      )}

      {/* ── Value Picks ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">Undervalued Picks</h2>
            {!loading && valuePicks.length > 0 && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{valuePicks.length} found</span>
            )}
          </div>
          {valuePicks.length > 6 && (
            <button type="button" onClick={() => setShowAllVal(v => !v)}
              className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold transition-colors">
              {showAllVal ? "Show less ↑" : `See all ${valuePicks.length} ↓`}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {loading
            ? skeletons.map((_, i) => <div key={i} className="h-32 bg-[#13112A] rounded-xl border border-[#252345] animate-pulse" />)
            : visibleVal.length > 0
            ? visibleVal.map(s => <ValueStockCard key={s.symbol} s={s} />)
            : <p className="col-span-full text-xs text-[#4B5675] py-4 text-center">
                {scanEmpty
                  ? "Value screener sources are unreachable right now — Yahoo may be rate-limiting and the EODHD screener add-on may not be active on your plan."
                  : "Screener running — check back in a moment"}
              </p>
          }
        </div>
        <p className="text-[9px] text-[#333368] mt-2">Scanned from a 42-stock value universe (Finnhub + Yahoo data) · not financial advice · refreshes every 30 min</p>
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const optionsList = useOptionsList();
  const [paperStats, setPaperStats] = useState<PaperStats>({
    accountValue: PAPER_START, realizedPL: 0, openCount: 0, closedCount: 0, winRate: null,
  });
  const [portfolioTrades, setPortfolioTrades] = useState<PaperTrade[]>([]);
  const [takenTrades, setTakenTrades]         = useState<TakenTradeLite[]>([]);

  const [watchlist, setWatchlist]           = useState<Array<{ symbol: string; name: string }>>(() =>
    typeof window !== "undefined" ? loadCustomWatchlist() : DEFAULT_WATCHLIST
  );
  const watchlistInitialized                = useRef(false);
  const [editMode, setEditMode]             = useState(false);
  const [addInput, setAddInput]             = useState("");
  const [addLoading, setAddLoading]         = useState(false);
  const [addError, setAddError]             = useState<string | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const [stocks, setStocks]                 = useState<StockCard[]>(() => {
    const wl = typeof window !== "undefined" ? loadCustomWatchlist() : DEFAULT_WATCHLIST;
    return wl.map((w) => ({ ...w, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, earningsDate: null, loading: true }));
  });
  const [trendingStocks, setTrendingStocks] = useState<StockCard[]>([]);
  const [poppedSymbols, setPoppedSymbols]   = useState<Set<string>>(new Set());
  const [priceAlerts, setPriceAlerts]       = useState<AlertMap>(() => typeof window !== "undefined" ? loadAlerts() : {});
  const [copiedSymbol, setCopiedSymbol]     = useState<string | null>(null); // symbol whose Claude prompt was just copied
  const [alertForm, setAlertForm]           = useState<string | null>(null); // symbol whose form is open
  const [alertAbove, setAlertAbove]         = useState("");
  const [alertBelow, setAlertBelow]         = useState("");
  const [futuresList, setFuturesList]         = useState<Array<{ symbol: string; name: string }>>(() =>
    typeof window !== "undefined" ? loadFuturesList() : DEFAULT_FUTURES_LIST
  );
  const [futures, setFutures]                 = useState<FuturesCard[]>(() => {
    const fl = typeof window !== "undefined" ? loadFuturesList() : DEFAULT_FUTURES_LIST;
    return fl.map((f) => ({ ...f, price: null, change: null, signal: null, confidence: null, trade: null, sparkline: null, loading: true }));
  });
  const [editFutures, setEditFutures]         = useState(false);
  const [addFuturesInput, setAddFuturesInput] = useState("");
  const [addFuturesLoading, setAddFuturesLoading] = useState(false);
  const [addFuturesError, setAddFuturesError] = useState<string | null>(null);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [alertsPaused, setAlertsPaused] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(scopedKey("traxora_alerts_paused")) === "true"
  );
  const [showAllStocks, setShowAllStocks] = useState(false);
  const [showAllFutures, setShowAllFutures] = useState(false);

  useEffect(() => {
    const key      = scopedKey(PAPER_KEY);
    const acctKey  = scopedKey(ACCOUNT_KEY);
    const takenKey = scopedKey(TAKEN_KEY);
    const refresh = () => {
      setPaperStats(loadPaperStats(key, acctKey));
      setPortfolioTrades(loadTrades());
      setTakenTrades(loadTakenTrades(takenKey));
    };
    refresh();
    // Cross-device: trades taken on /paper sync through Supabase — pull them
    // so a trade closed on the phone shows up in this card on desktop too.
    syncFetch("/api/paper-trades")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { trades?: TakenTradeLite[] } | null) => {
        if (data && Array.isArray(data.trades) && data.trades.length > 0) {
          localStorage.setItem(takenKey, JSON.stringify(data.trades));
          setTakenTrades(data.trades);
        }
      })
      .catch(() => {});
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  // Fetch stocks + signals — hydrates from Supabase then fetches quotes
  useEffect(() => {
    let active = true;
    const wl = watchlist;

    // Pull from Supabase in background — overrides localStorage if server has different data
    syncFetch("/api/user/watchlist")
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

    // Start fetching quotes
    wl.forEach(async ({ symbol, name }) => {
      try {
        const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        const price  = data?.price ?? null;
        const prev   = data?.previousClose ?? null;
        const change = price && prev ? ((price - prev) / prev) * 100 : null;
        setStocks((s) => s.map((c) => c.symbol === symbol ? { ...c, price, change, loading: false } : c));
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
      syncFetch("/api/user/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: watchlist }),
      }).catch(() => { /* best-effort */ });
    }, 800);
    return () => clearTimeout(id);
  }, [watchlist]);

  // Load futures list from localStorage on mount + fetch quotes + AI signals
  useEffect(() => {
    const fl = futuresList;

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
  }, [watchlist]);

  // Countdown timer — fires refreshPrices when it hits 0, then resets to 60
  const refreshPricesRef = useRef(refreshPrices);
  useEffect(() => { refreshPricesRef.current = refreshPrices; }, [refreshPrices]);

  useEffect(() => {
    const tick = setInterval(() => {
      setRefreshCountdown(c => {
        if (c <= 1) {
          refreshPricesRef.current();
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => { clearInterval(tick); setRefreshCountdown(60); };
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
        <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 lg:p-6 xl:p-8 overflow-y-auto !pb-36 page-enter">
          <div className="max-w-7xl mx-auto w-full">

            <OverviewHeader
              options={optionsList.state}
              watchCount={watchlist.length}
              watchSignals={stocks.filter(c => (c.signal === "BUY" || c.signal === "SELL") && c.confidence === "High").length}
              paperOpen={paperStats.openCount}
              paperValue={paperStats.accountValue}
              refreshIn={refreshCountdown}
              actions={<>
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
                <span title="Browser notifications are blocked — enable them in your browser settings to receive alerts" className="flex items-center gap-2 bg-[#1A1838] border border-[#252345] text-[#4B5675] px-3 py-1.5 rounded-xl text-xs font-medium">Alerts blocked</span>
              )}
              </>}
            />

            {/* ── BENTO GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Options Plays — the app's primary focus, leads the dashboard right under the brief */}
            <div className="lg:col-span-3">
              <OptionsAttentionView state={optionsList.state} />
            </div>

            {/* Market Sentiment */}
            <div className="lg:col-span-3">
              <SentimentWidget horizontal />
            </div>

            {/* ── Section divider: Discover ── */}
            <div className="lg:col-span-3 flex items-center gap-4 pt-3 lg:pt-4">
              <div className="flex-1 h-px bg-[#252345]" />
              <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#333368]">Sports · Crypto · IPO</span>
              <div className="flex-1 h-px bg-[#252345]" />
            </div>

            {/* Discover — sports betting, crypto & IPO feature cards */}
            <div className="lg:col-span-3">
              <DiscoverSection />
            </div>

            {/* ── Section divider: Value ── */}
            <div className="lg:col-span-3 flex items-center gap-4 pt-3 lg:pt-4">
              <div className="flex-1 h-px bg-[#252345]" />
              <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#333368]">Undervalued</span>
              <div className="flex-1 h-px bg-[#252345]" />
            </div>

            {/* ── Value Picks ── */}
            <ValuePicksSection />

            {/* ── Section divider: Market ── */}
            <div className="lg:col-span-3 flex items-center gap-4 pt-3 lg:pt-4">
              <div className="flex-1 h-px bg-[#252345]" />
              <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#333368]">Market</span>
              <div className="flex-1 h-px bg-[#252345]" />
            </div>

            {/* Watchlist — full width */}
            <div id="watchlist" className="order-4 lg:order-none lg:col-span-3 scroll-mt-20">
              <div className="flex items-center justify-between gap-2 mb-4 lg:mb-6" data-tour="dashboard-watchlist">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h2 className="text-sm lg:text-base font-bold uppercase tracking-widest text-[#7B8DB4]">Market</h2>
                  <span className="text-[10px] font-mono text-[#333368]">
                    {displayStocks.length}
                    {trendingStocks.length > 0 && <span className="text-teal-400/70"> +{trendingStocks.length}</span>}
                  </span>
                  <div className="flex items-center gap-1.5 ml-1">
                    {[
                      { label: "BUY",  count: buyCount,  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                      { label: "HOLD", count: holdCount, cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
                      { label: "SELL", count: sellCount, cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
                    ].filter(s => s.count > 0).map(s => (
                      <span key={s.label} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border font-mono ${s.cls}`}>
                        {s.count} {s.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {displayStocks.length > 6 && (
                    <button type="button" onClick={() => setShowAllStocks(v => !v)} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium">
                      {showAllStocks ? "Show less ↑" : `See all ${displayStocks.length} ↓`}
                    </button>
                  )}
                  <button
                    type="button"
                    data-tour="watchlist-edit-btn"
                    onClick={() => { setEditMode((v) => !v); setAddInput(""); setAddError(null); }}
                    className={`text-xs font-medium transition-colors ${editMode ? "text-amber-400 hover:text-amber-300" : "text-[#4B5675] hover:text-[#94A3B8]"}`}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(showAllStocks ? displayStocks : displayStocks.slice(0, 6)).map((stock) => {
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
                          className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center transition-colors z-10 text-sm font-bold shadow-lg leading-none"
                        >
                          ×
                        </button>
                      )}
                      {/* Card header: symbol + signal */}
                      <div className="flex items-start justify-between mb-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-base font-black tracking-tight text-[#F1F5F9]">{stock.symbol.replace(".US","").replace(".COMM","")}</p>
                            {stock.isNew && (
                              <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20">TRENDING</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#4B5675] truncate max-w-[140px]">{stock.name}</p>
                        </div>
                        {stock.loading
                          ? <span className="text-xs text-[#4B5675] animate-pulse mt-0.5">…</span>
                          : stock.signal
                          ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`signal-pop text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${signalBadgeCls(stock.signal)}`}>{stock.signal}</span>
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

                      {/* Price + change */}
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="num-reveal text-2xl font-black font-mono leading-none text-[#F1F5F9]">
                            {stock.price !== null ? `$${stock.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                          </p>
                          <p className={`text-xs font-medium font-mono mt-0.5 ${changeColor(stock.change)}`}>
                            {stock.change !== null ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% today` : "—"}
                          </p>
                        </div>
                        {stock.sparkline && (
                          <Sparkline closes={stock.sparkline} positive={(stock.change ?? 0) >= 0} />
                        )}
                      </div>

                      {/* Trade plan — compact inline row matching futures style */}
                      {stock.trade && stock.signal !== "HOLD" ? (
                        <div className={`mt-2 rounded-lg px-2.5 py-2 border text-[10px] font-mono ${stock.signal === "BUY" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Ent</span>
                            <span className="font-bold text-amber-400">{stock.trade.entryZone}</span>
                            <span className="text-[#4B5675]">·</span>
                            <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Stp</span>
                            <span className="font-bold text-rose-400">{stock.trade.stopLoss}</span>
                            <span className="text-[#4B5675]">·</span>
                            <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Tgt</span>
                            <span className="font-bold text-emerald-400">{stock.trade.takeProfit}</span>
                            <span className="ml-auto text-[8px] text-[#4B5675]">{stock.trade.rrRatio}</span>
                          </div>
                        </div>
                      ) : stock.signal === "HOLD" ? (
                        <p className="text-[11px] text-[#4B5675] mt-2.5 italic">Wait for clearer structure</p>
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
                                href={`/paper?symbol=${encodeURIComponent(stock.symbol)}&side=${stock.signal}&price=${stock.price !== null ? stock.price.toFixed(2) : ""}${stock.trade ? `&stop=${encodeURIComponent(stock.trade.stopLoss)}&target=${encodeURIComponent(stock.trade.takeProfit)}` : ""}`}
                                onClick={(e) => { e.stopPropagation(); haptic.medium(); }}
                                className="text-[11px] text-[#4B5675] hover:text-[#94A3B8] font-medium transition-colors"
                              >
                                Trade →
                              </Link>
                            )}
                            {(stock.signal === "BUY" || stock.signal === "SELL") && stock.trade && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); haptic.medium(); copyClaudePrompt(stock); }}
                                title="Copy signal details (includes risk disclaimer) to paste into Claude"
                                className="text-[11px] text-[#4B5675] hover:text-[#94A3B8] font-medium transition-colors"
                              >
                                {copiedSymbol === stock.symbol ? "Copied!" : "Send to Claude →"}
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); haptic.light(); openAlertForm(stock.symbol); }}
                            title="Set price alert"
                            aria-label={`Set price alert for ${stock.symbol}`}
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
                  const sharedClass = `${signalGlow} relative group bg-[#13112A] rounded-2xl p-4 lg:p-5 border border-l-2 border-[#252345] ${signalBorder(stock.signal)} ${staggerClass} transition-colors hover:border-[#333368]`;
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
            </div>{/* /watchlist lg:col-span-3 */}

            {/* ── Section divider: Futures ── */}
            <div className="order-5 lg:order-none lg:col-span-3 flex items-center gap-4 pt-3 lg:pt-4">
              <div className="flex-1 h-px bg-[#252345]" />
              <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-[#333368]">Futures</span>
              <div className="flex-1 h-px bg-[#252345]" />
            </div>

            {/* Futures — full width */}
            <div className="order-5 lg:order-none lg:col-span-3">
            <section>
            <div className="flex items-center justify-between gap-2 mb-4 lg:mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-sm lg:text-base font-bold uppercase tracking-widest text-[#7B8DB4]">Futures</h2>
                <span className="text-[10px] font-mono text-[#333368]">{futures.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {futures.length > 6 && (
                  <button type="button" onClick={() => setShowAllFutures(v => !v)} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium">
                    {showAllFutures ? "Show less ↑" : `See all ${futures.length} ↓`}
                  </button>
                )}
                <Link href="/intelligence?section=futures" className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 transition-colors">View all →</Link>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(showAllFutures ? futures : futures.slice(0, 6)).map((f) => {
                const analysisHref = `/analysis?symbol=${encodeURIComponent(f.symbol)}`;
                return (
                  <div
                    key={f.symbol}
                    className={`relative group bg-[#13112A] rounded-2xl p-4 lg:p-5 border border-l-2 border-[#252345] ${signalBorder(f.signal)} ${!editFutures ? "cursor-pointer hover:border-[#333368] hover:bg-[#1A1838] transition-colors" : ""}`}
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
                    <div className="flex items-start justify-between mb-4 lg:mb-5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold lg:text-lg tracking-tight">{f.symbol.replace(".COMM", "")}</p>
                          <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">FUT</span>
                        </div>
                        <p className="text-xs text-[#4B5675] mt-0.5 truncate max-w-[130px] lg:max-w-[160px]">{f.name}</p>
                      </div>
                      {f.loading
                        ? <span className="text-xs text-[#4B5675] animate-pulse">…</span>
                        : f.signal
                        ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${signalBadgeCls(f.signal)}`}>{f.signal}</span>
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
                    <p className="text-xl lg:text-2xl font-bold font-mono text-[#F1F5F9]">
                      {f.price !== null ? `$${f.price.toFixed(2)}` : <span className="animate-pulse text-[#4B5675]">——</span>}
                    </p>
                    <div className="flex items-end justify-between mt-1">
                      <p className={`text-xs lg:text-sm font-medium font-mono ${changeColor(f.change)}`}>
                        {f.change !== null ? `${f.change >= 0 ? "+" : ""}${f.change.toFixed(2)}% today` : "—"}
                      </p>
                      {f.sparkline && <Sparkline closes={f.sparkline} positive={(f.change ?? 0) >= 0} />}
                    </div>
                    {/* Trade plan */}
                    {f.trade && f.signal !== "HOLD" ? (
                      <div className={`mt-2 rounded-lg px-2.5 py-2 border text-[10px] font-mono ${f.signal === "BUY" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-rose-500/5 border-rose-500/15"}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Ent</span>
                          <span className="font-bold text-amber-400">{f.trade.entryZone}</span>
                          <span className="text-[#1C1A3A] shrink-0">·</span>
                          <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Stp</span>
                          <span className="font-bold text-rose-400">{f.trade.stopLoss}</span>
                          <span className="text-[#1C1A3A] shrink-0">·</span>
                          <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Tgt</span>
                          <span className="font-bold text-emerald-400">{f.trade.takeProfit}</span>
                          <span className="ml-auto text-[8px] text-[#4B5675] shrink-0">{f.trade.rrRatio}</span>
                        </div>
                      </div>
                    ) : f.signal === "HOLD" ? (
                      <p className="text-[10px] text-[#4B5675] mt-2">Wait for clearer direction</p>
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
                            title="Copy signal details (includes risk disclaimer) to paste into Claude"
                            className="text-[11px] text-[#4B5675] hover:text-[#94A3B8] font-medium transition-colors"
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

            {/* ── PORTFOLIO HERO ── */}
            {(() => {
              // Merge closed trades from BOTH paper systems: the portfolio
              // store (paper_portfolio_v2) and trades closed on /paper.
              const closedA = portfolioTrades
                .filter(t => t.status === "CLOSED" && t.exitPrice != null && t.exitDate)
                .map(t => ({ time: new Date(t.exitDate!).getTime(), pl: calcPL(t, t.exitPrice!) }));
              const closedB = takenTrades
                .filter(t => t.status === "WIN" || t.status === "LOSS")
                .map(t => ({ time: t.closedAt ?? 0, pl: takenTradePL(t) }));
              const events = [...closedA, ...closedB].sort((a, b) => a.time - b.time);

              // Build equity curve: cumulative account value after each closed trade
              const curve: number[] = [STARTING_CAPITAL];
              let running = STARTING_CAPITAL;
              for (const e of events) {
                running += e.pl;
                curve.push(running);
              }

              const takenPL      = closedB.reduce((s, e) => s + e.pl, 0);
              const totalPL      = paperStats.realizedPL + takenPL;
              const accountValue = paperStats.accountValue + takenPL;
              const openCount    = paperStats.openCount + takenTrades.filter(t => t.status === "OPEN").length;
              const closedCount  = events.length;
              const winCount     = events.filter(e => e.pl > 0).length;
              const winRate      = closedCount > 0 ? Math.round((winCount / closedCount) * 100) : null;
              const totalPct = (totalPL / STARTING_CAPITAL) * 100;
              const isUp = totalPL >= 0;
              const color = isUp ? "#34D399" : "#F87171";

              return (
                <div className="order-6 lg:order-none lg:col-span-3 self-start">
                <Link href="/strategy" className="block group">
                  <div className={`card-shine glass surface-sheen rounded-2xl border transition-all hover:border-emerald-500/20 ${isUp ? "border-emerald-500/15" : "border-rose-500/15"}`}>

                    {/* Header: value + change */}
                    <div className="px-5 lg:px-6 pt-5 lg:pt-6 pb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-1">Paper Portfolio</p>
                        <p className="text-3xl lg:text-4xl font-black tracking-tight text-[var(--text-primary,#F1F5F9)] tabular-nums leading-none">
                          ${accountValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <div className={`flex items-center gap-2 mt-1.5 ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
                          <span className="text-sm font-bold tabular-nums">{isUp ? "+" : ""}{totalPL.toFixed(2)}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${isUp ? "bg-emerald-500/15" : "bg-rose-500/15"}`}>
                            {isUp ? "+" : ""}{totalPct.toFixed(2)}%
                          </span>
                          <span className="text-[#4B5675] text-xs">all time</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-emerald-400 group-hover:text-emerald-300 font-semibold transition-colors shrink-0 pb-0.5">View performance →</p>
                    </div>

                    {/* Full-width equity chart */}
                    <div className="w-full px-0">
                      {curve.length >= 2 ? (
                        <svg
                          viewBox={`0 0 800 110`}
                          preserveAspectRatio="none"
                          className="w-full h-[110px]"
                          aria-hidden
                        >
                          <defs>
                            <linearGradient id="port-chart-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity="0.20"/>
                              <stop offset="100%" stopColor={color} stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          {(() => {
                            const min   = Math.min(...curve);
                            const max   = Math.max(...curve);
                            const range = max - min || 1;
                            const W = 800, H = 110, pad = 6;
                            const pts = curve.map((v, i) => {
                              const x = (i / (curve.length - 1)) * W;
                              const y = H - pad - ((v - min) / range) * (H - pad * 2);
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            });
                            const pStr = pts.join(" ");
                            const last = pts[pts.length - 1].split(",");
                            return (
                              <>
                                <polygon points={`0,${H} ${pStr} ${W},${H}`} fill="url(#port-chart-grad)" />
                                <polyline points={pStr} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx={last[0]} cy={last[1]} r="4" fill={color} />
                              </>
                            );
                          })()}
                        </svg>
                      ) : (
                        <div className="w-full h-[110px] relative flex flex-col items-center justify-center gap-1.5">
                          <svg className="absolute inset-x-0 bottom-2 w-full h-12 opacity-40" viewBox="0 0 300 48" fill="none" preserveAspectRatio="none" aria-hidden="true">
                            <path d="M0 40 C40 38, 60 30, 90 32 S150 20, 180 24 S250 10, 300 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
                          </svg>
                          <p className="text-xs font-medium text-[#4B5675]">No closed trades yet</p>
                          <p className="text-[11px] text-[#333368]">Fill your first paper trade and your equity curve starts here</p>
                        </div>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-3 px-5 lg:px-6 py-4 border-t border-[#252345]">
                      {[
                        { label: "Open",     value: String(openCount),                                       color: "text-[var(--text-primary,#F1F5F9)]" },
                        { label: "Closed",   value: String(closedCount),                                     color: "text-[var(--text-primary,#F1F5F9)]" },
                        { label: "Win Rate", value: winRate != null ? `${winRate}%` : "—",                   color: winRate != null ? (winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#7B8DB4]" },
                        { label: "Realized", value: `${totalPL >= 0 ? "+" : ""}$${Math.abs(totalPL).toFixed(2)}`, color: isUp ? "text-emerald-400" : "text-rose-400" },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-[9px] font-bold text-[#4B5675] uppercase tracking-widest mb-1">{s.label}</p>
                          <p className={`text-sm font-black font-mono tabular-nums ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Link>
                </div>
              );
            })()}

          {/* Risk Rules + Exchange CTA — full width */}
          <div className="order-7 lg:order-none lg:col-span-3">
          <section className="space-y-3">
            {/* Risk rules */}
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5675] mb-3">Risk Rules</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {[
                  "Never risk more than 5–10% of capital per trade",
                  "Set your stop-loss before entering — non-negotiable",
                  "Read the analysis before acting on a signal",
                  "Wait for high-confidence setups only",
                  "Log every trade: reason, outcome, lesson",
                  "AI signals are a starting point, not a guarantee",
                ].map((rule, i) => (
                  <div key={rule} className="flex items-start gap-2.5 py-2 border-b border-[#252345]/30 last:border-0">
                    <span className="text-[9px] font-black text-emerald-500/30 shrink-0 mt-px">{i + 1}</span>
                    <p className="text-[11px] text-[#7B8DB4] leading-snug">{rule}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Exchange CTA */}
            <div className="rounded-2xl border border-[#252345] bg-gradient-to-r from-emerald-600/10 to-teal-600/10 px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Explore all exchanges</p>
                <p className="text-xs text-[#7B8DB4] mt-0.5">CBOE, CBOT, CME, KCBT, MGE, NYBOT &amp; NYMEX — instant AI analysis.</p>
              </div>
              <Link href="/explore" className="shrink-0 bg-emerald-600 hover:bg-emerald-500 transition-colors px-4 py-2 rounded-xl text-sm font-semibold text-white">
                Open →
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
