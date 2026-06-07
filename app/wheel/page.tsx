"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { scopedKey } from "../lib/userState";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanResult = {
  symbol:       string;
  price:        number;
  changePct:    number;
  signal?:      "BUY" | "SELL";
  confidence?:  "High" | "Medium" | "Low";
  iv:           number | null;
  expiry:       string | null;
  putWall?:     number | null;
  premiumEst?:  string | null;
  score:        number;
  // wheel-scan specific
  atmIV?:       number | null;
  premiumPct?:  number | null;
  strike?:      number;
  wheelScore?:  number;
  verdict?:     string;
  pos52?:       number;
};

type WheelStage = "CSP" | "ASSIGNED" | "CC" | "CLOSED";

type WheelPosition = {
  id:              string;
  symbol:          string;
  stage:           WheelStage;
  strike:          number;
  expiry:          string;
  premiumReceived: number;
  quantity:        number;
  openDate:        string;
  notes:           string;
  ccStrike?:       number;
  ccExpiry?:       string;
  ccPremium?:      number;
  totalPremium?:   number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function wheelScore(item: ScanResult): number {
  let s = 0;
  if (item.iv) {
    if (item.iv >= 30 && item.iv <= 70) s += 40;
    else if (item.iv > 70)               s += 20;
    else if (item.iv >= 20)              s += 25;
    else                                 s += 5;
  }
  if (item.signal === "BUY")            s += 30;
  else                                  s += 10;
  if (item.confidence === "High")       s += 20;
  else if (item.confidence === "Medium") s += 10;
  s += Math.min(item.score / 6, 10);
  return Math.min(Math.round(s), 100);
}

function thirtyDeltaStrike(price: number, iv: number): number {
  const T = 30 / 365;
  return price * Math.exp(-0.52 * (iv / 100) * Math.sqrt(T));
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function scoreColor(s: number): string {
  if (s >= 75) return "text-emerald-400";
  if (s >= 50) return "text-amber-400";
  return "text-[#4B5675]";
}

const STAGE_META: Record<WheelStage, { label: string; color: string; next: WheelStage | null; nextLabel: string }> = {
  CSP:      { label: "Selling Put",    color: "text-sky-400 bg-sky-500/10 border-sky-500/25",      next: "ASSIGNED", nextLabel: "Mark Assigned"  },
  ASSIGNED: { label: "Shares Owned",   color: "text-amber-400 bg-amber-500/10 border-amber-500/25", next: "CC",       nextLabel: "Sell Call"       },
  CC:       { label: "Selling Call",   color: "text-violet-400 bg-violet-500/10 border-violet-500/25", next: "CLOSED", nextLabel: "Close / Called Away" },
  CLOSED:   { label: "Closed",         color: "text-[#4B5675] bg-white/[0.03] border-white/[0.06]", next: null,     nextLabel: ""               },
};

const STORAGE_KEY = "wheel_positions";

function loadPositions(): WheelPosition[] {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)) ?? "[]");
  } catch { return []; }
}
function savePositions(positions: WheelPosition[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(positions));
}

// ── Scanner card ──────────────────────────────────────────────────────────────

