"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { getPortfolio, STARTING_BALANCE } from "../lib/trading";

type Portfolio = { cash: number; holdings: Array<{ quantity: number; avgPrice: number; symbol: string }>; trades: Array<{ side: string; symbol: string; price: number }> };

const BOTS = [
  {
    id: "apex",
    name: "Apex",
    style: "Aggressive",
    desc: "Buys on any BUY signal (Low–High), 20% of cash per trade. High risk, high reward.",
    color: "text-rose-400",
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    dot: "bg-rose-400",
  },
  {
    id: "delta",
    name: "Delta",
    style: "Balanced",
    desc: "Buys on Medium+ confidence signals, 12% of cash per trade. Mirrors AutoTrader.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-400",
  },
  {
    id: "vera",
    name: "Vera",
    style: "Conservative",
    desc: "Only buys High confidence signals, 8% of cash per trade. Low drawdown, slower gains.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-400",
  },
];

function getBotPortfolio(id: string): Portfolio {
  if (typeof window === "undefined") return { cash: STARTING_BALANCE, holdings: [], trades: [] };
  try {
    return JSON.parse(localStorage.getItem(`traxora-bot-${id}`) ?? "null") ?? { cash: STARTING_BALANCE, holdings: [], trades: [] };
  } catch {
    return { cash: STARTING_BALANCE, holdings: [], trades: [] };
  }
}

function calcStats(p: Portfolio) {
  const invested    = p.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
  const total       = p.cash + invested;
  const pl          = total - STARTING_BALANCE;
  const plPct       = (pl / STARTING_BALANCE) * 100;
  const buys: Record<string, number[]> = {};
  let wins = 0, losses = 0;
  for (const t of p.trades) {
    if (t.side === "BUY") { if (!buys[t.symbol]) buys[t.symbol] = []; buys[t.symbol].push(t.price); }
    else {
      const bp = buys[t.symbol];
      if (bp?.length) { const avg = bp.reduce((a, b) => a + b, 0) / bp.length; t.price > avg ? wins++ : losses++; }
    }
  }
  const wr = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
  return { total, pl, plPct, trades: p.trades.length, wins, losses, wr };
}

function resetBot(id: string) {
  localStorage.removeItem(`traxora-bot-${id}`);
}

type DataRow =
  | { bot: typeof BOTS[0]; port: Portfolio; stats: ReturnType<typeof calcStats> }
  | { bot: null;           port: Portfolio; stats: ReturnType<typeof calcStats> };

