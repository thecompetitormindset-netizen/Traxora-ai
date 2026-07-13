"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePrediction = {
  id:               string;
  sportKey:         string;
  league:           string;
  leagueGroup:      "US" | "Soccer";
  commenceTime:     string;
  homeTeam:         string;
  awayTeam:         string;
  predictedWinner:  string | null;
  winnerConfidence: number | null;
  predictedScore:   { home: number; away: number } | null;
  moneyline:        { home: number | null; away: number | null };
  bookmakerCount:   number;
};

const LEAGUE_ORDER = [
  "World Cup", "NFL", "NBA", "MLB", "NHL",
  "College Football", "College Basketball", "WNBA", "MMA / UFC", "Boxing",
  "Premier League", "Champions League", "La Liga", "Serie A", "Bundesliga", "MLS",
];

// One tab per sport. Soccer bundles its leagues; every other sport stands alone.
const SPORT_TABS: Array<{ id: string; label: string; emoji: string; match: (g: GamePrediction) => boolean }> = [
  { id: "all",    label: "All",                emoji: "🌍", match: () => true },
  { id: "nfl",    label: "NFL",                emoji: "🏈", match: g => g.league === "NFL" },
  { id: "nba",    label: "NBA",                emoji: "🏀", match: g => g.league === "NBA" },
  { id: "mlb",    label: "MLB",                emoji: "⚾", match: g => g.league === "MLB" },
  { id: "nhl",    label: "NHL",                emoji: "🏒", match: g => g.league === "NHL" },
  { id: "soccer", label: "Soccer",             emoji: "⚽", match: g => g.leagueGroup === "Soccer" },
  { id: "cfb",    label: "College Football",   emoji: "🎓", match: g => g.league === "College Football" },
  { id: "cbb",    label: "College Basketball", emoji: "🎓", match: g => g.league === "College Basketball" },
  { id: "wnba",   label: "WNBA",               emoji: "🏀", match: g => g.league === "WNBA" },
  { id: "mma",    label: "MMA / UFC",          emoji: "🥋", match: g => g.league === "MMA / UFC" },
  { id: "boxing", label: "Boxing",             emoji: "🥊", match: g => g.league === "Boxing" },
];

