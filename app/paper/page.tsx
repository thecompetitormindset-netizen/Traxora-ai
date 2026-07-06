"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Link from "next/link";
import { scopedKey, setCurrentUser } from "../lib/userState";
import { haptic } from "../lib/haptics";
import { useSession } from "next-auth/react";

const TraxoraChart = dynamic(() => import("@/app/components/TraxoraChart"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type Signal = {
  symbol:     string;
  name:       string;
  signal:     "BUY" | "SELL";
  price:      number;
  confidence: string;
  time:       number;
};

type TakenTrade = {
  id:         string;
  symbol:     string;
  signal:     "BUY" | "SELL";
  entry:      number;
  stop:       number;
  target:     number;
  shares:     number;
  riskDollar: number;
  potential:  number;
  time:       number;
  note:       string;
  status?:    "PENDING" | "OPEN" | "WIN" | "LOSS";
  closePrice?: number;
  closedAt?:  number;
};

type RecommendedPlay = {
  symbol:     string;
  name:       string;
  category:   "market" | "futures" | "options";
  signal:     "BUY" | "SELL";
  price:      number;
  stop:       string;
  target:     string;
  confidence: "High" | "Medium" | "Low";
  rrRatio?:   string;
  meta?:      string;
};

// ── Storage ───────────────────────────────────────────────────────────────────

const ACCOUNT_KEY = "traxora_planner_account";
const TAKEN_KEY   = "traxora_taken_trades";

function loadAccount() {
  try { return JSON.parse(localStorage.getItem(scopedKey(ACCOUNT_KEY)) ?? "null") as { size: number; riskPct: number } | null; }
  catch { return null; }
}
function saveAccount(v: { size: number; riskPct: number }) {
  localStorage.setItem(scopedKey(ACCOUNT_KEY), JSON.stringify(v));
}
function loadTaken(): TakenTrade[] {
  try { return JSON.parse(localStorage.getItem(scopedKey(TAKEN_KEY)) ?? "[]"); }
  catch { return []; }
}
function saveTaken(t: TakenTrade[]) {
  localStorage.setItem(scopedKey(TAKEN_KEY), JSON.stringify(t));
}
function persistTaken(t: TakenTrade[]) {
  saveTaken(t);
  fetch("/api/paper-trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trades: t }),
  }).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}
function fmtD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtS(n: number) { return n.toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function ago(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function extractFirstPrice(s: string): string {
  const m = s.match(/[\d]+\.?\d*/);
  return m ? m[0] : s;
}

function isMarketHours(): boolean {
  try {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day  = d.getDay();
    if (day === 0 || day === 6) return false;
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins >= 570 && mins < 960; // 9:30am – 4:00pm ET
  } catch { return false; }
}
function calcLivePL(t: TakenTrade, price: number): number {
  return (t.signal === "BUY" ? 1 : -1) * (price - t.entry) * t.shares;
}
function calcLivePLPct(t: TakenTrade, price: number): number {
  return (t.signal === "BUY" ? 1 : -1) * ((price / t.entry) - 1) * 100;
}
function isStopHit(t: TakenTrade, price: number): boolean {
  return t.signal === "BUY" ? price <= t.stop : price >= t.stop;
}
function isTargetHit(t: TakenTrade, price: number): boolean {
  return t.signal === "BUY" ? price >= t.target : price <= t.target;
}

function loadCachedPlays(): RecommendedPlay[] {
  try {
    const alerts = JSON.parse(
      localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]"
    ) as Array<{ symbol: string; name: string; signal: string; price: number; confidence: string; time: number }>;

    const plays: RecommendedPlay[] = [];
    const seen = new Set<string>();
    const now  = Date.now();
    const TTL  = 8 * 60 * 60 * 1000; // 8 hours

    for (const a of alerts) {
      if (now - a.time > TTL) continue;
      if (a.signal !== "BUY" && a.signal !== "SELL") continue;
      if (seen.has(a.symbol)) continue;

      const cKey   = scopedKey(`sig_${a.symbol}_${Math.round(a.price * 100)}`);
      const cached = JSON.parse(localStorage.getItem(cKey) ?? "null");
      if (!cached?.trade?.stopLoss || !cached?.trade?.takeProfit) continue;

      seen.add(a.symbol);
      plays.push({
        symbol:     a.symbol,
        name:       a.name || a.symbol.replace(".US","").replace(".COMM",""),
        category:   a.symbol.includes(".COMM") ? "futures" : "market",
        signal:     a.signal as "BUY" | "SELL",
        price:      a.price,
        stop:       extractFirstPrice(cached.trade.stopLoss),
        target:     extractFirstPrice(cached.trade.takeProfit),
        confidence: a.confidence as "High" | "Medium" | "Low",
        rrRatio:    cached.trade.rrRatio,
      });
    }

    return plays.sort((a, b) => {
      const cr = (c: string) => c === "High" ? 0 : c === "Medium" ? 1 : 2;
      return cr(a.confidence) - cr(b.confidence);
    });
  } catch { return []; }
}

// ── Recommended Plays ─────────────────────────────────────────────────────────

function PlayCard({ play, onSelect }: { play: RecommendedPlay; onSelect: (p: RecommendedPlay) => void }) {
  const isBuy = play.signal === "BUY";
  return (
    <button
      type="button"
      onClick={() => onSelect(play)}
      className={`w-full text-left p-3 rounded-xl border border-l-2 transition-all hover:scale-[1.01] active:scale-[0.99] ${
        isBuy
          ? "bg-emerald-500/5 border-emerald-500/20 border-l-emerald-500/50 hover:bg-emerald-500/10"
          : "bg-rose-500/5 border-rose-500/20 border-l-rose-500/50 hover:bg-rose-500/10"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
            isBuy ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                  : "bg-rose-500/15 text-rose-400 border-rose-500/25"
          }`}>{play.signal}</span>
          <span className="text-xs font-black font-mono text-[#F1F5F9]">
            {play.symbol.replace(".US","").replace(".COMM","")}
          </span>
        </div>
        <span className={`text-[8px] font-bold ${
          play.confidence === "High"   ? "text-emerald-400" :
          play.confidence === "Medium" ? "text-amber-400"   : "text-[#4B5675]"
        }`}>{play.confidence}</span>
      </div>

      <p className={`text-base font-black font-mono ${isBuy ? "text-emerald-400" : "text-rose-400"}`}>
        ${play.price.toFixed(2)}
      </p>

      <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono flex-wrap">
        <span className="text-[#4B5675]">Stp</span>
        <span className="font-bold text-rose-400">{play.stop}</span>
        <span className="text-[#252345]">·</span>
        <span className="text-[#4B5675]">Tgt</span>
        <span className="font-bold text-emerald-400">{play.target}</span>
        {play.rrRatio && (
          <><span className="text-[#252345]">·</span><span className="text-violet-400">{play.rrRatio}</span></>
        )}
      </div>
      {play.meta && <p className="text-[8px] text-[#4B5675] mt-1 truncate">{play.meta}</p>}
      <p className="text-[9px] text-emerald-400 font-semibold mt-2">Tap to load all levels →</p>
    </button>
  );
}

function RecommendedPlays({ onSelect }: { onSelect: (p: RecommendedPlay) => void }) {
  const [marketPlays,  setMarketPlays]  = useState<RecommendedPlay[]>([]);
  const [futuresPlays, setFuturesPlays] = useState<RecommendedPlay[]>([]);
  const [optionsPlays, setOptionsPlays] = useState<RecommendedPlay[]>([]);
  const [optLoading,   setOptLoading]   = useState(true);

  useEffect(() => {
    const cached  = loadCachedPlays();
    setMarketPlays(cached.filter(p => p.category === "market").slice(0, 3));
    setFuturesPlays(cached.filter(p => p.category === "futures").slice(0, 3));

    fetch("/api/market/options-scan", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        type OP = {
          symbol: string; signal: "BUY"|"SELL"; price: number;
          play: string; strike: string; expiry: string|null; dte: number|null;
          stop: string; target: string; confidence: "High"|"Medium"|"Low";
          rrRatio: string; iv: number|null;
        };
        const plays: RecommendedPlay[] = (data.plays ?? []).slice(0, 3).map((p: OP) => ({
          symbol:     p.symbol,
          name:       `${p.play} · ${p.strike}`,
          category:   "options" as const,
          signal:     p.signal,
          price:      p.price,
          stop:       extractFirstPrice(p.stop),
          target:     extractFirstPrice(p.target),
          confidence: p.confidence,
          rrRatio:    p.rrRatio,
          meta:       [p.expiry, p.dte ? `${p.dte}d DTE` : null, p.iv ? `IV ${p.iv}%` : null]
                        .filter(Boolean).join(" · "),
        }));
        setOptionsPlays(plays);
      })
      .catch(() => {})
      .finally(() => setOptLoading(false));
  }, []);

  const noData = !optLoading && futuresPlays.length === 0 && optionsPlays.length === 0 && marketPlays.length === 0;
  if (noData) return null;

  const col = (label: string, color: string, plays: RecommendedPlay[], loading?: boolean, emptyMsg?: string) => (
    <div className="bg-[#0D0B1A] p-4">
      <p className={`text-[8px] font-black uppercase tracking-widest mb-3 ${color}`}>{label}</p>
      {loading ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-20 bg-[#13112A] rounded-xl animate-pulse" />)}
        </div>
      ) : plays.length === 0 ? (
        <p className="text-[10px] text-[#333368] leading-relaxed">{emptyMsg}</p>
      ) : (
        <div className="space-y-2">
          {plays.map((p, i) => <PlayCard key={i} play={p} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="glass surface-sheen border border-[#252345] rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-[#1C1933] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Today&apos;s Top Plays</p>
          <p className="text-[9px] text-[#333368] mt-0.5">Tap any card to instantly load symbol, entry, stop &amp; target</p>
        </div>
        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">1-click fill</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1C1933]">
        {col("Futures (Mini)", "text-violet-400", futuresPlays, false, "Run the Dashboard first — futures signals cache here automatically")}
        {col("Options Plays",  "text-amber-400",  optionsPlays, optLoading, "No high-confidence setups right now — check back later")}
        {col("Market Stocks",  "text-sky-400",    marketPlays, false, "Run the Dashboard first — stock signals cache here automatically")}
      </div>
    </div>
  );
}

// ── Position Sizer Component ──────────────────────────────────────────────────

function PositionSizer({
  initSymbol, initEntry, initSignal, initStop, initTarget,
  account, onTaken, onSymbolChange,
}: {
  initSymbol?: string; initEntry?: string; initSignal?: "BUY" | "SELL";
  initStop?: string; initTarget?: string;
  account: { size: number; riskPct: number };
  onTaken: (t: TakenTrade) => void;
  onSymbolChange?: (s: string) => void;
}) {
  const [symbol, setSymbol] = useState(initSymbol ?? "");
  const [signal, setSignal] = useState<"BUY" | "SELL">(initSignal ?? "BUY");
  const [entry,  setEntry]  = useState(initEntry  ?? "");
  const [stop,   setStop]   = useState(initStop   ?? "");
  const [target, setTarget] = useState(initTarget ?? "");
  const [note,   setNote]   = useState("");
  const [saved,  setSaved]  = useState(false);

  useEffect(() => { if (initSymbol) { setSymbol(initSymbol); onSymbolChange?.(initSymbol); } }, [initSymbol]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initSignal) setSignal(initSignal); }, [initSignal]);
  useEffect(() => { if (initEntry)  setEntry(initEntry);   }, [initEntry]);
  useEffect(() => { if (initStop)   setStop(initStop);     }, [initStop]);
  useEffect(() => { if (initTarget) setTarget(initTarget); }, [initTarget]);

  const entryN  = parsePrice(entry);
  const stopN   = parsePrice(stop);
  const targetN = parsePrice(target);

  const riskDollar   = (account.size * account.riskPct) / 100;
  const riskPerShare = entryN && stopN ? Math.abs(entryN - stopN) : null;
  const shares       = riskPerShare && riskPerShare > 0 ? Math.floor(riskDollar / riskPerShare) : null;
  const cost         = shares && entryN ? shares * entryN : null;
  const potential    = shares && targetN && entryN ? shares * Math.abs(targetN - entryN) : null;
  const rr           = potential && riskDollar > 0 ? potential / riskDollar : null;
  const valid        = !!(shares && shares > 0 && cost && potential);

  function handleTake() {
    if (!valid || !entryN || !stopN || !targetN || !shares) return;
    haptic.success();
    const t: TakenTrade = {
      id: Date.now().toString(),
      symbol: symbol.replace(".US","").replace(".COMM","") || "—",
      signal, entry: entryN, stop: stopN, target: targetN,
      shares, riskDollar, potential: potential!,
      time: Date.now(), note,
    };
    onTaken(t);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const bull = signal === "BUY";

  return (
    <div className="glass surface-sheen border border-[#252345] rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-[#1C1933]">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675] mb-4">Position Sizer</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold block mb-1.5">Ticker</label>
            <input value={symbol} onChange={e => { const v = e.target.value.toUpperCase(); setSymbol(v); onSymbolChange?.(v); }} placeholder="AAPL"
              className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2.5 text-sm font-black font-mono text-[#F1F5F9] placeholder-[#2D3A52] focus:outline-none focus:border-emerald-500/40" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold block mb-1.5">Direction</label>
            <div className="flex rounded-xl overflow-hidden border border-[#252345]">
              {(["BUY","SELL"] as const).map(d => (
                <button key={d} type="button" onClick={() => setSignal(d)}
                  className={`flex-1 py-2.5 text-xs font-black transition-all ${
                    signal === d
                      ? d === "BUY" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                      : "bg-[#0D0B1A] text-[#4B5675] hover:text-[#7B8DB4]"
                  }`}>{d === "BUY" ? "▲ LONG" : "▼ SHORT"}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] text-amber-400 uppercase tracking-wider font-semibold block mb-1.5">Entry Price</label>
            <input value={entry} onChange={e => setEntry(e.target.value)} placeholder="0.00"
              className="w-full bg-[#0D0B1A] border border-amber-500/20 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-amber-300 placeholder-[#2D3A52] focus:outline-none focus:border-amber-500/50" />
          </div>
          <div>
            <label className="text-[9px] text-rose-400 uppercase tracking-wider font-semibold block mb-1.5">Stop Loss</label>
            <input value={stop} onChange={e => setStop(e.target.value)} placeholder="0.00"
              className="w-full bg-[#0D0B1A] border border-rose-500/20 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-rose-300 placeholder-[#2D3A52] focus:outline-none focus:border-rose-500/50" />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] text-emerald-400 uppercase tracking-wider font-semibold block mb-1.5">Take Profit</label>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00"
              className="w-full bg-[#0D0B1A] border border-emerald-500/20 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-emerald-300 placeholder-[#2D3A52] focus:outline-none focus:border-emerald-500/50" />
          </div>
        </div>

        {/* Results */}
        {valid ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { label: "Shares",    val: fmtS(shares!),    color: "text-[#F1F5F9]",   sub: "to buy" },
              { label: "Cost",      val: fmtD(cost!),      color: "text-[#F1F5F9]",   sub: "total outlay" },
              { label: "Risk $",    val: fmtD(riskDollar), color: "text-rose-400",    sub: `${account.riskPct}% of acct` },
              { label: "Upside $",  val: fmtD(potential!), color: "text-emerald-400", sub: rr ? `${rr.toFixed(1)}:1 R:R` : "" },
            ].map(s => (
              <div key={s.label} className="bg-[#0D0B1A] rounded-xl p-3 text-center border border-[#1C1933]">
                <p className={`text-base font-black font-mono ${s.color}`}>{s.val}</p>
                <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mt-0.5">{s.label}</p>
                {s.sub && <p className="text-[8px] text-[#2D3A52] mt-px">{s.sub}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-[#0D0B1A] border border-[#1C1933]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-xs text-[#4B5675]">Fill in entry and stop loss to calculate your position size</p>
          </div>
        )}

        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (optional)…"
          className="w-full bg-[#0D0B1A] border border-[#1C1933] rounded-xl px-3 py-2 text-xs text-[#7B8DB4] placeholder-[#2D3A52] focus:outline-none mb-3" />

        <button type="button" onClick={handleTake} disabled={!valid}
          className={`btn-haptic w-full py-3 rounded-xl text-sm font-black disabled:opacity-30 disabled:cursor-not-allowed ${
            saved ? "bg-emerald-700 text-white" :
            bull  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
          }`}>
          {saved ? "✓ Order Placed!" : `Place ${signal === "BUY" ? "Long" : "Short"} Order →`}
        </button>
      </div>

      <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-[10px] text-[#4B5675]">Account <span className="font-bold text-[#F1F5F9]">{fmtD(account.size)}</span></span>
        <span className="text-[10px] text-[#4B5675]">Max risk/trade <span className="font-bold text-rose-400">{fmtD(riskDollar)}</span></span>
        {rr != null && (
          <span className="text-[10px] text-[#4B5675]">R:R <span className={`font-bold ${rr >= 2 ? "text-emerald-400" : rr >= 1.5 ? "text-amber-400" : "text-rose-400"}`}>{rr.toFixed(2)}:1</span></span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function TradePlannerContent() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [account, setAccount]           = useState<{ size: number; riskPct: number }>({ size: 100000, riskPct: 1 });
  const [editingAccount, setEditing]    = useState(false);
  const [accountInput, setAccountInput] = useState("100000");
  const [riskInput, setRiskInput]       = useState("1");
  const [signals, setSignals]           = useState<Signal[]>([]);
  const [taken, setTaken]               = useState<TakenTrade[]>([]);
  const [sizerSignal, setSizerSignal]   = useState<Signal | null>(null);
  const [chartSymbol, setChartSymbol]   = useState(params.get("symbol") ?? "");

  const initSymbol = params.get("symbol") ?? "";
  const initSignal = (params.get("side") as "BUY" | "SELL" | null) ?? "BUY";

  const [selectedPlay, setSelectedPlay] = useState<RecommendedPlay | null>(null);
  const [playKey,      setPlayKey]      = useState(0);
  const [closingId,    setClosingId]    = useState<string | null>(null);
  const [closeInput,   setCloseInput]   = useState("");
  const [livePrices,   setLivePrices]   = useState<Record<string, number>>({});
  const [priceTs,      setPriceTs]      = useState<number | null>(null);

  useEffect(() => {
    if (session === undefined) return; // wait for session to resolve before reading scoped keys
    setCurrentUser(userEmail);         // ensure scopedKey uses the correct user hash
    const acc = loadAccount();
    if (acc) { setAccount(acc); setAccountInput(String(acc.size)); setRiskInput(String(acc.riskPct)); }
    const raw = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]") as Signal[];
    setSignals(raw.filter(s => s.signal === "BUY" || s.signal === "SELL").slice(0, 12));
    setTaken(loadTaken());
    // Fetch from server and update if server has data (cross-device sync)
    fetch("/api/paper-trades").then(r => r.json()).then(data => {
      if (Array.isArray(data.trades) && data.trades.length > 0) {
        setTaken(data.trades);
        saveTaken(data.trades);
      }
    }).catch(() => {});
  }, [session, userEmail]); // re-run once session resolves (catches direct page load)

  function handleSelectPlay(p: RecommendedPlay) {
    setSelectedPlay(p);
    setPlayKey(k => k + 1);
    setSizerSignal(null);
    haptic.medium();
    // Scroll position sizer into view on mobile
    setTimeout(() => {
      document.getElementById("position-sizer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function saveAccountSettings() {
    const size    = parseFloat(accountInput.replace(/[^0-9.]/g, ""));
    const riskPct = parseFloat(riskInput.replace(/[^0-9.]/g, ""));
    if (!size || !riskPct || size <= 0 || riskPct <= 0) return;
    const v = { size, riskPct };
    setAccount(v); saveAccount(v); setEditing(false);
  }

  const handleTaken = useCallback((t: TakenTrade) => {
    const withStatus = { ...t, status: "PENDING" as const };
    setTaken(prev => { const next = [withStatus, ...prev]; persistTaken(next); return next; });
  }, []);

  function cancelPending(id: string) {
    setTaken(prev => { const next = prev.filter(t => t.id !== id); persistTaken(next); return next; });
  }

  function removeTaken(id: string) {
    setTaken(prev => { const next = prev.filter(t => t.id !== id); persistTaken(next); return next; });
  }

  function closeTrade(id: string, outcome: "WIN" | "LOSS") {
    const cp = parseFloat(closeInput);
    setTaken(prev => {
      const next = prev.map(t => t.id === id
        ? { ...t, status: outcome, closePrice: isNaN(cp) ? undefined : cp, closedAt: Date.now() }
        : t
      );
      persistTaken(next);
      return next;
    });
    setClosingId(null);
    setCloseInput("");
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const pending = taken.filter(t => t.status === "PENDING");
  const open    = taken.filter(t => t.status === "OPEN" || !t.status); // !t.status = backward compat for legacy trades
  const closed  = taken.filter(t => t.status === "WIN" || t.status === "LOSS");
  const wins   = closed.filter(t => t.status === "WIN");
  const losses = closed.filter(t => t.status === "LOSS");
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null;
  const riskDeployed = open.reduce((s, t) => s + t.riskDollar, 0);
  const maxRisk = (account.size * account.riskPct) / 100 * 5;
  const riskPct = maxRisk > 0 ? Math.min((riskDeployed / maxRisk) * 100, 100) : 0;
  const avgRR = taken.length > 0
    ? taken.reduce((s, t) => s + (t.potential / t.riskDollar), 0) / taken.length
    : null;
  const realizedPL = closed.reduce((s, t) => {
    if (t.closePrice == null) return s + (t.status === "WIN" ? t.potential : -t.riskDollar);
    const dir = t.signal === "BUY" ? 1 : -1;
    return s + dir * (t.closePrice - t.entry) * t.shares;
  }, 0);
  const equity = account.size + realizedPL;

  // Live price polling — every 60s during market hours, every 5min outside
  // Polls both open AND pending so pending orders can auto-fill when price reaches entry
  const activeSymbolKey = [...new Set([...open, ...pending].map(t => t.symbol))].sort().join(",");
  useEffect(() => {
    const symbols = [...new Set([...open, ...pending].map(t => t.symbol))];
    if (!symbols.length) return;
    async function fetchAll() {
      const updates: Record<string, number> = {};
      await Promise.allSettled(symbols.map(async sym => {
        try {
          const r = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
          const d = await r.json();
          if (typeof d.price === "number" && d.price > 0) updates[sym] = d.price;
        } catch { /* ignore */ }
      }));
      if (Object.keys(updates).length) {
        setLivePrices(prev => ({ ...prev, ...updates }));
        setPriceTs(Date.now());
        // Auto-fill pending orders when price reaches entry (0.5% tolerance = "at your level")
        setTaken(prev => {
          let changed = false;
          const next = prev.map(t => {
            if (t.status !== "PENDING") return t;
            const price = updates[t.symbol];
            if (price == null) return t;
            const filled = Math.abs(price - t.entry) / t.entry <= 0.005
              || (t.signal === "BUY"  ? price <= t.entry : price >= t.entry);
            if (!filled) return t;
            changed = true;
            return { ...t, status: "OPEN" as const };
          });
          if (changed) persistTaken(next);
          return changed ? next : prev;
        });
      }
    }
    fetchAll();
    const delay = isMarketHours() ? 60_000 : 300_000;
    const id = setInterval(fetchAll, delay);
    return () => clearInterval(id);
  }, [activeSymbolKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const unrealizedPL = open.reduce((s, t) => {
    const lp = livePrices[t.symbol];
    return lp != null ? s + calcLivePL(t, lp) : s;
  }, 0);
  const hasLiveData = Object.keys(livePrices).length > 0;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 lg:p-6 xl:p-8 pb-32 page-enter">
        <Topbar />
        <div className="max-w-7xl mx-auto w-full mt-3 space-y-5">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="reveal text-2xl lg:text-4xl font-black tracking-tight text-gradient-green">Paper Portfolio</h1>
              <p className="text-xs lg:text-sm text-[#4B5675] mt-1">Simulate trades risk-free with $100,000 virtual capital</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/journal" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-3 py-2 rounded-xl transition-all">Journal →</Link>
              <Link href="/history" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-3 py-2 rounded-xl transition-all">History →</Link>
            </div>
          </div>

          {/* ── Portfolio Hero ── */}
          <div className="card-shine glass surface-sheen border border-[#252345] rounded-2xl px-5 lg:px-7 py-5 lg:py-6">
            {!editingAccount ? (
              <>
                <div className="flex items-start justify-between flex-wrap gap-6">
                  <div>
                    <p className="text-[10px] lg:text-xs text-[#4B5675] uppercase tracking-widest mb-2">Portfolio Equity</p>
                    <p className={`text-4xl lg:text-5xl font-black font-mono tabular-nums ${(realizedPL + unrealizedPL) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtD(equity + unrealizedPL)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <span className={`text-sm font-bold tabular-nums ${realizedPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {realizedPL >= 0 ? "+" : ""}{fmtD(realizedPL)}
                      </span>
                      <span className="text-[#4B5675] text-xs">realized</span>
                      {hasLiveData && open.length > 0 && (
                        <>
                          <span className="text-[#252345]">·</span>
                          <span className={`text-sm font-bold tabular-nums ${unrealizedPL >= 0 ? "text-sky-400" : "text-rose-400"}`}>
                            {unrealizedPL >= 0 ? "+" : ""}{fmtD(unrealizedPL)}
                          </span>
                          <span className="text-[#4B5675] text-xs">unrealized</span>
                          {priceTs && <span className="text-[9px] text-[#333368] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />live</span>}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Account Size",    val: fmtD(account.size),                                   color: "text-[#F1F5F9]" },
                      { label: "Risk / Trade",    val: `${account.riskPct}% · ${fmtD((account.size * account.riskPct)/100)}`, color: "text-rose-400" },
                      { label: "Max Daily Risk",  val: fmtD((account.size * account.riskPct * 3)/100),        color: "text-amber-400" },
                      { label: "Buying Power",    val: fmtD(account.size - riskDeployed),                    color: "text-sky-400" },
                    ].map(s => (
                      <div key={s.label}>
                        <p className="text-[9px] lg:text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-1">{s.label}</p>
                        <p className={`text-sm lg:text-base font-black font-mono ${s.color}`}>{s.val}</p>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => setEditing(true)}
                    className="self-start text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-4 py-2 rounded-xl transition-all shrink-0">
                    Edit
                  </button>
                </div>

                {/* Risk gauge */}
                <div className="mt-5 pt-4 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Risk Deployed ({open.length} open)</span>
                    <span className={`text-xs font-bold font-mono ${riskPct > 70 ? "text-rose-400" : riskPct > 40 ? "text-amber-400" : "text-emerald-400"}`}>
                      {fmtD(riskDeployed)} / {fmtD(maxRisk)}
                    </span>
                  </div>
                  <div className="h-2 bg-[#0D0B1A] rounded-full overflow-hidden border border-[#1C1933]">
                    {/* eslint-disable-next-line react/forbid-dom-props */}
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${riskPct > 70 ? "bg-rose-500" : riskPct > 40 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${riskPct}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-[#4B5675] mt-1.5">Max risk = 5× your per-trade risk limit ({fmtD((account.size * account.riskPct)/100)} × 5)</p>
                </div>
              </>
            ) : (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold block mb-1.5">Account Size ($)</label>
                  <input value={accountInput} onChange={e => setAccountInput(e.target.value)} placeholder="100000"
                    className="bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2 text-sm font-mono text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50 w-40" />
                </div>
                <div>
                  <label className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold block mb-1.5">Risk Per Trade (%)</label>
                  <input value={riskInput} onChange={e => setRiskInput(e.target.value)} placeholder="1"
                    className="bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2 text-sm font-mono text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50 w-24" />
                </div>
                <button type="button" onClick={saveAccountSettings}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="text-xs text-[#4B5675] hover:text-[#7B8DB4] px-2 py-2">Cancel</button>
              </div>
            )}
          </div>

          {/* ── Stats strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: "Open Positions",  val: pending.length > 0 ? `${open.length} (+${pending.length} pending)` : String(open.length), color: open.length > 0 ? "text-sky-400" : pending.length > 0 ? "text-amber-400" : "text-[#F1F5F9]" },
              { label: "Closed Trades",   val: String(closed.length),                                           color: "text-[#F1F5F9]" },
              { label: "Win Rate",        val: winRate != null ? `${winRate}%` : "—",                           color: winRate != null ? (winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#4B5675]" },
              { label: "Wins / Losses",   val: `${wins.length}W · ${losses.length}L`,                          color: "text-[#F1F5F9]" },
              { label: "Avg R:R",         val: avgRR != null ? `${avgRR.toFixed(2)}:1` : "—",                  color: avgRR != null ? (avgRR >= 2 ? "text-emerald-400" : avgRR >= 1 ? "text-amber-400" : "text-rose-400") : "text-[#4B5675]" },
              { label: "Realized P&L",    val: closed.length > 0 ? `${realizedPL >= 0 ? "+" : ""}${fmtD(realizedPL)}` : "—", color: realizedPL >= 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(s => (
              <div key={s.label} className="glass surface-sheen border border-[#252345] rounded-2xl px-4 py-3.5">
                <p className="text-[9px] lg:text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-1">{s.label}</p>
                <p className={`text-lg lg:text-xl font-black font-mono tabular-nums ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* ── Recommended Plays ── */}
          <RecommendedPlays onSelect={handleSelectPlay} />

          {/* ── Sizer + Signals ── */}
          <div id="position-sizer" className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Sizer */}
            <PositionSizer
              key={playKey}
              initSymbol={
                selectedPlay ? selectedPlay.symbol.replace(".US","").replace(".COMM","")
                : sizerSignal ? sizerSignal.symbol.replace(".US","").replace(".COMM","")
                : initSymbol
              }
              initSignal={selectedPlay?.signal ?? sizerSignal?.signal ?? initSignal}
              initEntry={
                selectedPlay ? selectedPlay.price.toFixed(2)
                : sizerSignal ? sizerSignal.price.toFixed(2)
                : (params.get("price") ?? "")
              }
              initStop={
                selectedPlay ? selectedPlay.stop
                : sizerSignal ? ""
                : (params.get("stop") ?? "")
              }
              initTarget={
                selectedPlay ? selectedPlay.target
                : sizerSignal ? ""
                : (params.get("target") ?? "")
              }
              account={account}
              onTaken={handleTaken}
              onSymbolChange={s => { if (s.length >= 1) setChartSymbol(s); }}
            />

            {/* Signals + Rules */}
            <div className="space-y-4">
              <div className="glass surface-sheen border border-[#252345] rounded-2xl overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-[#1C1933]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Recent Signals — tap to load</p>
                </div>
                {signals.length === 0 ? (
                  <div className="px-5 py-8 text-center space-y-3">
                    <p className="text-3xl">⚡</p>
                    <p className="text-sm font-semibold text-[#7B8DB4]">No signals yet</p>
                    <p className="text-xs text-[#4B5675]">Run an analysis to generate your first signal</p>
                    <Link href="/analysis" className="inline-block mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all">
                      Go to Signals →
                    </Link>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {signals.map((s, i) => {
                      const ticker = s.symbol.replace(".US","").replace(".COMM","");
                      const active = sizerSignal?.symbol === s.symbol && sizerSignal?.time === s.time;
                      return (
                        <button key={i} type="button" onClick={() => { const next = active ? null : s; setSizerSignal(next); if (next) setChartSymbol(next.symbol.replace(".US","").replace(".COMM","")); }}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                            active ? "bg-emerald-500/8 border-emerald-500/30" : "bg-[#0D0B1A] border-[#1C1933] hover:border-[#333368]"
                          }`}>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ${
                            s.signal === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                          }`}>{s.signal}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold">{ticker}</p>
                            <p className="text-[10px] text-[#4B5675] truncate">{s.name || ticker} · {ago(s.time)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-mono font-bold">${s.price.toFixed(2)}</p>
                            <p className={`text-[9px] font-semibold ${s.confidence === "High" ? "text-emerald-400" : s.confidence === "Medium" ? "text-amber-400" : "text-rose-400"}`}>{s.confidence}</p>
                          </div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "#34D399" : "#4B5675"} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Trading rules */}
              <div className="glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675] mb-3">Paper Trading Rules</p>
                <div className="space-y-2">
                  {[
                    ["1%", "Never risk more than 1% per trade"],
                    ["Pre", "Define stop loss before entering"],
                    ["R:R", "Only take trades with 2:1+ reward/risk"],
                    ["Log", "Record every trade with a reason"],
                    ["Rev", "Review closed trades weekly"],
                  ].map(([tag, rule]) => (
                    <div key={tag} className="flex items-center gap-3">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 w-8 text-center">{tag}</span>
                      <p className="text-xs text-[#7B8DB4]">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart ── */}
          {chartSymbol && (
            <div className="rounded-2xl overflow-hidden">
              <TraxoraChart symbol={chartSymbol} height={440} />
            </div>
          )}

          {/* ── Pending Orders ── */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Pending Orders ({pending.length})</p>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[9px] text-amber-400/70">Waiting for price to reach entry</span>
              </div>
              <div className="space-y-2">
                {pending.map(t => {
                  const livePrice = livePrices[t.symbol] ?? null;
                  const gap = livePrice != null ? Math.abs(livePrice - t.entry) : null;
                  const gapPct = gap != null ? (gap / t.entry) * 100 : null;
                  const awayDir = livePrice != null
                    ? (t.signal === "BUY"
                        ? livePrice > t.entry ? `needs ↓ ${fmtD(livePrice - t.entry)}` : "at entry — filling soon"
                        : livePrice < t.entry ? `needs ↑ ${fmtD(t.entry - livePrice)}` : "at entry — filling soon")
                    : null;

                  return (
                    <div key={t.id} className="border border-amber-500/20 bg-amber-500/5 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ${
                          t.signal === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                        }`}>{t.signal}</span>
                        <p className="text-sm font-bold flex-1">{t.symbol}</p>
                        {livePrice != null && (
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black font-mono text-[#F1F5F9]">${livePrice.toFixed(2)}</p>
                            {gapPct != null && gapPct > 0.1 && (
                              <p className="text-[10px] text-amber-400 font-mono">{awayDir}</p>
                            )}
                            {gapPct != null && gapPct <= 0.1 && (
                              <p className="text-[10px] text-emerald-400 font-mono animate-pulse">filling…</p>
                            )}
                          </div>
                        )}
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">PENDING</span>
                        <p className="text-[10px] text-[#4B5675] shrink-0">{ago(t.time)}</p>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                        {[
                          { l: "Entry",  v: `$${t.entry.toFixed(2)}`,  c: "text-amber-400" },
                          { l: "Stop",   v: `$${t.stop.toFixed(2)}`,   c: "text-rose-400" },
                          { l: "Target", v: `$${t.target.toFixed(2)}`, c: "text-emerald-400" },
                          { l: "Shares", v: fmtS(t.shares),            c: "text-[#F1F5F9]" },
                          { l: "Risk",   v: fmtD(t.riskDollar),        c: "text-rose-400" },
                          { l: "Upside", v: fmtD(t.potential),         c: "text-emerald-400" },
                        ].map(r => (
                          <div key={r.l} className="bg-[#0D0B1A] border border-[#1C1933] rounded-xl p-2 text-center">
                            <p className={`text-xs font-black font-mono ${r.c}`}>{r.v}</p>
                            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mt-0.5">{r.l}</p>
                          </div>
                        ))}
                      </div>

                      {t.note && <p className="text-xs text-[#4B5675] mb-3 italic">&ldquo;{t.note}&rdquo;</p>}

                      <button
                        type="button"
                        onClick={() => cancelPending(t.id)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition-all border text-[#4B5675] border-[#333368] hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/5"
                      >
                        Cancel Order ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Open Positions ── */}
          {open.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Open Positions ({open.length})</p>
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              </div>
              <div className="space-y-2">
                {open.map(t => {
                  const livePrice  = livePrices[t.symbol] ?? null;
                  const pl         = livePrice != null ? calcLivePL(t, livePrice)    : null;
                  const plPct      = livePrice != null ? calcLivePLPct(t, livePrice) : null;
                  const stopHit    = livePrice != null && isStopHit(t, livePrice);
                  const targetHit  = livePrice != null && isTargetHit(t, livePrice);
                  const breached   = stopHit || targetHit;

                  const cardBorder = stopHit
                    ? "border-rose-500/60 bg-rose-500/5 animate-pulse"
                    : targetHit
                      ? "border-emerald-500/60 bg-emerald-500/5 animate-pulse"
                      : "border-sky-500/20 bg-sky-500/5";

                  return (
                  <div key={t.id} className={`border rounded-2xl px-5 py-4 ${cardBorder}`}>

                    {/* Breach alert banner */}
                    {breached && (
                      <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-xs font-black ${
                        targetHit ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      }`}>
                        <span className={`w-2 h-2 rounded-full animate-ping inline-block ${targetHit ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {targetHit ? "🎯 TARGET HIT — ready to close as WIN" : "⚠️ STOP HIT — ready to close as LOSS"}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ${
                        t.signal === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                      }`}>{t.signal}</span>
                      <p className="text-sm font-bold flex-1">{t.symbol.replace(".US","").replace(".COMM","")}</p>

                      {/* Live price + P&L */}
                      {livePrice != null && (
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black font-mono text-[#F1F5F9]">${livePrice.toFixed(2)}</p>
                          {pl != null && plPct != null && (
                            <p className={`text-[10px] font-bold font-mono ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {pl >= 0 ? "+" : ""}{fmtD(pl)} ({plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%)
                            </p>
                          )}
                        </div>
                      )}

                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 shrink-0">OPEN</span>
                      <p className="text-[10px] text-[#4B5675] shrink-0">{ago(t.time)}</p>
                      <button type="button" aria-label="Remove trade" onClick={() => removeTaken(t.id)} className="text-[#2D3A52] hover:text-rose-400 transition-colors ml-1 shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                      {[
                        { l: "Entry",  v: `$${t.entry.toFixed(2)}`,  c: "text-amber-400" },
                        { l: "Stop",   v: `$${t.stop.toFixed(2)}`,   c: stopHit  ? "text-rose-400 font-black"    : "text-rose-400" },
                        { l: "Target", v: `$${t.target.toFixed(2)}`, c: targetHit ? "text-emerald-400 font-black" : "text-emerald-400" },
                        { l: "Shares", v: fmtS(t.shares),            c: "text-[#F1F5F9]" },
                        { l: "Risk",   v: fmtD(t.riskDollar),        c: "text-rose-400" },
                        { l: "Upside", v: fmtD(t.potential),         c: "text-emerald-400" },
                      ].map(r => (
                        <div key={r.l} className={`rounded-xl p-2 text-center border ${
                          (r.l === "Stop" && stopHit) ? "bg-rose-500/10 border-rose-500/30" :
                          (r.l === "Target" && targetHit) ? "bg-emerald-500/10 border-emerald-500/30" :
                          "bg-[#0D0B1A] border-[#1C1933]"
                        }`}>
                          <p className={`text-xs font-black font-mono ${r.c}`}>{r.v}</p>
                          <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mt-0.5">{r.l}</p>
                        </div>
                      ))}
                    </div>
                    {t.note && <p className="text-xs text-[#4B5675] mb-3 italic">&ldquo;{t.note}&rdquo;</p>}

                    {/* Close trade */}
                    {closingId === t.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="number"
                          value={closeInput}
                          onChange={e => setCloseInput(e.target.value)}
                          placeholder="Close price"
                          className="flex-1 min-w-0 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2 text-sm font-mono text-[#F1F5F9] focus:outline-none focus:border-emerald-500/40"
                        />
                        <button type="button" onClick={() => closeTrade(t.id, "WIN")}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all">✓ Win</button>
                        <button type="button" onClick={() => closeTrade(t.id, "LOSS")}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all">✗ Loss</button>
                        <button type="button" onClick={() => { setClosingId(null); setCloseInput(""); }}
                          className="text-xs text-[#4B5675] hover:text-[#94A3B8] px-2 py-2 transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => {
                        setClosingId(t.id);
                        const lp = livePrices[t.symbol];
                        if (lp) setCloseInput(lp.toFixed(2));
                      }}
                        className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all border ${
                          breached
                            ? targetHit
                              ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                              : "text-rose-400 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20"
                            : "text-sky-400 border-sky-500/25 hover:border-sky-500/50"
                        }`}>
                        {breached ? (targetHit ? "Close as Win →" : "Close as Loss →") : "Close Position →"}
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Trade History ── */}
          {closed.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Trade History ({closed.length})</p>
              <div className="space-y-2">
                {closed.map(t => {
                  const isWin = t.status === "WIN";
                  const pl = t.closePrice != null
                    ? (t.signal === "BUY" ? t.closePrice - t.entry : t.entry - t.closePrice) * t.shares
                    : (isWin ? t.potential : -t.riskDollar);
                  return (
                    <div key={t.id} className={`rounded-2xl px-5 py-4 border ${isWin ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ${
                          t.signal === "BUY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                        }`}>{t.signal}</span>
                        <p className="text-sm font-bold flex-1">{t.symbol}</p>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isWin ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30"}`}>
                          {isWin ? "WIN" : "LOSS"}
                        </span>
                        <span className={`text-sm font-black font-mono tabular-nums ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {pl >= 0 ? "+" : ""}{fmtD(pl)}
                        </span>
                        <p className="text-[10px] text-[#4B5675] hidden sm:block">{t.closedAt ? ago(t.closedAt) : ago(t.time)}</p>
                        <button type="button" aria-label="Remove trade" onClick={() => removeTaken(t.id)} className="text-[#2D3A52] hover:text-rose-400 transition-colors ml-1">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-[10px] font-mono text-[#4B5675]">Entry <span className="text-amber-400 font-bold">${t.entry.toFixed(2)}</span></span>
                        {t.closePrice && <span className="text-[10px] font-mono text-[#4B5675]">Close <span className="text-[#F1F5F9] font-bold">${t.closePrice.toFixed(2)}</span></span>}
                        <span className="text-[10px] font-mono text-[#4B5675]">Shares <span className="text-[#F1F5F9] font-bold">{fmtS(t.shares)}</span></span>
                        <span className="text-[10px] font-mono text-[#4B5675]">R:R <span className="text-violet-400 font-bold">{(t.potential/t.riskDollar).toFixed(1)}:1</span></span>
                        {t.note && <span className="text-[10px] text-[#4B5675] italic">&ldquo;{t.note}&rdquo;</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {taken.length === 0 && pending.length === 0 && (
            <div className="border border-dashed border-[#252345] rounded-2xl px-6 py-14 text-center">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-base font-bold text-[#7B8DB4] mb-2">No trades logged yet</p>
              <p className="text-sm text-[#4B5675]">Use the Position Sizer above to calculate your size, then log the trade.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default function TradePlannerPage() {
  return (
    <PaywallGuard>
      <Suspense>
        <TradePlannerContent />
      </Suspense>
    </PaywallGuard>
  );
}