function ScannerRow({
  item,
  onAdd,
}: {
  item: ScanResult & { wheelScore: number };
  onAdd: (item: ScanResult) => void;
}) {
  const strike30 = item.iv ? thirtyDeltaStrike(item.price, item.iv) : null;
  const ivColor  = !item.iv         ? "text-[#4B5675]"
                 : item.iv >= 30    ? "text-emerald-400"
                 : item.iv >= 20    ? "text-amber-400"
                 :                    "text-[#4B5675]";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#252345] last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Symbol + change */}
      <div className="w-20 shrink-0 text-center">
        <p className="text-sm font-bold text-[#F1F5F9] font-mono">{item.symbol}</p>
        <p className={`text-[11px] font-medium ${item.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {item.changePct >= 0 ? "+" : ""}{fmt(item.changePct, 1)}%
        </p>
      </div>

      {/* Price */}
      <div className="w-20 shrink-0 text-center">
        <p className="text-sm font-semibold text-[#F1F5F9]">${fmt(item.price)}</p>
        <p className="text-[10px] text-[#4B5675]">price</p>
      </div>

      {/* IV */}
      <div className="w-16 shrink-0 text-center hidden sm:block">
        <p className={`text-sm font-semibold ${ivColor}`}>
          {item.iv ? `${fmt(item.iv, 0)}%` : "—"}
        </p>
        <p className="text-[10px] text-[#4B5675]">IV</p>
      </div>

      {/* ~30Δ Strike */}
      <div className="w-20 shrink-0 text-center hidden md:block">
        <p className="text-sm font-semibold text-[#F1F5F9]">
          {strike30 ? `$${fmt(strike30, 0)}` : "—"}
        </p>
        <p className="text-[10px] text-[#4B5675]">~30Δ put</p>
      </div>

      {/* Premium est */}
      <div className="w-28 shrink-0 text-center hidden lg:block">
        <p className="text-sm font-semibold text-emerald-400">
          {item.premiumEst ?? "—"}
        </p>
        <p className="text-[10px] text-[#4B5675]">premium est</p>
      </div>

      {/* Expiry */}
      <div className="w-16 shrink-0 text-center hidden lg:block">
        <p className="text-sm text-[#7B8DB4]">{item.expiry ?? "—"}</p>
        <p className="text-[10px] text-[#4B5675]">expiry</p>
      </div>

      {/* Score + verdict + button */}
      <div className="flex items-center justify-center gap-2 shrink-0">
        <div className="text-center hidden sm:block">
          <p className={`text-sm font-bold ${scoreColor(item.wheelScore)}`}>{item.wheelScore}</p>
          <p className="text-[10px] text-[#4B5675]">{item.verdict ?? "score"}</p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(item)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/30 transition-colors shrink-0"
        >
          Track
        </button>
      </div>
    </div>
  );
}

// ── Add position modal ────────────────────────────────────────────────────────

function AddModal({
  prefill,
  onSave,
  onClose,
}: {
  prefill: Partial<WheelPosition> | null;
  onSave: (p: WheelPosition) => void;
  onClose: () => void;
}) {
  const [symbol,   setSymbol]   = useState(prefill?.symbol   ?? "");
  const [strike,   setStrike]   = useState(prefill?.strike   ? String(prefill.strike) : "");
  const [expiry,   setExpiry]   = useState(prefill?.expiry   ?? "");
  const [premium,  setPremium]  = useState(prefill?.premiumReceived ? String(prefill.premiumReceived) : "");
  const [qty,      setQty]      = useState(prefill?.quantity  ? String(prefill.quantity) : "1");
  const [notes,    setNotes]    = useState(prefill?.notes     ?? "");

  function handleSave() {
    if (!symbol || !strike || !expiry || !premium) return;
    const position: WheelPosition = {
      id:              Date.now().toString(),
      symbol:          symbol.toUpperCase(),
      stage:           "CSP",
      strike:          parseFloat(strike),
      expiry,
      premiumReceived: parseFloat(premium),
      quantity:        parseInt(qty) || 1,
      openDate:        new Date().toISOString().slice(0, 10),
      notes,
      totalPremium:    parseFloat(premium) * (parseInt(qty) || 1) * 100,
    };
    onSave(position);
  }

  const inputCls = "w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2 text-sm text-[#F1F5F9] placeholder:text-[#4B5675] outline-none focus:border-emerald-500/50 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-[#13112A] border border-[#252345] rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-bold text-[#F1F5F9] flex-1 text-center">Add Wheel Position</p>
          <button type="button" onClick={onClose} className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Symbol</label>
            <input className={inputCls} placeholder="NVDA" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Put Strike ($)</label>
              <input className={inputCls} placeholder="130" type="number" value={strike} onChange={e => setStrike(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Expiry</label>
              <input className={inputCls} placeholder="Jun 20" value={expiry} onChange={e => setExpiry(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Premium / share ($)</label>
              <input className={inputCls} placeholder="2.50" type="number" step="0.01" value={premium} onChange={e => setPremium(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Contracts</label>
              <input className={inputCls} placeholder="1" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#4B5675] uppercase tracking-wider mb-1 block">Notes (optional)</label>
            <input className={inputCls} placeholder="Why I like this wheel..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#252345] text-[#7B8DB4] text-sm font-semibold hover:border-[#333368] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave}
            disabled={!symbol || !strike || !expiry || !premium}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Position card ─────────────────────────────────────────────────────────────

function PositionCard({
  pos,
  onAdvance,
  onDelete,
}: {
  pos: WheelPosition;
  onAdvance: (id: string) => void;
  onDelete:  (id: string) => void;
}) {
  const meta = STAGE_META[pos.stage];
  const totalPremium = pos.totalPremium ?? pos.premiumReceived * pos.quantity * 100;

  return (
    <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4">
      <div className="flex flex-col items-center gap-1 mb-3 relative">
        <div className="flex items-center justify-center gap-2">
          <p className="text-base font-bold text-[#F1F5F9] font-mono">{pos.symbol}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-[11px] text-[#4B5675]">{pos.openDate}</p>
        <button type="button" onClick={() => onDelete(pos.id)}
          className="absolute top-0 right-0 text-[#4B5675] hover:text-rose-400 transition-colors p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-[#13112A] rounded-xl p-2.5 text-center">
          <p className="text-sm font-bold text-[#F1F5F9]">${pos.strike}</p>
          <p className="text-[10px] text-[#4B5675]">Strike</p>
        </div>
        <div className="bg-[#13112A] rounded-xl p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-400">${fmt(pos.premiumReceived, 2)}</p>
          <p className="text-[10px] text-[#4B5675]">Premium / sh</p>
        </div>
        <div className="bg-[#13112A] rounded-xl p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-400">${totalPremium}</p>
          <p className="text-[10px] text-[#4B5675]">Total collected</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-[11px] text-[#4B5675] mb-3">
        <span>Expiry: <span className="text-[#7B8DB4]">{pos.expiry}</span></span>
        <span>{pos.quantity} contract{pos.quantity > 1 ? "s" : ""}</span>
      </div>

      {pos.notes && (
        <p className="text-[11px] text-[#4B5675] italic mb-3 line-clamp-2 text-center">"{pos.notes}"</p>
      )}

      {/* Stage pipeline */}
      <div className="flex items-center gap-1 mb-4">
        {(["CSP", "ASSIGNED", "CC", "CLOSED"] as WheelStage[]).map((s, i) => {
          const stages: WheelStage[] = ["CSP", "ASSIGNED", "CC", "CLOSED"];
          const current = stages.indexOf(pos.stage);
          const idx = i;
          const done = idx < current;
          const active = idx === current;
          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`flex-1 h-1 rounded-full transition-colors ${done || active ? "bg-emerald-500" : "bg-[#252345]"}`} />
              {i === 3 && <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400" : done ? "bg-emerald-500" : "bg-[#252345]"}`} />}
            </div>
          );
        })}
      </div>

      {meta.next && (
        <button type="button" onClick={() => onAdvance(pos.id)}
          className="w-full py-2 rounded-xl border border-[#252345] hover:border-emerald-500/40 text-[#7B8DB4] hover:text-emerald-400 text-xs font-semibold transition-all">
          {meta.nextLabel} →
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "scanner" | "mywheel";
type Filter = "all" | "highiv" | "bullish";

export default function WheelPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const [tab,       setTab]       = useState<Tab>("scanner");
  const [filter,    setFilter]    = useState<Filter>("all");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [results,   setResults]   = useState<(ScanResult & { wheelScore: number })[]>([]);
  const [positions, setPositions] = useState<WheelPosition[]>([]);
  const [modal,     setModal]     = useState<Partial<WheelPosition> | null | false>(false);

  // Load scanner data
  const loadScan = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/market/wheel-scan");
      const data = await res.json() as { candidates?: (ScanResult & { wheelScore: number })[] };
      if (!data.candidates) throw new Error("No data");
      // wheel-scan returns properly scored candidates — map IV field
      const enriched = data.candidates.map(c => ({
        ...c,
        iv: c.atmIV ?? null,
        expiry: c.expiry ?? null,
        premiumEst: c.premiumPct != null ? `~${c.premiumPct}% / ${c.expiry ?? "exp"}` : null,
        wheelScore: c.wheelScore ?? wheelScore(c),
      }));
      setResults(enriched);
    } catch {
      setError("Could not load scanner. Try again.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (tab === "scanner") loadScan();
  }, [tab, loadScan]);

  // Load positions from localStorage
  useEffect(() => {
    setPositions(loadPositions());
  }, []);

  function saveAndSet(updated: WheelPosition[]) {
    savePositions(updated);
    setPositions(updated);
  }

  function handleAdd(item?: ScanResult) {
    setModal(item ? {
      symbol:  item.symbol,
      strike:  item.iv ? Math.round(thirtyDeltaStrike(item.price, item.iv)) : Math.round(item.price * 0.95),
      expiry:  item.expiry ?? "",
      premiumReceived: item.premiumEst
        ? parseFloat(item.premiumEst.replace(/[^0-9.]/g, "")) / 100
        : 0,
    } : {});
  }

  function handleSave(pos: WheelPosition) {
    saveAndSet([...positions, pos]);
    setModal(false);
    setTab("mywheel");
  }

  function handleAdvance(id: string) {
    const stages: WheelStage[] = ["CSP", "ASSIGNED", "CC", "CLOSED"];
    saveAndSet(positions.map(p => {
      if (p.id !== id) return p;
      const next = stages[stages.indexOf(p.stage) + 1];
      return { ...p, stage: next ?? "CLOSED" };
    }));
  }

  function handleDelete(id: string) {
    saveAndSet(positions.filter(p => p.id !== id));
  }

  const filtered = results.filter(r => {
    if (filter === "highiv")  return r.iv != null && r.iv >= 30;
    if (filter === "bullish") return r.signal === "BUY";
    return true;
  });

  const openPositions   = positions.filter(p => p.stage !== "CLOSED");
  const closedPositions = positions.filter(p => p.stage === "CLOSED");
  const totalCollected  = positions.reduce((s, p) => s + (p.totalPremium ?? 0), 0);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0B1A]">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    );
  }

  return (
      <div className="flex flex-col min-h-screen bg-[#0D0B1A] text-[#F1F5F9]">
        <Topbar />
        <div className="flex flex-1 pb-24">
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">

            {/* Header */}
            <div className="mb-6 text-center">
              <div className="flex items-center justify-center gap-2.5 mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                <h1 className="text-xl font-black text-[#F1F5F9]">Wheeling Hub</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 uppercase tracking-wider">New</span>
              </div>
              <p className="text-sm text-[#4B5675]">
                Scanner finds high-premium put candidates — track every wheel position end-to-end.
              </p>
            </div>

            {/* Stats bar (My Wheel summary) */}
            {positions.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-[#F1F5F9]">{openPositions.length}</p>
                  <p className="text-[11px] text-[#4B5675] mt-0.5">Open positions</p>
                </div>
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-emerald-400">${totalCollected.toLocaleString()}</p>
                  <p className="text-[11px] text-[#4B5675] mt-0.5">Total premium collected</p>
                </div>
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-[#F1F5F9]">{closedPositions.length}</p>
                  <p className="text-[11px] text-[#4B5675] mt-0.5">Completed wheels</p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center justify-center gap-1 bg-[#13112A] border border-[#252345] rounded-2xl p-1 mb-5 w-fit mx-auto">
              {([
                { id: "scanner", label: "Scanner" },
                { id: "mywheel", label: `My Wheel${positions.length > 0 ? ` (${openPositions.length})` : ""}` },
              ] as { id: Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    tab === t.id
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                      : "text-[#4B5675] hover:text-[#7B8DB4]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Scanner tab ── */}
            {tab === "scanner" && (
              <div>
                {/* Filters + refresh */}
                <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                  {([
                    { id: "all",     label: "All" },
                    { id: "highiv",  label: "High IV" },
                    { id: "bullish", label: "Bullish" },
                  ] as { id: Filter; label: string }[]).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        filter === f.id
                          ? "bg-[#252345] border-[#333368] text-[#F1F5F9]"
                          : "border-[#252345] text-[#4B5675] hover:text-[#7B8DB4]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={loadScan}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#252345] text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors disabled:opacity-50"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={loading ? "animate-spin" : ""}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Refresh
                  </button>
                </div>

                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-[#4B5675] uppercase tracking-wider border-b border-[#252345]">
                  <span className="w-20 shrink-0 text-center">Symbol</span>
                  <span className="w-20 shrink-0 text-center">Price</span>
                  <span className="w-16 shrink-0 text-center hidden sm:block">IV</span>
                  <span className="w-20 shrink-0 text-center hidden md:block">~30Δ Put</span>
                  <span className="w-28 shrink-0 text-center hidden lg:block">Premium est.</span>
                  <span className="w-16 shrink-0 text-center hidden lg:block">Expiry</span>
                  <span className="ml-auto shrink-0 flex items-center justify-center gap-2">
                    <span className="hidden sm:block">Score</span>
                    <span className="w-16" />
                  </span>
                </div>

                {/* Rows */}
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                  {loading && (
                    <div className="flex items-center justify-center py-16 gap-3">
                      <svg className="animate-spin text-emerald-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      <p className="text-sm text-[#4B5675]">Scanning universe…</p>
                    </div>
                  )}

                  {!loading && error && (
                    <div className="py-12 text-center">
                      <p className="text-sm text-rose-400 mb-3">{error}</p>
                      <button type="button" onClick={loadScan}
                        className="text-xs text-[#4B5675] hover:text-[#7B8DB4] underline">Retry</button>
                    </div>
                  )}

                  {!loading && !error && filtered.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-sm text-[#4B5675]">No candidates found with this filter.</p>
                    </div>
                  )}

                  {!loading && !error && filtered.map(item => (
                    <ScannerRow key={item.symbol} item={item} onAdd={handleAdd} />
                  ))}
                </div>

                {!loading && !error && filtered.length > 0 && (
                  <p className="text-[10px] text-[#4B5675] mt-3 text-center">
                    Showing {filtered.length} candidates. IV and premium estimates from Yahoo Finance options chain. Not financial advice.
                  </p>
                )}

                {/* Manual add */}
                <button
                  type="button"
                  onClick={() => handleAdd()}
                  className="mt-4 w-full py-3 rounded-2xl border border-dashed border-[#252345] hover:border-emerald-500/30 text-[#4B5675] hover:text-emerald-400 text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Track a position manually
                </button>
              </div>
            )}

            {/* ── My Wheel tab ── */}
            {tab === "mywheel" && (
              <div>
                <div className="flex flex-col items-center gap-3 mb-5">
                  <p className="text-sm text-[#4B5675] text-center">
                    {openPositions.length === 0 ? "No open positions yet." : `${openPositions.length} active position${openPositions.length > 1 ? "s" : ""}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAdd()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/30 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add position
                  </button>
                </div>

                {positions.length === 0 ? (
                  <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No wheel positions yet</p>
                    <p className="text-xs text-[#4B5675] mb-4">Use the Scanner to find candidates, then click Track to start following a wheel.</p>
                    <button type="button" onClick={() => setTab("scanner")}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">
                      Open Scanner
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {openPositions.length > 0 && (
                      <>
                        <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-bold text-center">Active</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {openPositions.map(p => (
                            <PositionCard key={p.id} pos={p} onAdvance={handleAdvance} onDelete={handleDelete} />
                          ))}
                        </div>
                      </>
                    )}
                    {closedPositions.length > 0 && (
                      <>
                        <p className="text-[10px] text-[#4B5675] uppercase tracking-wider font-bold mt-6 text-center">Completed</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {closedPositions.map(p => (
                            <PositionCard key={p.id} pos={p} onAdvance={handleAdvance} onDelete={handleDelete} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

          </main>
        </div>
        <Sidebar />

        {/* Add position modal */}
        {modal !== false && (
          <AddModal
            prefill={modal}
            onSave={handleSave}
            onClose={() => setModal(false)}
          />
        )}
      </div>
  );
}
