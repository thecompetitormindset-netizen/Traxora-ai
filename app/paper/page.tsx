"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { generateAndSavePaperEntry } from "../components/AutoJournal";
import PaywallGuard from "@/app/components/PaywallGuard";
import Link from "next/link";
import type { PaperTrade, Direction, ExitReason, TradeStatus, AddTradeInitial } from "../lib/paperTrades";
import {
  loadTrades, saveTrades, calcPL, calcPLPct,
  fmtMoney, fmtPct, plColor, daysBetween,
  STARTING_CAPITAL,
} from "../lib/paperTrades";
import AddTradeModal from "../components/paper/AddTradeModal";
import CloseModal from "../components/paper/CloseModal";
import OptionsTab from "../components/paper/OptionsTab";
import { scopedKey } from "../lib/userState";

// ── Paper trade types ──────────────────────────────────────────────────────────
type TradeReview = {
  summary: string;
  frameworks?: {
    ict?:       { verdict: string; points: string[] };
    wyckoff?:   { verdict: string; points: string[] };
    rMultiple?: { achieved: string; verdict: string };
    douglas?:   { verdict: string; point: string };
    risk?:      { verdict: string; points: string[] };
  };
  strengths: string[];
  mistakes:  string[];
  lesson:    string;
};

// ── Real positions types ───────────────────────────────────────────────────────
type PositionType = "stock" | "call" | "put";

type Position = {
  id:           string;
  symbol:       string;
  positionType: PositionType;
  shares?:      number;
  contracts?:   number;
  entryPrice:   number;
  stopLoss?:    number;
  strike?:      number;
  expiry?:      string;
  dateBought:   string;
  notes?:       string;
};

type InsightState = {
  loading:      boolean;
  text:         string;
  currentPrice: number | null;
  pnlPercent:   number | null;
  pnlDollar:    number | null;
  name:         string;
  error?:       string;
};

const POSITIONS_KEY = "traxora_real_positions";

function loadPositions(): Position[] {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(POSITIONS_KEY)) ?? "[]");
  } catch { return []; }
}

function savePositions(p: Position[]) {
  localStorage.setItem(scopedKey(POSITIONS_KEY), JSON.stringify(p));
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function fmtPrice(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Add Position Modal ─────────────────────────────────────────────────────────
function AddPositionModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Position) => void }) {
  const [type, setType]           = useState<PositionType>("stock");
  const [symbol, setSymbol]       = useState("");
  const [shares, setShares]       = useState("");
  const [contracts, setContracts] = useState("");
  const [entry, setEntry]         = useState("");
  const [stop, setStop]           = useState("");
  const [strike, setStrike]       = useState("");
  const [expiry, setExpiry]       = useState("");
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState("");
  const [err, setErr]             = useState("");

  function handleSubmit() {
    if (!symbol.trim()) return setErr("Symbol is required.");
    if (!entry || isNaN(+entry) || +entry <= 0) return setErr("Valid entry price required.");
    if (type === "stock" && (!shares || isNaN(+shares) || +shares <= 0)) return setErr("Shares required.");
    if (type !== "stock" && (!contracts || isNaN(+contracts) || +contracts <= 0)) return setErr("Contracts required.");
    if (type !== "stock" && (!strike || isNaN(+strike))) return setErr("Strike required for options.");
    if (type !== "stock" && !expiry) return setErr("Expiry required for options.");

    const pos: Position = {
      id:           crypto.randomUUID(),
      symbol:       symbol.trim().toUpperCase(),
      positionType: type,
      entryPrice:   +entry,
      dateBought:   date,
      ...(type === "stock" ? { shares: +shares } : { contracts: +contracts, strike: +strike, expiry }),
      ...(stop  ? { stopLoss: +stop  } : {}),
      ...(notes ? { notes: notes.trim() } : {}),
    };
    onAdd(pos);
  }

  const inputCls = "w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2.5 text-sm text-[#F1F5F9] placeholder-[#4B5675] focus:outline-none focus:border-emerald-500/50";
  const labelCls = "text-[10px] font-semibold text-[#4B5675] uppercase tracking-widest mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-black text-[#F1F5F9]">Log a Real Position</h2>
          <button type="button" onClick={onClose} className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex gap-1 bg-[#0D0B1A] border border-[#252345] rounded-xl p-1 mb-5">
          {(["stock", "call", "put"] as PositionType[]).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${type === t ? "bg-emerald-600 text-white" : "text-[#4B5675] hover:text-[#F1F5F9]"}`}>
              {t === "stock" ? "Stock" : t === "call" ? "Call Option" : "Put Option"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Symbol</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date Bought</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{type === "stock" ? "Shares" : "Contracts"}</label>
              <input
                type="number" min="0" step="1"
                value={type === "stock" ? shares : contracts}
                onChange={e => type === "stock" ? setShares(e.target.value) : setContracts(e.target.value)}
                placeholder={type === "stock" ? "100" : "1"}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{type === "stock" ? "Avg Entry Price" : "Premium Paid / share"}</label>
              <input type="number" min="0" step="0.01" value={entry} onChange={e => setEntry(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
          </div>

          {type !== "stock" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Strike Price</label>
                <input type="number" min="0" step="0.5" value={strike} onChange={e => setStrike(e.target.value)} placeholder="200.00" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expiry Date</label>
                <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Stop Loss <span className="text-[#333368] normal-case">(optional)</span></label>
            <input type="number" min="0" step="0.01" value={stop} onChange={e => setStop(e.target.value)} placeholder="No stop set" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Notes <span className="text-[#333368] normal-case">(optional)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why you entered, thesis…" className={inputCls} />
          </div>

          {err && <p className="text-xs text-rose-400">{err}</p>}

          <button type="button" onClick={handleSubmit}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-3 rounded-xl text-sm font-bold text-white mt-1">
            Add Position
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Insight Panel ──────────────────────────────────────────────────────────────
function InsightPanel({ insight }: { insight: InsightState }) {
  if (insight.error) {
    return <p className="text-xs text-rose-400 mt-3">{insight.error}</p>;
  }

  const verdictMatch  = insight.text.match(/\*\*VERDICT:\s*(HOLD|CUT|ADD|WAIT)\*\*/i);
  const verdict       = verdictMatch?.[1]?.toUpperCase();
  const verdictColor  =
    verdict === "HOLD" ? "text-amber-400 bg-amber-500/10 border-amber-500/25" :
    verdict === "CUT"  ? "text-rose-400 bg-rose-500/10 border-rose-500/25" :
    verdict === "ADD"  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" :
                         "text-cyan-400 bg-cyan-500/10 border-cyan-500/25";

  const renderMd = (text: string) =>
    text
      .replace(/\*\*([^*]+)\*\*/g, "<strong class=\"text-[#F1F5F9]\">$1</strong>")
      .replace(/\n/g, "<br/>");

  return (
    <div className="mt-4 pt-4 border-t border-[#252345] space-y-3">
      {verdict && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black px-3 py-1 rounded-lg border ${verdictColor}`}>
            {verdict}
          </span>
          {insight.loading && (
            <span className="text-[10px] text-[#4B5675] animate-pulse">AI analysing…</span>
          )}
        </div>
      )}
      {insight.text && (
        <div
          className="text-[12px] text-[#94A3B8] leading-relaxed space-y-2 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: renderMd(insight.text) }}
        />
      )}
      {insight.loading && !insight.text && (
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-[#4B5675]">Fetching live price and running analysis…</span>
        </div>
      )}
    </div>
  );
}

