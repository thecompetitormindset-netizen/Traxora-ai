"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import { loadTrades, calcPL, STARTING_CAPITAL, type PaperTrade } from "@/app/lib/paperTrades";
import { scopedKey, setCurrentUser } from "@/app/lib/userState";
import PortfolioAllocationChart from "@/app/components/PortfolioAllocationChart";
import { syncFetch } from "../lib/syncFetch";
import { Glyph } from "../components/Icon";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function money(n: number) { return `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

// ── SVG Equity Curve ──────────────────────────────────────────────────────────

function EquityCurve({ points }: { points: number[] }) {
  if (points.length < 2) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[#4B5675] text-sm">Not enough closed trades yet.</p>
    </div>
  );

  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const W = 600, H = 120;
  const svgPts = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p - min) / range) * (H - 8)}`).join(" ");
  const baseY = H - ((STARTING_CAPITAL - min) / range) * (H - 8);
  const last  = points[points.length - 1];
  const color = last >= STARTING_CAPITAL ? "#34D399" : "#F87171";
  const gradId = `eq-${last > STARTING_CAPITAL ? "g" : "r"}`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[120px] block w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${svgPts} ${W},${H}`} fill={`url(#${gradId})`} />
      <polyline points={svgPts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="#333368" strokeWidth="0.75" strokeDasharray="4 3" />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = "text-[var(--mx-text)]" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] px-4 py-4">
      <p className="text-[12px] text-[var(--mx-text-3)] mb-1">{label}</p>
      <p className={`text-[20px] ${color}`}>{value}</p>
      {sub && <p className="text-[12px] text-[var(--mx-text-3)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Mini bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pctW = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="relative h-4 flex items-center">
      <div className="absolute inset-x-0 h-px bg-[#252345] rounded-full" />
      <div className={`absolute h-2.5 w-2.5 rounded-full ${color}`}
        style={{ left: `calc(${pctW}% - 5px)`, boxShadow: `0 0 6px currentColor` }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type ClosedTrade = PaperTrade & { exitPrice: number; exitDate: string; pl: number; plPct: number };

// Trades from the /paper planner — a separate, server-synced store. Convert
// them into the ClosedTrade shape so all analytics cover both systems.
type TakenTradeLite = {
  id: string; symbol: string; signal: "BUY" | "SELL";
  entry: number; stop: number; target: number; shares: number;
  time: number; note?: string;
  status?: string; closePrice?: number; closedAt?: number;
};

function takenToClosed(t: TakenTradeLite): ClosedTrade | null {
  if (t.status !== "WIN" && t.status !== "LOSS") return null;
  // No close price recorded → assume the stop/target filled (same as /paper)
  const exitPrice = t.closePrice ?? (t.status === "WIN" ? t.target : t.stop);
  if (exitPrice == null || !t.entry || !t.shares) return null;
  const base: PaperTrade & { exitPrice: number; exitDate: string } = {
    id:         `taken-${t.id}`,
    symbol:     t.symbol,
    direction:  t.signal === "BUY" ? "LONG" : "SHORT",
    entryPrice: t.entry,
    shares:     t.shares,
    stopLoss:   t.stop ?? null,
    takeProfit: t.target ?? null,
    entryDate:  new Date(t.time ?? Date.now()).toISOString(),
    notes:      t.note ?? "",
    status:     "CLOSED",
    exitPrice,
    exitDate:   new Date(t.closedAt ?? t.time ?? Date.now()).toISOString(),
    exitReason: t.closePrice == null ? (t.status === "WIN" ? "target_hit" : "stop_hit") : "manual",
  };
  const pl = calcPL(base, exitPrice);
  return { ...base, pl, plPct: (pl / (base.entryPrice * base.shares)) * 100 };
}

function loadTakenLocal(): TakenTradeLite[] {
  try { return JSON.parse(localStorage.getItem(scopedKey("traxora_taken_trades")) ?? "[]") as TakenTradeLite[]; }
  catch { return []; }
}

function StrategyContent() {
  const [trades,  setTrades]  = useState<ClosedTrade[]>([]);
  const [coaching, setCoaching] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "breakdown" | "trades">("overview");

  const { data: session } = useSession();

  useEffect(() => {
    if (session === undefined) return; // wait for session so scoped keys resolve
    setCurrentUser(session?.user?.email ?? null);

    const build = (taken: TakenTradeLite[]) => {
      const fromPortfolio = loadTrades()
        .filter((t): t is PaperTrade & { exitPrice: number; exitDate: string } =>
          t.status === "CLOSED" && t.exitPrice != null && t.exitDate != null)
        .map(t => ({ ...t, pl: calcPL(t, t.exitPrice), plPct: calcPL(t, t.exitPrice) / (t.entryPrice * t.shares) * 100 }));
      const fromPlanner = taken.map(takenToClosed).filter((t): t is ClosedTrade => t !== null);
      setTrades([...fromPortfolio, ...fromPlanner]
        .sort((a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime()));
    };

    build(loadTakenLocal());
    // Cross-device: also pull the /paper planner's server-synced trades
    syncFetch("/api/paper-trades")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { trades?: TakenTradeLite[] } | null) => {
        if (!data || !Array.isArray(data.trades) || data.trades.length === 0) return;
        const byId = new Map<string, TakenTradeLite>(data.trades.map(t => [t.id, t]));
        for (const t of loadTakenLocal()) {
          const s = byId.get(t.id);
          if (!s || (t.closedAt ?? t.time ?? 0) > (s.closedAt ?? s.time ?? 0)) byId.set(t.id, t);
        }
        build([...byId.values()]);
      })
      .catch(() => {});
  }, [session]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const wins   = trades.filter(t => t.pl > 0);
  const losses = trades.filter(t => t.pl <= 0);
  const totalPL   = trades.reduce((s, t) => s + t.pl, 0);
  const winRate   = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin    = wins.length   ? wins.reduce((s, t) => s + t.pl, 0)   / wins.length   : 0;
  const avgLoss   = losses.length ? losses.reduce((s, t) => s + t.pl, 0) / losses.length : 0;
  const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin / avgLoss) : 0;
  const avgHold = trades.length
    ? trades.reduce((s, t) => s + Math.floor((new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 86_400_000), 0) / trades.length
    : 0;

  // Max drawdown from equity curve
  const equityPts: number[] = [STARTING_CAPITAL];
  let equity = STARTING_CAPITAL;
  for (const t of trades) { equity += t.pl; equityPts.push(equity); }

  let peak = STARTING_CAPITAL, maxDD = 0;
  for (const pt of equityPts) {
    if (pt > peak) peak = pt;
    const dd = (peak - pt) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Best / worst
  const best  = trades.length ? [...trades].sort((a, b) => b.pl - a.pl)[0]   : null;
  const worst = trades.length ? [...trades].sort((a, b) => a.pl - b.pl)[0]   : null;

  // By symbol breakdown
  const bySymbol = new Map<string, { wins: number; losses: number; pl: number; count: number }>();
  for (const t of trades) {
    const cur = bySymbol.get(t.symbol) ?? { wins: 0, losses: 0, pl: 0, count: 0 };
    bySymbol.set(t.symbol, {
      wins:   cur.wins   + (t.pl > 0 ? 1 : 0),
      losses: cur.losses + (t.pl <= 0 ? 1 : 0),
      pl:     cur.pl     + t.pl,
      count:  cur.count  + 1,
    });
  }
  const symbolRows = [...bySymbol.entries()]
    .map(([sym, s]) => ({ sym, ...s, wr: s.count ? s.wins / s.count * 100 : 0 }))
    .sort((a, b) => b.pl - a.pl);

  // By direction
  const longs  = trades.filter(t => t.direction === "LONG");
  const shorts = trades.filter(t => t.direction === "SHORT");
  const dirStats = [
    { label: "Buying",  trades: longs,  wr: longs.length  ? longs.filter(t => t.pl > 0).length  / longs.length  * 100 : 0 },
    { label: "Selling short", trades: shorts, wr: shorts.length ? shorts.filter(t => t.pl > 0).length / shorts.length * 100 : 0 },
  ];

  // ── AI Coaching ───────────────────────────────────────────────────────────

  async function getCoaching() {
    if (!trades.length) return;
    setCoachLoading(true);
    try {
      const exitCounts = { target_hit: 0, stop_hit: 0, manual: 0 };
      for (const t of trades) exitCounts[t.exitReason ?? "manual"]++;
      const summary = {
        totalTrades: trades.length, winRate: winRate.toFixed(1), profitFactor: profitFactor.toFixed(2),
        avgWin: avgWin.toFixed(2), avgLoss: avgLoss.toFixed(2), maxDrawdown: maxDD.toFixed(1),
        avgHoldDays: avgHold.toFixed(1), totalPL: totalPL.toFixed(2),
        bySymbol: symbolRows.slice(0, 5).map(r => ({ symbol: r.sym, pl: r.pl.toFixed(2), wr: r.wr.toFixed(0), trades: r.count })),
        byDirection: dirStats.map(d => ({ direction: d.label, trades: d.trades.length, wr: d.wr.toFixed(0) })),
        exitDiscipline: exitCounts,
        bestTrade:  best  ? { symbol: best.symbol,  direction: best.direction,  pl: best.pl.toFixed(2)  } : null,
        worstTrade: worst ? { symbol: worst.symbol, direction: worst.direction, pl: worst.pl.toFixed(2) } : null,
        recentTrades: trades.slice(-10).map(t => ({
          symbol: t.symbol, direction: t.direction, pl: t.pl.toFixed(2), plPct: t.plPct.toFixed(1),
          exitReason: t.exitReason, entry: t.entryPrice, exit: t.exitPrice,
        })),
      };
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wins: wins.length, losses: losses.length, winRate: winRate.toFixed(1), summary }),
      });
      const data = await res.json();
      setCoaching(data.report ?? data.coaching ?? data.message ?? "No coaching available.");
    } catch { setCoaching("Coaching unavailable — try again."); }
    finally { setCoachLoading(false); }
  }

  if (trades.length === 0) {
    return (
      <div className="flex min-h-screen text-[#F1F5F9]">
        <Sidebar />
        <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <Topbar />
          <div className="mt-3 max-w-6xl mx-auto">
            <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em] mb-2">Your results</h1>
            <p className="text-[var(--mx-text-2)] text-[15px] mb-8">How your practice trades have gone, in one place.</p>
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3"><Glyph e="📊" /></p>
              <p className="text-[16px] mb-1">No finished trades yet</p>
              <p className="text-xs text-[#4B5675] mb-6">Make a practice trade and sell it — your results will show up here.</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <a href="/paper" className="h-10 px-5 inline-flex items-center rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">
                  Start practice trading
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <Topbar />
        <div className="mt-3 max-w-7xl mx-auto w-full space-y-4">

          {/* Header */}
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="reveal text-2xl font-black tracking-tight ">Your results</h1>
              <p className="text-[#7B8DB4] text-sm mt-1">{trades.length} closed trades · account started at ${STARTING_CAPITAL.toLocaleString()}</p>
            </div>
            <div className="flex gap-1 bg-[#1A1838] rounded-xl p-1 text-xs">
              {(["overview", "breakdown", "trades"] as const).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${tab === t ? "bg-emerald-600 text-white" : "text-[#4B5675] hover:text-[#F1F5F9]"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tab === "overview" && (
            <>
              {/* Portfolio allocation */}
              <PortfolioAllocationChart />

              {/* Equity curve */}
              <div className="card-shine glass surface-sheen border border-[#252345] rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold">Your account over time</p>
                  <p className={`text-sm font-mono font-bold ${equity >= STARTING_CAPITAL ? "text-emerald-400" : "text-rose-400"}`}>
                    ${equity.toFixed(2)} · {money(totalPL)}
                  </p>
                </div>
                <EquityCurve points={equityPts} />
                <div className="flex justify-between text-[9px] text-[#333368] font-mono mt-1.5">
                  <span>Start ${STARTING_CAPITAL.toLocaleString()}</span>
                  <span>{trades.length} trades</span>
                  <span>Now ${equity.toFixed(2)}</span>
                </div>
              </div>

              {/* Key stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Trades that made money" value={`${wins.length} of ${trades.length}`}
                  sub={`${winRate.toFixed(0)}% of your trades`} />
                <Stat label="Total result" value={money(totalPL)}
                  color={totalPL >= 0 ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"} sub="from finished trades" />
                <Stat label="Biggest dip" value={`${maxDD.toFixed(1)}%`}
                  sub="largest fall from a high point" />
                <Stat label="Time held" value={`${avgHold.toFixed(1)} days`} sub="on average" />
              </div>

              {/* Best / Worst */}
              {(best || worst) && (
                <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3">
                  {best && (
                    <div className="card-shine glass surface-sheen signal-card-buy border border-emerald-500/20 rounded-2xl px-5 py-4">
                      <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-semibold mb-2">Best Trade</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">{best.symbol}</p>
                          <p className="text-[10px] text-[#4B5675] mt-0.5">{best.direction} · {fmtDate(best.exitDate)}</p>
                        </div>
                        <p className="text-xl font-black font-mono text-emerald-400">+${best.pl.toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                  {worst && (
                    <div className="card-shine glass surface-sheen signal-card-sell border border-rose-500/20 rounded-2xl px-5 py-4">
                      <p className="text-[9px] text-rose-400 uppercase tracking-widest font-semibold mb-2">Worst Trade</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">{worst.symbol}</p>
                          <p className="text-[10px] text-[#4B5675] mt-0.5">{worst.direction} · {fmtDate(worst.exitDate)}</p>
                        </div>
                        <p className="text-xl font-black font-mono text-rose-400">-${Math.abs(worst.pl).toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Coaching */}
              <div className="card-shine glass surface-sheen border border-violet-500/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-violet-400">✦</span>
                    <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Tips from AI</p>
                  </div>
                  <button type="button" onClick={getCoaching} disabled={coachLoading}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors disabled:opacity-40">
                    {coachLoading
                      ? <><svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Analysing…</>
                      : coaching ? "Re-analyse ↺" : "Analyse my trades →"}
                  </button>
                </div>
                {coaching
                  ? <div className="text-[12px] text-[#94A3B8] leading-relaxed whitespace-pre-wrap">{coaching}</div>
                  : <p className="text-xs text-[#4B5675]">Click "Analyse my trades" to get AI coaching based on your performance patterns.</p>
                }
              </div>
            </>
          )}

          {tab === "breakdown" && (
            <div className="space-y-5">
              {/* Direction breakdown */}
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-4">Buying vs selling short</p>
                <div className="grid grid-cols-2 gap-3">
                  {dirStats.map(d => {
                    const pl = d.trades.reduce((s, t) => s + t.pl, 0);
                    return (
                      <div key={d.label} className={`rounded-xl p-4 border ${d.label === "LONG" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${d.label === "LONG" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"}`}>{d.label}</span>
                          <span className={`text-sm font-black font-mono ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(pl)}</span>
                        </div>
                        <p className="text-lg font-black font-mono text-[#F1F5F9]">{d.wr.toFixed(1)}%</p>
                        <p className="text-[10px] text-[#4B5675]">{d.trades.length} trades · win rate</p>
                        <MiniBar value={d.wr} max={100} color={d.wr >= 50 ? "bg-emerald-400" : "bg-rose-400"} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By symbol */}
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                <div className="grid grid-cols-5 gap-2 px-5 py-3 border-b border-[#252345] text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold">
                  <span className="col-span-2">Symbol</span>
                  <span className="text-right">Trades</span>
                  <span className="text-right">Made money</span>
                  <span className="text-right">P&L</span>
                </div>
                <div className="divide-y divide-[#252345]">
                  {symbolRows.map(r => (
                    <div key={r.sym} className="grid grid-cols-5 gap-2 px-5 py-3 items-center hover:bg-[#1A1838]/50 transition-colors">
                      <div className="col-span-2">
                        <p className="font-bold text-sm">{r.sym}</p>
                        <div className="mt-1">
                          <MiniBar value={r.wr} max={100} color={r.wr >= 50 ? "bg-emerald-400" : "bg-rose-400"} />
                        </div>
                      </div>
                      <p className="text-right text-xs text-[#7B8DB4]">{r.count}</p>
                      <p className={`text-right text-xs font-bold ${r.wr >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{r.wr.toFixed(0)}%</p>
                      <p className={`text-right text-sm font-black font-mono ${r.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(r.pl)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exit reason breakdown */}
              {(() => {
                const reasons = { target_hit: 0, stop_hit: 0, manual: 0 };
                for (const t of trades) { reasons[t.exitReason ?? "manual"]++; }
                return (
                  <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-5">
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-widest font-semibold mb-3">How trades ended</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Reached goal", count: reasons.target_hit, color: "text-emerald-400", emoji: "🎯" },
                        { label: "Hit safety level", count: reasons.stop_hit,   color: "text-rose-400",    emoji: "🛑" },
                        { label: "You sold", count: reasons.manual,     color: "text-amber-400",   emoji: "✋" },
                      ].map(r => (
                        <div key={r.label} className="text-center">
                          <p className="text-2xl mb-1"><Glyph e={r.emoji} /></p>
                          <p className={`text-xl font-black font-mono ${r.color}`}>{r.count}</p>
                          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest">{r.label}</p>
                          <p className="text-[9px] text-[#333368]">{trades.length ? (r.count / trades.length * 100).toFixed(0) : 0}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "trades" && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
              <div className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-[#252345] text-[9px] text-[#4B5675] uppercase tracking-widest font-semibold">
                <span className="col-span-2">Trade</span>
                <span className="text-right">Entry</span>
                <span className="text-right">Exit</span>
                <span className="text-right">P&L</span>
                <span className="text-right">Result</span>
              </div>
              <div className="divide-y divide-[#252345]">
                {[...trades].reverse().map(t => (
                  <div key={t.id} className="grid grid-cols-6 gap-2 px-5 py-3 items-center hover:bg-[#1A1838]/50 transition-colors">
                    <div className="col-span-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${t.direction === "LONG" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>{t.direction}</span>
                        <p className="text-sm font-bold">{t.symbol}</p>
                      </div>
                      <p className="text-[9px] text-[#333368] mt-0.5">{fmtDate(t.entryDate)} → {fmtDate(t.exitDate)}</p>
                    </div>
                    <p className="text-right text-xs font-mono text-[#7B8DB4]">${t.entryPrice.toFixed(2)}</p>
                    <p className="text-right text-xs font-mono text-[#7B8DB4]">${t.exitPrice.toFixed(2)}</p>
                    <p className={`text-right text-sm font-black font-mono ${t.pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(t.pl)}</p>
                    <div className="flex justify-end">
                      <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${t.pl >= 0 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-rose-500/15 border-rose-500/30 text-rose-400"}`}>
                        {t.pl >= 0 ? "WIN" : "LOSS"}
                      </span>
                    </div>
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

export default function StrategyPage() {
  return (
    <PaywallGuard>
      <StrategyContent />
    </PaywallGuard>
  );
}
