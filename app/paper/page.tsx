"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Link from "next/link";
import { scopedKey } from "../lib/userState";
import { haptic } from "../lib/haptics";

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

// ── Position Sizer Component ──────────────────────────────────────────────────

function PositionSizer({
  initSymbol, initEntry, initSignal,
  account, onTaken,
}: {
  initSymbol?: string; initEntry?: string;
  initSignal?: "BUY" | "SELL";
  account: { size: number; riskPct: number };
  onTaken: (t: TakenTrade) => void;
}) {
  const [symbol, setSymbol] = useState(initSymbol ?? "");
  const [signal, setSignal] = useState<"BUY" | "SELL">(initSignal ?? "BUY");
  const [entry,  setEntry]  = useState(initEntry  ?? "");
  const [stop,   setStop]   = useState("");
  const [target, setTarget] = useState("");
  const [note,   setNote]   = useState("");
  const [saved,  setSaved]  = useState(false);

  useEffect(() => { if (initSymbol) setSymbol(initSymbol); }, [initSymbol]);
  useEffect(() => { if (initSignal) setSignal(initSignal); }, [initSignal]);
  useEffect(() => { if (initEntry)  setEntry(initEntry);   }, [initEntry]);

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
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL"
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
          {saved ? "✓ Trade Logged!" : `Log ${signal === "BUY" ? "Long" : "Short"} Trade →`}
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

  const [account, setAccount]           = useState<{ size: number; riskPct: number }>({ size: 10000, riskPct: 1 });
  const [editingAccount, setEditing]    = useState(false);
  const [accountInput, setAccountInput] = useState("10000");
  const [riskInput, setRiskInput]       = useState("1");
  const [signals, setSignals]           = useState<Signal[]>([]);
  const [taken, setTaken]               = useState<TakenTrade[]>([]);
  const [sizerSignal, setSizerSignal]   = useState<Signal | null>(null);

  const initSymbol = params.get("symbol") ?? "";
  const initSignal = (params.get("side") as "BUY" | "SELL" | null) ?? "BUY";

  useEffect(() => {
    const acc = loadAccount();
    if (acc) { setAccount(acc); setAccountInput(String(acc.size)); setRiskInput(String(acc.riskPct)); }
    const raw = JSON.parse(localStorage.getItem(scopedKey("traxora_alerts")) ?? "[]") as Signal[];
    setSignals(raw.filter(s => s.signal === "BUY" || s.signal === "SELL").slice(0, 12));
    setTaken(loadTaken());
  }, []);

  function saveAccountSettings() {
    const size    = parseFloat(accountInput.replace(/[^0-9.]/g, ""));
    const riskPct = parseFloat(riskInput.replace(/[^0-9.]/g, ""));
    if (!size || !riskPct || size <= 0 || riskPct <= 0) return;
    const v = { size, riskPct };
    setAccount(v); saveAccount(v); setEditing(false);
  }

  const handleTaken = useCallback((t: TakenTrade) => {
    setTaken(prev => { const next = [t, ...prev]; saveTaken(next); return next; });
  }, []);

  function removeTaken(id: string) {
    setTaken(prev => { const next = prev.filter(t => t.id !== id); saveTaken(next); return next; });
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient flex-1 p-3 sm:p-4 xl:p-5 pb-32 page-enter">
        <Topbar />
        <div className="max-w-7xl mx-auto w-full mt-3 space-y-4">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="reveal section-header text-3xl font-black tracking-tight text-gradient-green">Trade Planner</h1>
              <p className="text-sm text-[#7B8DB4] mt-1">Turn signals into real position sizes — know exactly how many shares before you enter</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/journal" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-3 py-2 rounded-xl transition-all">Journal →</Link>
              <Link href="/history" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-3 py-2 rounded-xl transition-all">History →</Link>
            </div>
          </div>

          {/* Account card */}
          <div className="card-shine glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
            {!editingAccount ? (
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-8 flex-wrap">
                  {[
                    { label: "Account Size",           val: fmtD(account.size),                              color: "text-[#F1F5F9]" },
                    { label: "Risk / Trade",            val: `${account.riskPct}% · ${fmtD((account.size * account.riskPct)/100)}`, color: "text-rose-400" },
                    { label: "Max Daily (3 trades)",    val: fmtD((account.size * account.riskPct * 3)/100),  color: "text-amber-400" },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold mb-0.5">{s.label}</p>
                      <p className={`text-xl font-black font-mono ${s.color}`}>{s.val}</p>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setEditing(true)}
                  className="text-xs text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] px-4 py-2 rounded-xl transition-all">
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold block mb-1.5">Account Size ($)</label>
                  <input value={accountInput} onChange={e => setAccountInput(e.target.value)} placeholder="10000"
                    className="bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2 text-sm font-mono text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50 w-36" />
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

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Sizer */}
            <PositionSizer
              initSymbol={sizerSignal ? sizerSignal.symbol.replace(".US","").replace(".COMM","") : initSymbol}
              initSignal={sizerSignal?.signal ?? initSignal}
              initEntry={sizerSignal ? sizerSignal.price.toFixed(2) : ""}
              account={account}
              onTaken={handleTaken}
            />

            {/* Recent signals */}
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Recent Signals — tap to load</p>
              {signals.length === 0 ? (
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-10 text-center space-y-3">
                  <p className="text-3xl">⚡</p>
                  <p className="text-sm font-semibold text-[#7B8DB4]">No signals yet</p>
                  <p className="text-xs text-[#4B5675]">Run an analysis to generate your first signal</p>
                  <Link href="/analysis" className="inline-block mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all">
                    Go to Signals →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {signals.map((s, i) => {
                    const ticker = s.symbol.replace(".US","").replace(".COMM","");
                    const active = sizerSignal?.symbol === s.symbol && sizerSignal?.time === s.time;
                    return (
                      <button key={i} type="button" onClick={() => setSizerSignal(active ? null : s)}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                          active
                            ? "bg-emerald-500/8 border-emerald-500/30"
                            : "bg-[#13112A] border-[#252345] hover:border-[#333368]"
                        }`}>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ${
                          s.signal === "BUY"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                        }`}>{s.signal}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{ticker}</p>
                          <p className="text-[10px] text-[#4B5675] truncate">{s.name || ticker} · {ago(s.time)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-mono font-bold">${s.price.toFixed(2)}</p>
                          <p className={`text-[9px] font-semibold ${
                            s.confidence === "High" ? "text-emerald-400" : s.confidence === "Medium" ? "text-amber-400" : "text-rose-400"
                          }`}>{s.confidence}</p>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "#34D399" : "#4B5675"} strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Logged trades */}
          {taken.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#4B5675]">Logged Trades ({taken.length})</p>
              <div className="space-y-2">
                {taken.map(t => (
                  <div key={t.id} className="card-shine glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${
                        t.signal === "BUY"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                      }`}>{t.signal}</span>
                      <p className="text-sm font-bold flex-1">{t.symbol}</p>
                      <p className="text-[10px] text-[#4B5675]">{ago(t.time)}</p>
                      <button type="button" onClick={() => removeTaken(t.id)} aria-label="Remove trade"
                        className="text-[#2D3A52] hover:text-rose-400 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[
                        { l: "Entry",   v: `$${t.entry.toFixed(2)}`,  c: "text-amber-400" },
                        { l: "Stop",    v: `$${t.stop.toFixed(2)}`,   c: "text-rose-400"  },
                        { l: "Target",  v: `$${t.target.toFixed(2)}`, c: "text-emerald-400" },
                        { l: "Shares",  v: fmtS(t.shares),            c: "text-[#F1F5F9]" },
                        { l: "Risk",    v: fmtD(t.riskDollar),        c: "text-rose-400"  },
                        { l: "Upside",  v: fmtD(t.potential),         c: "text-emerald-400" },
                      ].map(r => (
                        <div key={r.l} className="bg-[#0D0B1A] rounded-xl p-2 text-center border border-[#1C1933]">
                          <p className={`text-xs font-black font-mono ${r.c}`}>{r.v}</p>
                          <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mt-0.5">{r.l}</p>
                        </div>
                      ))}
                    </div>
                    {t.note && <p className="text-xs text-[#4B5675] mt-2 italic">&ldquo;{t.note}&rdquo;</p>}
                  </div>
                ))}
              </div>
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