// ── Position Card ──────────────────────────────────────────────────────────────
function PositionCard({ pos, onDelete }: { pos: Position; onDelete: (id: string) => void }) {
  const [insight, setInsight]   = useState<InsightState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const days     = daysSince(pos.dateBought);
  const totalCost = pos.positionType === "stock"
    ? (pos.shares ?? 0) * pos.entryPrice
    : (pos.contracts ?? 0) * 100 * pos.entryPrice;

  const pnl      = insight?.pnlDollar   ?? null;
  const pnlPct   = insight?.pnlPercent  ?? null;
  const curPrice = insight?.currentPrice ?? null;
  const pnlUp    = pnl !== null ? pnl >= 0 : null;

  async function runInsight() {
    if (insight?.loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setExpanded(true);
    setInsight({ loading: true, text: "", currentPrice: null, pnlPercent: null, pnlDollar: null, name: pos.symbol });

    try {
      const res = await fetch("/api/ai/position-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:       pos.symbol,
          positionType: pos.positionType,
          shares:       pos.shares,
          contracts:    pos.contracts,
          entryPrice:   pos.entryPrice,
          stopLoss:     pos.stopLoss,
          strike:       pos.strike,
          expiry:       pos.expiry,
          dateBought:   pos.dateBought,
          notes:        pos.notes,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let text     = "";
      let meta: Partial<InsightState> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") break;
          try {
            const d = JSON.parse(raw);
            if (d.type === "meta") {
              meta = { currentPrice: d.currentPrice, pnlPercent: d.pnlPercent, pnlDollar: d.pnlDollar, name: d.name };
            } else if (d.type === "text") {
              text += d.text;
            }
          } catch { /* partial chunk */ }
        }
        setInsight(prev => ({ ...prev!, ...meta, text, loading: true }));
      }
      setInsight(prev => ({ ...prev!, loading: false }));
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setInsight(prev => ({ ...prev!, loading: false, error: "Analysis failed. Try again." }));
    }
  }

  const badgeType =
    pos.positionType === "stock" ? { label: "STOCK", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" } :
    pos.positionType === "call"  ? { label: "CALL",  cls: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" } :
                                   { label: "PUT",   cls: "text-rose-400 bg-rose-500/10 border-rose-500/20" };

  return (
    <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-black text-[#F1F5F9]">{pos.symbol}</p>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeType.cls}`}>{badgeType.label}</span>
                {!pos.stopLoss && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/20">
                    ⚠ NO STOP
                  </span>
                )}
              </div>
              {insight?.name && insight.name !== pos.symbol && (
                <p className="text-[10px] text-[#4B5675] mt-0.5">{insight.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {curPrice !== null && (
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-[#F1F5F9]">${fmtPrice(curPrice)}</p>
                <p className={`text-[10px] font-mono font-bold ${pnlUp ? "text-emerald-400" : "text-rose-400"}`}>
                  {pnlUp ? "+" : ""}{pnlPct?.toFixed(2)}%
                </p>
              </div>
            )}
            <button type="button" onClick={() => onDelete(pos.id)}
              className="text-[#333368] hover:text-rose-400 transition-colors p-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">
              {pos.positionType === "stock" ? "Shares" : "Contracts"}
            </p>
            <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">
              {pos.positionType === "stock" ? pos.shares : pos.contracts}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Avg Entry</p>
            <p className="text-sm font-mono font-bold text-[#F1F5F9] mt-0.5">${fmtPrice(pos.entryPrice)}</p>
          </div>
          <div>
            <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Total Cost</p>
            <p className="text-sm font-mono font-bold text-[#F1F5F9] mt-0.5">${fmtPrice(totalCost)}</p>
          </div>
          <div>
            <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Held</p>
            <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">{days}d</p>
          </div>
          {pos.positionType !== "stock" && (
            <>
              <div>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Strike</p>
                <p className="text-sm font-mono font-bold text-[#F1F5F9] mt-0.5">${pos.strike}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Expiry</p>
                <p className="text-sm font-bold text-[#F1F5F9] mt-0.5">{pos.expiry}</p>
              </div>
            </>
          )}
          {pos.stopLoss && (
            <div>
              <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Stop Loss</p>
              <p className="text-sm font-mono font-bold text-rose-400 mt-0.5">${fmtPrice(pos.stopLoss)}</p>
            </div>
          )}
          {pnl !== null && (
            <div>
              <p className="text-[9px] text-[#4B5675] uppercase tracking-wider">Unrealised P&L</p>
              <p className={`text-sm font-mono font-bold mt-0.5 ${pnlUp ? "text-emerald-400" : "text-rose-400"}`}>
                {pnlUp ? "+" : ""}${fmtPrice(pnl)}
              </p>
            </div>
          )}
        </div>

        {pos.notes && (
          <p className="mt-3 text-[11px] text-[#4B5675] italic border-l-2 border-[#252345] pl-3">{pos.notes}</p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button type="button" onClick={runInsight}
            disabled={insight?.loading}
            className="flex items-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 hover:border-emerald-500/40 transition-all px-4 py-2 rounded-xl text-xs font-bold text-emerald-400 disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            {insight ? "Refresh Analysis" : "Get AI Insight"}
          </button>
          {expanded && insight && (
            <button type="button" onClick={() => setExpanded(e => !e)}
              className="text-[10px] text-[#4B5675] hover:text-[#F1F5F9] transition-colors">
              {expanded ? "Hide ▲" : "Show ▼"}
            </button>
          )}
        </div>
      </div>

      {expanded && insight && (
        <div className="px-5 pb-5">
          <InsightPanel insight={insight} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
function PaperPortfolio() {
  const searchParams                      = useSearchParams();
  const router                            = useRouter();

  const [trades, setTrades]               = useState<PaperTrade[]>([]);
  const [prices, setPrices]               = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAdd, setShowAdd]             = useState(false);
  const [addInitial, setAddInitial]       = useState<AddTradeInitial | undefined>();
  const [closing, setClosing]             = useState<PaperTrade | null>(null);
  const [tab, setTab]                     = useState<"open" | "closed" | "options" | "positions">("open");
  const [reviews, setReviews]             = useState<Record<string, TradeReview | "loading" | "error">>({});

  // Real positions state
  const [positions, setPositions]         = useState<Position[]>([]);
  const [showAddPosition, setShowAddPosition] = useState(false);

  // Pre-fill from signal toast URL params
  useEffect(() => {
    const symbol    = searchParams.get("symbol");
    const direction = searchParams.get("direction") as Direction | null;
    const price     = searchParams.get("price");
    if (symbol && direction) {
      setAddInitial({ symbol, direction, entryPrice: price ?? "" });
      setShowAdd(true);
      router.replace("/paper");
    }
  }, [searchParams, router]);

  useEffect(() => { setTrades(loadTrades()); }, []);
  useEffect(() => { setPositions(loadPositions()); }, []);

  const open   = trades.filter(t => t.status === "OPEN");
  const closed = trades.filter(t => t.status === "CLOSED").sort((a, b) =>
    new Date(b.exitDate!).getTime() - new Date(a.exitDate!).getTime());

  const fetchPrices = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setLoadingPrices(true);
    const results = await Promise.allSettled(symbols.map(async sym => {
      const res  = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const data = await res.json();
      return { sym, price: typeof data.price === "number" ? data.price : null };
    }));
    const map: Record<string, number> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.price !== null) map[r.value.sym] = r.value.price;
    }
    setPrices(prev => ({ ...prev, ...map }));
    setLoadingPrices(false);
  }, []);

  useEffect(() => {
    const syms = [...new Set(open.map(t => t.symbol))];
    if (syms.length > 0) fetchPrices(syms);
    const id = setInterval(() => {
      const s = [...new Set(open.map(t => t.symbol))];
      if (s.length > 0) fetchPrices(s);
    }, 30_000);
    return () => clearInterval(id);
  }, [trades, fetchPrices]);

  async function fetchReview(trade: PaperTrade) {
    if (!trade.exitPrice || !trade.exitDate) return;
    setReviews(prev => ({ ...prev, [trade.id]: "loading" }));
    try {
      const pl    = calcPL(trade, trade.exitPrice);
      const plPct = calcPLPct(trade, trade.exitPrice);
      const res   = await fetch("/api/ai/trade-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:      trade.symbol,
          direction:   trade.direction,
          entryPrice:  trade.entryPrice,
          exitPrice:   trade.exitPrice,
          shares:      trade.shares,
          stopLoss:    trade.stopLoss,
          takeProfit:  trade.takeProfit,
          entryDate:   trade.entryDate,
          exitDate:    trade.exitDate,
          exitReason:  trade.exitReason,
          notes:       trade.notes,
          pl,
          plPct,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReviews(prev => ({ ...prev, [trade.id]: data }));
    } catch {
      setReviews(prev => ({ ...prev, [trade.id]: "error" }));
    }
  }

  function addTrade(t: PaperTrade) {
    const updated = [t, ...trades];
    setTrades(updated);
    saveTrades(updated);
    fetchPrices([t.symbol]);
  }

  function closeTrade(id: string, exitPrice: number, reason: ExitReason) {
    const exitDate = new Date().toISOString();
    const updated = trades.map(t => t.id === id ? {
      ...t, status: "CLOSED" as TradeStatus,
      exitPrice, exitDate, exitReason: reason,
    } : t);
    setTrades(updated);
    saveTrades(updated);
    setClosing(null);
    const trade = trades.find(t => t.id === id);
    if (trade) {
      generateAndSavePaperEntry({
        id:         trade.id,
        symbol:     trade.symbol,
        direction:  trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice,
        shares:     trade.shares,
        stopLoss:   trade.stopLoss,
        takeProfit: trade.takeProfit,
        exitDate,
        exitReason: reason,
      });
    }
  }

  function deleteTrade(id: string) {
    if (!confirm("Delete this trade?")) return;
    const updated = trades.filter(t => t.id !== id);
    setTrades(updated);
    saveTrades(updated);
  }

  function addPosition(p: Position) {
    const updated = [p, ...positions];
    setPositions(updated);
    savePositions(updated);
    setShowAddPosition(false);
  }

  function deletePosition(id: string) {
    if (!confirm("Remove this position?")) return;
    const updated = positions.filter(p => p.id !== id);
    setPositions(updated);
    savePositions(updated);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalUnrealized = open.reduce((s, t) => {
    const p = prices[t.symbol];
    return p != null ? s + calcPL(t, p) : s;
  }, 0);

  const closedPL = closed.reduce((s, t) =>
    t.exitPrice != null ? s + calcPL(t, t.exitPrice) : s, 0);

  const wins    = closed.filter(t => t.exitPrice != null && calcPL(t, t.exitPrice) > 0).length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null;

  const totalPL    = closedPL + totalUnrealized;
  const accountVal = STARTING_CAPITAL + totalPL;

  const stats = [
    { label: "Account Value",  value: `$${accountVal.toFixed(2)}`,                      color: "text-[#F1F5F9]" },
    { label: "Total P&L",      value: fmtMoney(totalPL),                                color: plColor(totalPL) },
    { label: "Open Positions", value: open.length.toString(),                            color: "text-[#F1F5F9]" },
    { label: "Win Rate",       value: winRate != null ? `${winRate}%` : "—",            color: winRate != null ? (winRate >= 50 ? "text-emerald-400" : "text-rose-400") : "text-[#7B8DB4]" },
    { label: "Closed Trades",  value: closed.length.toString(),                          color: "text-[#F1F5F9]" },
    { label: "Realized P&L",   value: closed.length > 0 ? fmtMoney(closedPL) : "—",   color: plColor(closedPL) },
  ];

  // ── Advanced metrics ───────────────────────────────────────────────────────
  const closedWithPL = closed.filter(t => t.exitPrice != null);
  const winTrades    = closedWithPL.filter(t => calcPL(t, t.exitPrice!) > 0);
  const lossTrades   = closedWithPL.filter(t => calcPL(t, t.exitPrice!) < 0);

  const avgWin  = winTrades.length  > 0 ? winTrades.reduce((s, t)  => s + calcPL(t, t.exitPrice!), 0)  / winTrades.length  : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0) / lossTrades.length) : 0;
  const winPct  = closedWithPL.length > 0 ? winTrades.length / closedWithPL.length : 0;
  const lossPct = 1 - winPct;
  const expectancy = closedWithPL.length >= 2 ? (winPct * avgWin) - (lossPct * avgLoss) : null;

  const grossWins    = winTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0);
  const grossLosses  = Math.abs(lossTrades.reduce((s, t) => s + calcPL(t, t.exitPrice!), 0));
  const profitFactor = closedWithPL.length >= 2 && grossLosses > 0 ? grossWins / grossLosses : null;

  const rMultiples = closedWithPL
    .filter(t => t.stopLoss != null)
    .map(t => {
      const risk = Math.abs(t.entryPrice - t.stopLoss!) * t.shares;
      return risk > 0 ? calcPL(t, t.exitPrice!) / risk : null;
    })
    .filter((r): r is number => r !== null);
  const avgR = rMultiples.length > 0 ? rMultiples.reduce((s, r) => s + r, 0) / rMultiples.length : null;

  let maxConsecLosses = 0, curConsec = 0;
  for (const t of [...closedWithPL].reverse()) {
    if (calcPL(t, t.exitPrice!) < 0) { curConsec++; maxConsecLosses = Math.max(maxConsecLosses, curConsec); }
    else curConsec = 0;
  }

  const holdTimes = closedWithPL.filter(t => t.exitDate).map(t => daysBetween(t.entryDate, t.exitDate!));
  const avgHold   = holdTimes.length > 0 ? (holdTimes.reduce((s, d) => s + d, 0) / holdTimes.length) : null;
  const showAdvanced = closedWithPL.length >= 2;

  // ── Real positions helpers ─────────────────────────────────────────────────
  const posStocks  = positions.filter(p => p.positionType === "stock");
  const posOptions = positions.filter(p => p.positionType !== "stock");
  const noStop     = positions.filter(p => !p.stopLoss).length;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {tab === "positions" ? "Real Positions" : "Paper Portfolio"}
              </h1>
              <p className="text-sm text-[#7B8DB4] mt-1">
                {tab === "positions"
                  ? "Log your Robinhood holdings and get AI insights on each one."
                  : "Log trades from TradingView manually — track live P&L, stops & targets."}
              </p>
            </div>
            {tab === "open" || tab === "closed" ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Log Trade
              </button>
            ) : tab === "positions" ? (
              <button
                type="button"
                onClick={() => setShowAddPosition(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Position
              </button>
            ) : null}
          </div>

          {/* Stats grid — only for paper tabs */}
          {(tab === "open" || tab === "closed") && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {stats.map(s => (
                <div key={s.label} className="bg-[#13112A] border border-[#252345] rounded-2xl px-4 py-4">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-medium mb-1">{s.label}</p>
                  <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Advanced performance metrics */}
          {(tab === "open" || tab === "closed") && showAdvanced && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-4">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-4">Performance Metrics</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
                <div>
                  <p className={`text-lg font-black font-mono ${expectancy != null ? plColor(expectancy) : "text-[#7B8DB4]"}`}>
                    {expectancy != null ? `${expectancy >= 0 ? "+" : ""}$${expectancy.toFixed(2)}` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Expectancy / trade</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Van Tharp — avg $ earned per trade. Positive = your system has an edge.</p>
                </div>
                <div>
                  <p className={`text-lg font-black font-mono ${profitFactor != null ? (profitFactor >= 1.5 ? "text-emerald-400" : profitFactor >= 1 ? "text-amber-400" : "text-rose-400") : "text-[#7B8DB4]"}`}>
                    {profitFactor != null ? `${profitFactor.toFixed(2)}x` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Profit Factor</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Total wins ÷ total losses. &gt;1.5 = solid. &gt;2.0 = excellent.</p>
                </div>
                <div>
                  <p className={`text-lg font-black font-mono ${avgR != null ? plColor(avgR) : "text-[#7B8DB4]"}`}>
                    {avgR != null ? `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Avg R-Multiple</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Van Tharp — actual R earned per 1R risked. Only trades with a SL count.</p>
                </div>
                <div>
                  <p className={`text-lg font-black font-mono ${maxConsecLosses >= 4 ? "text-rose-400" : maxConsecLosses >= 2 ? "text-amber-400" : "text-emerald-400"}`}>
                    {maxConsecLosses}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Max Consec. Losses</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Worst losing streak. Know your drawdown tolerance before it hits.</p>
                </div>
                <div>
                  <p className="text-lg font-black font-mono text-[#F1F5F9]">
                    {avgHold != null ? `${avgHold.toFixed(1)}d` : "—"}
                  </p>
                  <p className="text-[10px] text-[#4B5675] font-semibold mt-0.5">Avg Hold Time</p>
                  <p className="text-[9px] text-[#333368] mt-0.5 leading-relaxed">Average days per closed trade. Shorter isn't always better.</p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-[#0D0B1A] border border-[#252345] rounded-xl p-1 w-fit flex-wrap">
            {([
              ["open",      `Open (${open.length})`],
              ["closed",    `Closed (${closed.length})`],
              ["options",   "Options"],
              ["positions", `Real Positions${positions.length > 0 ? ` (${positions.length})` : ""}`],
            ] as const).map(([t, l]) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-[#252345] text-[#F1F5F9]" : "text-[#4B5675] hover:text-[#7B8DB4]"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* ── OPEN POSITIONS ────────────────────────────────────────────── */}
          {tab === "open" && (
            <div className="space-y-3">
              {open.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-16 text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No open positions</p>
                  <p className="text-xs text-[#4B5675] mb-5">Apply a signal from the morning brief in TradingView, then log it here.</p>
                  <button type="button" onClick={() => setShowAdd(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold">
                    Log First Trade →
                  </button>
                </div>
              ) : (
                <>
                  {loadingPrices && (
                    <p className="text-xs text-[#4B5675] flex items-center gap-1.5">
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Refreshing prices…
                    </p>
                  )}
                  {open.map(trade => {
                    const cur   = prices[trade.symbol];
                    const pl    = cur != null ? calcPL(trade, cur)    : null;
                    const plPct = cur != null ? calcPLPct(trade, cur) : null;
                    const cost  = trade.entryPrice * trade.shares;

                    const slDist = trade.stopLoss   != null && cur != null
                      ? Math.abs(cur - trade.stopLoss)   / Math.abs(trade.entryPrice - trade.stopLoss)   * 100 : null;
                    const tpDist = trade.takeProfit != null && cur != null
                      ? Math.abs(cur - trade.takeProfit) / Math.abs(trade.entryPrice - trade.takeProfit) * 100 : null;

                    const atRisk    = trade.stopLoss   != null ? Math.abs(trade.entryPrice - trade.stopLoss)   * trade.shares : null;
                    const potential = trade.takeProfit != null ? Math.abs(trade.entryPrice - trade.takeProfit) * trade.shares : null;
                    const rr        = atRisk && potential ? (potential / atRisk).toFixed(1) : null;
                    const days      = daysBetween(trade.entryDate, new Date().toISOString());

                    return (
                      <div key={trade.id} className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                        <div className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${trade.direction === "LONG" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                {trade.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-lg font-black tracking-tight">{trade.symbol}</p>
                                  <Link href={`/analysis?symbol=${encodeURIComponent(trade.symbol)}`}
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-semibold">
                                    Analyse →
                                  </Link>
                                </div>
                                <p className="text-xs text-[#4B5675]">
                                  {trade.shares} shares @ ${trade.entryPrice.toFixed(2)} · ${cost.toFixed(2)} cost · {days}d ago
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xl font-black font-mono">
                                {cur != null ? `$${cur.toFixed(2)}` : <span className="text-[#4B5675] text-base">loading…</span>}
                              </p>
                              {pl !== null && plPct !== null && (
                                <p className={`text-sm font-bold font-mono ${plColor(pl)}`}>
                                  {fmtMoney(pl)} · {fmtPct(plPct)}
                                </p>
                              )}
                            </div>
                          </div>

                          {(trade.stopLoss != null || trade.takeProfit != null) && (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {trade.stopLoss != null && (
                                <div>
                                  <div className="flex justify-between text-[10px] text-[#4B5675] mb-1">
                                    <span>Stop Loss</span>
                                    <span className="text-rose-400 font-mono font-bold">${trade.stopLoss.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#252345] rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500/60 rounded-full transition-all"
                                      style={{ width: `${Math.min(slDist ?? 0, 100)}%` }} />
                                  </div>
                                </div>
                              )}
                              {trade.takeProfit != null && (
                                <div>
                                  <div className="flex justify-between text-[10px] text-[#4B5675] mb-1">
                                    <span>Take Profit {rr && <span className="text-emerald-400">{rr}:1 R:R</span>}</span>
                                    <span className="text-emerald-400 font-mono font-bold">${trade.takeProfit.toFixed(2)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#252345] rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500/60 rounded-full transition-all"
                                      style={{ width: `${Math.min(tpDist ?? 0, 100)}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {trade.notes && (
                            <p className="mt-3 text-xs text-[#7B8DB4] italic">"{trade.notes}"</p>
                          )}

                          <div className="flex items-center gap-2 mt-4">
                            <button type="button" onClick={() => setClosing(trade)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 rounded-xl text-xs font-bold">
                              Close Position
                            </button>
                            <button type="button" onClick={() => deleteTrade(trade.id)}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4B5675] hover:text-rose-400 border border-[#252345] hover:border-rose-500/30 transition-all">
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── CLOSED TRADES ────────────────────────────────────────────── */}
          {tab === "closed" && (
            <div>
              {closed.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-16 text-center">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No closed trades yet</p>
                  <p className="text-xs text-[#4B5675]">Closed positions will appear here with full P&amp;L breakdown.</p>
                </div>
              ) : (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-[#252345] text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">
                    <span className="col-span-2">Trade</span>
                    <span className="text-right">Entry</span>
                    <span className="text-right">Exit</span>
                    <span className="text-right">P&amp;L</span>
                    <span className="text-right">Result</span>
                  </div>
                  <div className="divide-y divide-[#252345]">
                    {closed.map(trade => {
                      const pl    = trade.exitPrice != null ? calcPL(trade, trade.exitPrice) : 0;
                      const plPct = trade.exitPrice != null ? calcPLPct(trade, trade.exitPrice) : 0;
                      const won   = pl > 0;
                      const days  = trade.exitDate ? daysBetween(trade.entryDate, trade.exitDate) : 0;
                      const review = reviews[trade.id];

                      return (
                        <div key={trade.id} className="divide-y divide-[#252345]">
                          <div className="grid grid-cols-6 gap-2 px-5 py-4 items-center hover:bg-[#1A1838]/50 transition-colors">
                            <div className="col-span-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${trade.direction === "LONG" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                  {trade.direction}
                                </span>
                                <p className="text-sm font-bold">{trade.symbol}</p>
                              </div>
                              <p className="text-[10px] text-[#4B5675] mt-0.5">{trade.shares} shares · {days}d</p>
                              {trade.exitReason && trade.exitReason !== "manual" && (
                                <span className={`text-[9px] font-semibold ${trade.exitReason === "target_hit" ? "text-emerald-400" : "text-rose-400"}`}>
                                  {trade.exitReason === "target_hit" ? "🎯 Target hit" : "🛑 Stop hit"}
                                </span>
                              )}
                            </div>
                            <p className="text-right text-xs font-mono text-[#7B8DB4]">${trade.entryPrice.toFixed(2)}</p>
                            <p className="text-right text-xs font-mono text-[#7B8DB4]">${trade.exitPrice?.toFixed(2) ?? "—"}</p>
                            <div className="text-right">
                              <p className={`text-sm font-black font-mono ${plColor(pl)}`}>{fmtMoney(pl)}</p>
                              <p className={`text-[10px] font-mono ${plColor(pl)}`}>{fmtPct(plPct)}</p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1.5">
                              <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${won ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                                {won ? "WIN" : "LOSS"}
                              </span>
                              <button type="button" onClick={() => fetchReview(trade)}
                                disabled={review === "loading"}
                                className="text-[9px] font-semibold text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors flex items-center gap-1">
                                {review === "loading" ? (
                                  <><svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>AI…</>
                                ) : (
                                  <>{review && typeof review === "object" ? "↺ Re-review" : "✦ AI Review"}</>
                                )}
                              </button>
                              <button type="button" onClick={() => deleteTrade(trade.id)}
                                className="text-[9px] text-[#4B5675] hover:text-rose-400 transition-colors">
                                delete
                              </button>
                            </div>
                          </div>

                          {review && review !== "loading" && (
                            <div className={`px-5 py-4 space-y-3 ${review === "error" ? "bg-rose-500/5" : "bg-violet-500/5"}`}>
                              {review === "error" ? (
                                <p className="text-xs text-rose-400">AI review failed — tap ✦ AI Review to retry.</p>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-violet-400 text-xs">✦</span>
                                    <p className="text-xs font-bold text-violet-300">Multi-Framework AI Review</p>
                                  </div>
                                  <p className="text-xs text-[#94A3B8] leading-relaxed">{review.summary}</p>
                                  {review.frameworks && (
                                    <div className="space-y-2">
                                      {([
                                        ["Market Structure", review.frameworks.ict,      review.frameworks.ict?.points],
                                        ["Wyckoff",          review.frameworks.wyckoff,  review.frameworks.wyckoff?.points],
                                        ["Risk Mgmt",        review.frameworks.risk,     review.frameworks.risk?.points],
                                      ] as [string, { verdict: string; points?: string[] } | undefined, string[] | undefined][]).map(([name, fw, pts]) => fw && (
                                        <div key={name} className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">{name}</p>
                                          <p className="text-[11px] text-[#94A3B8]">{fw.verdict}</p>
                                          {pts && pts.length > 0 && (
                                            <ul className="mt-1 space-y-0.5">
                                              {pts.map((p, i) => <li key={i} className="text-[10px] text-[#4B5675] flex gap-1.5"><span className="shrink-0">·</span>{p}</li>)}
                                            </ul>
                                          )}
                                        </div>
                                      ))}
                                      {review.frameworks.rMultiple && (
                                        <div className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <div className="flex items-center gap-2 mb-1">
                                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Van Tharp R-Multiple</p>
                                            <span className={`text-xs font-black font-mono ${plColor(parseFloat(review.frameworks.rMultiple.achieved) || 0)}`}>{review.frameworks.rMultiple.achieved}</span>
                                          </div>
                                          <p className="text-[11px] text-[#94A3B8]">{review.frameworks.rMultiple.verdict}</p>
                                        </div>
                                      )}
                                      {review.frameworks.douglas && (
                                        <div className="bg-[#0D0B1A] rounded-xl px-3 py-2.5">
                                          <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">Mark Douglas — Psychology</p>
                                          <p className="text-[11px] text-[#94A3B8]">{review.frameworks.douglas.verdict}</p>
                                          {review.frameworks.douglas.point && <p className="text-[10px] text-[#4B5675] mt-0.5">· {review.frameworks.douglas.point}</p>}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {review.strengths && review.strengths.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5">What you did right</p>
                                      <ul className="space-y-1">
                                        {review.strengths.map((s, i) => (
                                          <li key={i} className="text-xs text-[#94A3B8] flex gap-2">
                                            <span className="text-emerald-400 shrink-0">✓</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {review.mistakes && review.mistakes.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1.5">What went wrong</p>
                                      <ul className="space-y-1">
                                        {review.mistakes.map((m, i) => (
                                          <li key={i} className="text-xs text-[#94A3B8] flex gap-2">
                                            <span className="text-rose-400 shrink-0">✕</span>{m}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div className="border border-violet-500/20 bg-violet-500/10 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">Key lesson</p>
                                    <p className="text-xs text-[#F1F5F9] leading-relaxed">{review.lesson}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── OPTIONS ANALYSIS ─────────────────────────────────────────── */}
          {tab === "options" && <OptionsTab />}

          {/* ── REAL POSITIONS ────────────────────────────────────────────── */}
          {tab === "positions" && (
            <div className="space-y-4 max-w-3xl">
              {/* No-stop warning */}
              {noStop > 0 && positions.length > 0 && (
                <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-amber-400/80 leading-relaxed">
                    <strong className="text-amber-400">{noStop} position{noStop > 1 ? "s" : ""} without a stop loss.</strong>{" "}
                    Click "Get AI Insight" — the AI will recommend a specific stop level based on market structure.
                  </p>
                </div>
              )}

              {/* Empty state */}
              {positions.length === 0 && (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#0D0B1A] border border-[#252345] flex items-center justify-center mx-auto mb-4">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4B5675" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  </div>
                  <h2 className="text-base font-bold text-[#F1F5F9] mb-1">No positions yet</h2>
                  <p className="text-sm text-[#4B5675] mb-5">Add your Robinhood positions to get AI insights on each one.</p>
                  <button type="button" onClick={() => setShowAddPosition(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold">
                    Add First Position
                  </button>
                </div>
              )}

              {/* Stocks */}
              {posStocks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">
                    Stocks · {posStocks.length}
                  </p>
                  <div className="space-y-3">
                    {posStocks.map(p => (
                      <PositionCard key={p.id} pos={p} onDelete={deletePosition} />
                    ))}
                  </div>
                </div>
              )}

              {/* Options */}
              {posOptions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">
                    Options · {posOptions.length}
                  </p>
                  <div className="space-y-3">
                    {posOptions.map(p => (
                      <PositionCard key={p.id} pos={p} onDelete={deletePosition} />
                    ))}
                  </div>
                </div>
              )}

              {positions.length > 0 && (
                <p className="text-center text-[11px] text-[#333368] pt-2">
                  Positions saved locally · For educational use only · Not financial advice
                </p>
              )}
            </div>
          )}

        </main>
      </div>

      {showAdd && <AddTradeModal onAdd={addTrade} initial={addInitial} onClose={() => { setShowAdd(false); setAddInitial(undefined); }} />}
      {closing && (
        <CloseModal
          trade={closing}
          currentPrice={prices[closing.symbol] ?? null}
          onClose={() => setClosing(null)}
          onConfirm={(ep, reason) => closeTrade(closing.id, ep, reason)}
        />
      )}
      {showAddPosition && <AddPositionModal onClose={() => setShowAddPosition(false)} onAdd={addPosition} />}
    </div>
  );
}

export default function PaperPage() {
  return (
    <PaywallGuard>
      <Suspense>
        <PaperPortfolio />
      </Suspense>
    </PaywallGuard>
  );
}
