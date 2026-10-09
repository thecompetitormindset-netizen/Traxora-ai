"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadDiscoverData, topGames, topCoins, nextIpos } from "../lib/discoverData";
import type { DiscoverData } from "../lib/discoverData";

// Big "it exists — go look" cards for Sports Betting, Crypto and IPOs.
// Each pulls a live taste of its feed and links to the full page.

function gameTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function ipoDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function confColor(conf: number): string {
  if (conf >= 70) return "bg-emerald-400";
  if (conf >= 60) return "bg-amber-400";
  return "bg-[#7B8DB4]";
}

const ratingChip: Record<string, string> = {
  Strong:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Watch:       "bg-amber-500/10 text-amber-400 border-amber-500/25",
  Speculative: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[52px] rounded-xl bg-[#0D0B1A]/70 border border-[#252345] animate-pulse" />
      ))}
    </>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-[#0D0B1A]/50 border border-dashed border-[#252345] px-3 py-5 text-center">
      <p className="text-[11px] text-[#4B5675] leading-snug">{text}</p>
    </div>
  );
}

export default function DiscoverSection() {
  const [data, setData]       = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadDiscoverData()
      .then(d => { if (active) setData(d); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const games  = data ? topGames(data.games, 3) : [];
  const coins  = data ? topCoins(data.coins, 3) : [];
  const ipos   = data ? nextIpos(data.ipos, 3)  : [];
  const moving = data ? data.coins.filter(c => c.bigMove).length  : 0;
  const coiled = data ? data.coins.filter(c => c.squeeze).length  : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

      {/* ── Sports Betting ── */}
      <Link href="/sports" className="group relative overflow-hidden bg-[#13112A] rounded-2xl border border-amber-500/20 hover:border-amber-500/45 transition-all flex flex-col">
        <div className="absolute -top-14 -right-14 w-44 h-44 rounded-full bg-amber-500/10 blur-3xl group-hover:bg-amber-500/20 transition-colors pointer-events-none" />
        <div className="relative p-5 pb-3 flex items-start gap-3">
          <div aria-hidden="true" className="w-11 h-11 rounded-[10px] bg-[var(--mx-raised)] border border-[var(--mx-line)] flex items-center justify-center shrink-0 font-mono text-[9.5px] tracking-[0.06em] uppercase text-[var(--mx-text-2)]">Spo</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black tracking-tight text-[#F1F5F9]">Sports Betting</p>
            <p className="text-[11px] text-[#7B8DB4] mt-0.5 leading-snug">AI game predictions with confidence — NFL, NBA, soccer &amp; more</p>
          </div>
          {!loading && data && data.games.length > 0 && (
            <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {data.games.length} games
            </span>
          )}
        </div>
        <div className="relative px-5 pb-3 space-y-2 flex-1">
          {loading ? <SkeletonRows /> : games.length > 0 ? games.map(g => (
            <div key={g.id} className="rounded-xl bg-[#0D0B1A]/70 border border-[#252345] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[#F1F5F9] truncate">{g.awayTeam} @ {g.homeTeam}</p>
                <span className="shrink-0 text-[8px] font-bold px-1.5 py-px rounded-md bg-[#1A1838] text-[#7B8DB4] border border-[#252345]">{g.league}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[9px] text-[#4B5675] uppercase tracking-wider shrink-0">Pick</span>
                <span className="text-[10px] font-bold text-amber-300 truncate max-w-[110px]">{g.predictedWinner}</span>
                <div className="flex-1 h-1 rounded-full bg-[#252345] overflow-hidden min-w-[30px]">
                  <div className={`h-full rounded-full ${confColor(g.winnerConfidence ?? 0)}`} style={{ width: `${g.winnerConfidence ?? 0}%` }} />
                </div>
                <span className="text-[10px] font-mono font-bold text-[#F1F5F9] shrink-0">{g.winnerConfidence}%</span>
                <span className="text-[9px] text-[#4B5675] shrink-0">{gameTime(g.commenceTime)}</span>
              </div>
            </div>
          )) : (
            <EmptyRow text={data?.sportsConfigured === false
              ? "Predictions warming up — open the Sports tab to see leagues & scores"
              : "No upcoming games right now — schedules refresh through the day"} />
          )}
        </div>
        <div className="relative px-5 py-3 border-t border-[#252345]/60 flex items-center justify-between">
          <span className="text-[10px] text-[#4B5675]">Season-record model · not betting odds</span>
          <span className="text-[11px] font-semibold text-amber-400 group-hover:text-amber-300 transition-colors">All predictions →</span>
        </div>
      </Link>

      {/* ── Crypto ── */}
      <Link href="/explore?view=crypto" className="group relative overflow-hidden bg-[#13112A] rounded-2xl border border-violet-500/20 hover:border-violet-500/45 transition-all flex flex-col">
        <div className="absolute -top-14 -right-14 w-44 h-44 rounded-full bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-colors pointer-events-none" />
        <div className="relative p-5 pb-3 flex items-start gap-3">
          <div aria-hidden="true" className="w-11 h-11 rounded-[10px] bg-[var(--mx-raised)] border border-[var(--mx-line)] flex items-center justify-center shrink-0 font-mono text-[9.5px] tracking-[0.06em] uppercase text-[var(--mx-text-2)]">Cry</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black tracking-tight text-[#F1F5F9]">Crypto Radar</p>
            <p className="text-[11px] text-[#7B8DB4] mt-0.5 leading-snug">Big moves happening now &amp; coiled setups about to break</p>
          </div>
          {!loading && data && data.coins.length > 0 && (
            <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
              {moving} moving · {coiled} coiled
            </span>
          )}
        </div>
        <div className="relative px-5 pb-3 space-y-2 flex-1">
          {loading ? <SkeletonRows /> : coins.length > 0 ? coins.map(c => {
            const up = (c.changePct ?? 0) >= 0;
            return (
              <div key={c.symbol} className="flex items-center gap-2.5 rounded-xl bg-[#0D0B1A]/70 border border-[#252345] px-3 py-2">
                <span className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[9px] font-black text-violet-300 flex items-center justify-center shrink-0">{c.ticker}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-[#F1F5F9] truncate">{c.name}</p>
                  <p className="text-[10px] font-mono text-[#4B5675]">
                    {c.price !== null ? `$${c.price >= 100 ? c.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.price.toFixed(2)}` : "—"}
                    {c.rsi14 !== null && <span> · RSI {c.rsi14}</span>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {up ? "+" : ""}{(c.changePct ?? 0).toFixed(2)}%
                  </span>
                  {c.bigMove
                    ? <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">MOVING</span>
                    : c.squeeze
                    ? <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/25">COILED</span>
                    : null}
                </div>
              </div>
            );
          }) : (
            <EmptyRow text="Crypto radar is warming up — open the Crypto tab for the full board" />
          )}
        </div>
        <div className="relative px-5 py-3 border-t border-[#252345]/60 flex items-center justify-between">
          <span className="text-[10px] text-[#4B5675]">24/7 market · 12-coin universe</span>
          <span className="text-[11px] font-semibold text-violet-400 group-hover:text-violet-300 transition-colors">Open crypto →</span>
        </div>
      </Link>

      {/* ── IPOs ── */}
      <Link href="/ipo" className="group relative overflow-hidden bg-[#13112A] rounded-2xl border border-sky-500/20 hover:border-sky-500/45 transition-all flex flex-col">
        <div className="absolute -top-14 -right-14 w-44 h-44 rounded-full bg-sky-500/10 blur-3xl group-hover:bg-sky-500/20 transition-colors pointer-events-none" />
        <div className="relative p-5 pb-3 flex items-start gap-3">
          <div aria-hidden="true" className="w-11 h-11 rounded-[10px] bg-[var(--mx-raised)] border border-[var(--mx-line)] flex items-center justify-center shrink-0 font-mono text-[9.5px] tracking-[0.06em] uppercase text-[var(--mx-text-2)]">IPO</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black tracking-tight text-[#F1F5F9]">IPO Calendar</p>
            <p className="text-[11px] text-[#7B8DB4] mt-0.5 leading-snug">Upcoming listings rated Strong, Watch or Speculative</p>
          </div>
          {!loading && data && data.ipos.length > 0 && (
            <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25">
              {data.ipos.length} upcoming
            </span>
          )}
        </div>
        <div className="relative px-5 pb-3 space-y-2 flex-1">
          {loading ? <SkeletonRows /> : ipos.length > 0 ? ipos.map(i => (
            <div key={`${i.symbol || i.name}-${i.date}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#0D0B1A]/70 border border-[#252345] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#F1F5F9] truncate">{i.name}</p>
                <p className="text-[10px] text-[#4B5675] font-mono truncate">
                  {i.symbol || "TBD"}{i.exchange ? ` · ${i.exchange}` : ""}{i.price ? ` · $${i.price}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] font-mono font-bold text-[#F1F5F9]">{ipoDate(i.date)}</span>
                <span className={`text-[8px] font-bold px-1.5 py-px rounded-md border ${ratingChip[i.rating] ?? ratingChip.Watch}`}>
                  {i.rating.toUpperCase()}
                </span>
              </div>
            </div>
          )) : (
            <EmptyRow text="No listings in this window — the calendar refreshes every 30 minutes" />
          )}
        </div>
        <div className="relative px-5 py-3 border-t border-[#252345]/60 flex items-center justify-between">
          <span className="text-[10px] text-[#4B5675]">Finnhub calendar · AI-rated</span>
          <span className="text-[11px] font-semibold text-sky-400 group-hover:text-sky-300 transition-colors">Full calendar →</span>
        </div>
      </Link>

    </div>
  );
}