function fmtOdds(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Local-timezone YYYY-MM-DD so "today"/"tomorrow" match the viewer's clock, not UTC.
function localDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ g, todayKey, tomorrowKey }: { g: GamePrediction; todayKey: string; tomorrowKey: string }) {
  const homeWins = g.predictedWinner === g.homeTeam;
  const awayWins = g.predictedWinner === g.awayTeam;
  const gameDay  = localDateKey(g.commenceTime);
  const dayLabel = gameDay === todayKey ? "Today" : gameDay === tomorrowKey ? "Tomorrow" : null;

  return (
    <div className="bg-[#0D0B1A] rounded-xl border border-[#252345] p-4 flex flex-col gap-3 hover:border-[#333368] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {dayLabel && (
            <span className={`text-[8px] font-black px-1.5 py-px rounded ${
              dayLabel === "Today" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
            }`}>{dayLabel.toUpperCase()}</span>
          )}
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#4B5675]">{fmtKickoff(g.commenceTime)}</span>
        </span>
        <span className="text-[9px] font-semibold text-[#4B5675]">{g.bookmakerCount} book{g.bookmakerCount === 1 ? "" : "s"}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-bold truncate ${awayWins ? "text-emerald-400" : "text-[var(--text-primary,#F1F5F9)]"}`}>
            {g.awayTeam}{awayWins && " ✓"}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-[#4B5675]">{fmtOdds(g.moneyline.away)}</span>
            {g.predictedScore && <span className="text-sm font-black font-mono text-[var(--text-primary,#F1F5F9)]">{g.predictedScore.away}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-bold truncate ${homeWins ? "text-emerald-400" : "text-[var(--text-primary,#F1F5F9)]"}`}>
            {g.homeTeam}{homeWins && " ✓"}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-[#4B5675]">{fmtOdds(g.moneyline.home)}</span>
            {g.predictedScore && <span className="text-sm font-black font-mono text-[var(--text-primary,#F1F5F9)]">{g.predictedScore.home}</span>}
          </div>
        </div>
      </div>

      {g.predictedWinner && g.winnerConfidence !== null && (
        <div className="pt-2 border-t border-[#1A1838] flex items-center gap-2">
          <span className="text-[9px] text-[#4B5675] uppercase tracking-widest font-bold">Pick</span>
          <span className="text-xs font-bold text-emerald-400 truncate">{g.predictedWinner}</span>
          <span className="ml-auto text-[10px] font-mono font-bold text-[#7B8DB4]">{g.winnerConfidence}%</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SportsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [games,      setGames]      = useState<GamePrediction[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading,    setLoading]    = useState(true);
  const [failed,     setFailed]     = useState(false);
  const [quotaOut,   setQuotaOut]   = useState(false);
  const [sportTab,   setSportTab]   = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow" | "all">("all");
  // Default to every game in schedule order — probability is an opt-in view
  const [confFilter, setConfFilter] = useState<0 | 70 | 80>(0);

  const todayKey    = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA"), []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/sports/predictions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { games?: GamePrediction[]; configured?: boolean; quotaExhausted?: boolean } | null) => {
        if (!d) { setFailed(true); return; }
        setGames(d.games ?? []);
        setConfigured(d.configured ?? false);
        setQuotaOut(d.quotaExhausted ?? false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  // Games per sport tab (before date/confidence filters) — powers the tab count badges
  const tabCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of SPORT_TABS) m.set(t.id, games.filter(t.match).length);
    return m;
  }, [games]);

  const activeTab = SPORT_TABS.find(t => t.id === sportTab) ?? SPORT_TABS[0];

  const grouped = useMemo(() => {
    let filtered = games.filter(activeTab.match);
    if (dateFilter === "today")    filtered = filtered.filter(g => localDateKey(g.commenceTime) === todayKey);
    if (dateFilter === "tomorrow") filtered = filtered.filter(g => localDateKey(g.commenceTime) === tomorrowKey);
    // "Sure" is not a real thing in sports — this hides toss-ups the market itself
    // is unsure about, and games with too few books to trust the line at all.
    if (confFilter > 0) filtered = filtered.filter(g => g.winnerConfidence !== null && g.winnerConfidence >= confFilter && g.bookmakerCount >= 4);
    // Default view reads like a schedule (kickoff order); probability views rank by confidence
    filtered = confFilter > 0
      ? [...filtered].sort((a, b) => (b.winnerConfidence ?? 0) - (a.winnerConfidence ?? 0))
      : [...filtered].sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    const byLeague = new Map<string, GamePrediction[]>();
    for (const g of filtered) {
      if (!byLeague.has(g.league)) byLeague.set(g.league, []);
      byLeague.get(g.league)!.push(g);
    }
    return LEAGUE_ORDER
      .map(l => ({ league: l, games: byLeague.get(l) ?? [] }))
      .filter(l => l.games.length > 0);
  }, [games, activeTab, dateFilter, confFilter, todayKey, tomorrowKey]);

  const totalFiltered = grouped.reduce((s, l) => s + l.games.length, 0);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0B1A]">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      </div>
    );
  }

  const skeletons = Array.from({ length: 6 });

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0B1A] text-[#F1F5F9]">
      <Topbar />
      <div className="flex flex-1 !pb-36">
        <main className="app-ambient min-w-0 flex-1 max-w-6xl mx-auto w-full px-3 py-4 page-enter">

          {/* Header */}
          <div className="mb-5 text-center">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>
              </svg>
              <h1 className="text-2xl font-black tracking-tight text-gradient-green">Game Predictions</h1>
            </div>
            <p className="text-xs text-[#4B5675] max-w-lg mx-auto">
              Winner and score predictions derived from live sportsbook odds — not betting advice, for informational purposes only.
            </p>
          </div>

          {/* Sport tabs — one per sport */}
          {!loading && games.length > 0 && (
            <div className="mb-3 -mx-3 px-3 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1.5 w-max mx-auto pb-1">
                {SPORT_TABS.map(t => {
                  const count = tabCounts.get(t.id) ?? 0;
                  const active = sportTab === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setSportTab(t.id)}
                      className={`shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-colors ${
                        active
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : count === 0
                          ? "bg-[#13112A] text-[#333368] border-[#252345] hover:text-[#4B5675]"
                          : "bg-[#13112A] text-[#7B8DB4] border-[#252345] hover:text-[#F1F5F9] hover:border-[#333368]"
                      }`}>
                      <span aria-hidden>{t.emoji}</span>
                      {t.label}
                      <span className={`text-[9px] font-black px-1.5 py-px rounded-full border ${
                        active ? "bg-emerald-500/15 border-emerald-500/25" : "bg-[#0D0B1A] border-[#252345]"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date + confidence filters */}
          {!loading && games.length > 0 && (
            <div className="flex flex-col items-center gap-2 mb-3">
              <div className="flex items-center justify-center gap-2">
                {(["today", "tomorrow", "all"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setDateFilter(f)}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${
                      dateFilter === f
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
                    }`}>
                    {f === "today" ? "Today" : f === "tomorrow" ? "Tomorrow" : "All Upcoming"}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2">
                {([0, 70, 80] as const).map(f => (
                  <button key={f} type="button" onClick={() => setConfFilter(f)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      confFilter === f
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
                    }`}>
                    {f === 0 ? "All Games" : f === 70 ? "Favorites 70%+" : "Heavy Favorites 80%+"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && games.length > 0 && confFilter > 0 && (
            <p className="text-center text-[10px] text-amber-400/70 mb-6 max-w-md mx-auto">
              &ldquo;{confFilter}%+&rdquo; means the betting market itself prices this side around a {confFilter}% chance to win — not a guarantee. Favorites lose regularly; treat every game here as a probability, not a lock.
            </p>
          )}

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {skeletons.map((_, i) => <div key={i} className="h-36 bg-[#13112A] rounded-xl border border-[#252345] animate-pulse" />)}
            </div>
          )}

          {/* Not configured */}
          {!loading && !configured && !failed && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">Game predictions aren&rsquo;t set up yet</p>
              <p className="text-xs text-[#4B5675] max-w-sm mx-auto">Add an <code className="text-[#7B8DB4]">ODDS_API_KEY</code> (from the-odds-api.com) to enable this section.</p>
            </div>
          )}

          {/* Failed */}
          {!loading && failed && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">Couldn&rsquo;t load predictions</p>
              <p className="text-xs text-[#4B5675]">Try refreshing in a moment.</p>
            </div>
          )}

          {/* Empty but configured */}
          {!loading && configured && !failed && games.length === 0 && (
            <div className="text-center py-16">
              {quotaOut ? (
                <>
                  <p className="text-sm font-bold text-[#7B8DB4] mb-1">Predictions are temporarily unavailable</p>
                  <p className="text-xs text-[#4B5675] max-w-sm mx-auto">The odds provider&rsquo;s monthly request quota is used up. Games reappear automatically when the quota resets at the start of the next billing period.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-[#7B8DB4] mb-1">No games with posted lines right now</p>
                  <p className="text-xs text-[#4B5675]">Books usually post lines within a week or two of kickoff — check back closer to game day.</p>
                </>
              )}
            </div>
          )}

          {/* Configured, has games overall, but none match the current date/league/confidence filter */}
          {!loading && configured && !failed && games.length > 0 && totalFiltered === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">
                No {activeTab.id === "all" ? "" : `${activeTab.label} `}games {dateFilter === "all" ? "match this filter" : dateFilter}
              </p>
              <p className="text-xs text-[#4B5675]">
                {(tabCounts.get(activeTab.id) ?? 0) === 0 && activeTab.id !== "all"
                  ? `No ${activeTab.label} lines are posted right now — books post lines closer to game day (or the sport is off-season).`
                  : confFilter > 0 ? `Try "All Games" — no lines hit ${confFilter}%+ confidence right now.` : "Try “All Upcoming” to see every game with a posted line."}
              </p>
            </div>
          )}

          {/* Games grouped by league */}
          {!loading && !failed && grouped.map(section => (
            <div key={section.league} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">{section.league}</h2>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{section.games.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {section.games.map(g => <GameCard key={g.id} g={g} todayKey={todayKey} tomorrowKey={tomorrowKey} />)}
              </div>
            </div>
          ))}

        </main>
      </div>
      <Sidebar />
    </div>
  );
}