export default function CompetePage() {
  const [data, setData] = useState<DataRow[]>([]);

  function load() {
    const userPort = getPortfolio();
    const rows: DataRow[] = [
      { bot: null, port: userPort, stats: calcStats(userPort) },
      ...BOTS.map(b => {
        const port = getBotPortfolio(b.id);
        return { bot: b, port, stats: calcStats(port) };
      }),
    ];
    rows.sort((a, b) => b.stats.total - a.stats.total);
    setData(rows);
  }

  useEffect(() => {
    load();
    window.addEventListener("bot-updated", load);
    return () => window.removeEventListener("bot-updated", load);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rank = data.findIndex(r => r.bot === null) + 1;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-4xl mx-auto w-full">

          <div className="mt-6">
            <h1 className="text-4xl font-bold">Compete</h1>
            <p className="text-[#7B8DB4] mt-2">
              Your paper portfolio vs 3 AI rival bots — all starting with $10,000. Bots trade automatically when AutoTrader is running.
            </p>
          </div>

          {/* Your rank */}
          {data.length > 0 && (
            <div className={`mt-6 rounded-2xl p-5 border flex items-center gap-5 flex-wrap ${
              rank === 1 ? "bg-amber-500/5 border-amber-500/20" :
              rank === 2 ? "bg-[#1C2333]/60 border-[#2D3A50]" :
                           "bg-[#0C1017] border-[#1C2333]"
            }`}>
              <p className={`text-5xl font-black font-mono ${rank === 1 ? "text-amber-400" : rank === 2 ? "text-[#7B8DB4]" : "text-[#4B5675]"}`}>
                #{rank}
              </p>
              <div>
                <p className="font-bold text-[#F1F5F9]">
                  {rank === 1 ? "🏆 You're in the lead!" : rank === 2 ? "Almost there — you're in 2nd place" : "Keep trading — you're in " + ["","1st","2nd","3rd","4th"][rank] + " place"}
                </p>
                <p className="text-xs text-[#4B5675] mt-0.5">
                  {rank === 1 ? "Your trading strategy is beating all 3 AI rivals" : "Start AutoTrader or place more trades to climb the leaderboard"}
                </p>
              </div>
            </div>
          )}

          {/* Leaderboard table */}
          <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1C2333]">
              <h2 className="font-semibold text-[#F1F5F9]">Leaderboard</h2>
              <p className="text-xs text-[#4B5675] mt-0.5">Live P&L · Updates whenever AutoTrader scans</p>
            </div>

            <div className="divide-y divide-[#1C2333]">
              {data.map((row, i) => {
                const isUser = row.bot === null;
                const bot    = row.bot as typeof BOTS[0] | null;
                const s      = row.stats;
                const plPos  = s.pl >= 0;
                return (
                  <div
                    key={isUser ? "user" : bot!.id}
                    className={`flex items-center gap-4 px-5 py-4 ${isUser ? "bg-emerald-500/5" : ""}`}
                  >
                    {/* Rank */}
                    <span className={`text-lg font-black font-mono w-7 shrink-0 ${
                      i === 0 ? "text-amber-400" : i === 1 ? "text-[#7B8DB4]" : "text-[#4B5675]"
                    }`}>
                      #{i + 1}
                    </span>

                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isUser
                        ? "bg-emerald-600"
                        : `${bot!.bg} border ${bot!.border}`
                    }`}>
                      {isUser
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        : <span className={`text-sm font-black ${bot!.color}`}>{bot!.name[0]}</span>
                      }
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-[#F1F5F9] text-sm">
                          {isUser ? "You" : bot!.name}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border ${
                          isUser
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : `${bot!.color} ${bot!.bg} ${bot!.border}`
                        }`}>
                          {isUser ? "Manual + Auto" : bot!.style}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#4B5675] mt-0.5 truncate">
                        {isUser ? "Your paper portfolio" : bot!.desc}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="text-right shrink-0">
                      <p className="font-black font-mono text-[#F1F5F9]">${s.total.toFixed(0)}</p>
                      <p className={`text-xs font-mono font-semibold ${plPos ? "text-emerald-400" : "text-rose-400"}`}>
                        {plPos ? "+" : ""}{s.plPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs font-mono text-[#F1F5F9]">{s.trades}</p>
                      <p className="text-[10px] text-[#4B5675]">trades</p>
                    </div>
                    <div className="text-right shrink-0 hidden md:block">
                      <p className={`text-xs font-mono font-semibold ${s.wr != null && s.wr >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                        {s.wr != null ? `${s.wr}%` : "—"}
                      </p>
                      <p className="text-[10px] text-[#4B5675]">win rate</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bot profiles */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BOTS.map(bot => {
              const row  = data.find(r => r.bot?.id === bot.id);
              const port = row?.port ?? { cash: STARTING_BALANCE, holdings: [], trades: [] };
              const s    = row?.stats ?? calcStats(port);
              const invested = port.holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
              return (
                <div key={bot.id} className={`${bot.bg} border ${bot.border} rounded-2xl p-5 flex flex-col`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className={`font-bold ${bot.color}`}>{bot.name}</p>
                      <p className="text-[10px] text-[#4B5675]">{bot.style} bot</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${bot.dot}`} />
                  </div>
                  <p className="text-[10px] text-[#4B5675] leading-relaxed mb-4">{bot.desc}</p>

                  {/* Stats */}
                  <div className="space-y-1.5 mb-4">
                    {[
                      { l: "Account",  v: `$${s.total.toFixed(2)}` },
                      { l: "P&L",      v: `${s.pl >= 0 ? "+" : ""}$${s.pl.toFixed(2)}`, pos: s.pl >= 0 },
                      { l: "Cash",     v: `$${port.cash.toFixed(2)}` },
                      { l: "Invested", v: `$${invested.toFixed(2)}` },
                      { l: "Trades",   v: s.trades.toString() },
                      { l: "Win Rate", v: s.wr != null ? `${s.wr}%` : "—" },
                    ].map(r => (
                      <div key={r.l} className="flex justify-between text-xs">
                        <span className="text-[#4B5675]">{r.l}</span>
                        <span className={`font-mono font-semibold ${
                          r.l === "P&L"
                            ? (r.pos ? "text-emerald-400" : "text-rose-400")
                            : "text-[#F1F5F9]"
                        }`}>{r.v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Holdings */}
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-[#4B5675] uppercase tracking-widest mb-2">
                      Current Positions ({port.holdings.length})
                    </p>
                    {port.holdings.length === 0 ? (
                      <p className="text-[10px] text-[#2D3A50] italic">
                        No open positions — waiting for AutoTrader signals
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                        {port.holdings.map(h => {
                          const cost = h.quantity * h.avgPrice;
                          return (
                            <div
                              key={h.symbol}
                              className="flex items-center justify-between bg-[#060A14] border border-[#1C2333] rounded-xl px-2.5 py-1.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg border ${bot.color} ${bot.bg} ${bot.border}`}>
                                  {h.symbol}
                                </span>
                                <span className="text-[9px] text-[#4B5675] font-mono">
                                  {h.quantity} sh @ ${h.avgPrice.toFixed(2)}
                                </span>
                              </div>
                              <span className="text-[9px] font-black font-mono text-[#F1F5F9] shrink-0 ml-2">
                                ${cost.toFixed(0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => { resetBot(bot.id); load(); }}
                    className="mt-4 w-full text-[10px] text-[#4B5675] hover:text-rose-400 transition-colors border border-[#1C2333] rounded-xl py-1.5"
                  >
                    Reset bot
                  </button>
                </div>
              );
            })}
          </div>

          {/* How it works */}
          <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
            <p className="text-xs font-semibold text-[#F1F5F9] mb-3">How the rival bots work</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[10px] text-[#4B5675] leading-relaxed">
              <p><span className="text-rose-400 font-semibold">Apex (Aggressive)</span> — Trades on any signal regardless of confidence. Uses 20% of cash per buy. Highest potential upside, highest drawdown risk.</p>
              <p><span className="text-emerald-400 font-semibold">Delta (Balanced)</span> — Only trades Medium or High confidence signals. Uses 12% of cash. Mirrors your AutoTrader settings.</p>
              <p><span className="text-emerald-400 font-semibold">Vera (Conservative)</span> — Only trades High confidence signals. Uses 8% of cash. Slowest growth but smallest drawdowns.</p>
            </div>
            <p className="text-[10px] text-[#2D3A50] mt-4">Bots execute trades automatically every time AutoTrader scans. They share the same signals but apply different risk rules. Enable AutoTrader to start the competition.</p>
          </div>

          <div className="mt-4 text-center">
            <Link href="/dashboard" className="text-xs text-emerald-400 hover:underline">
              ← Go to Dashboard and enable AutoTrader to start competing
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
