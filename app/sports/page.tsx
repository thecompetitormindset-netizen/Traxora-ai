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

const LEAGUE_ORDER = ["NFL", "NBA", "MLB", "NHL", "Premier League", "Champions League", "La Liga", "Serie A", "Bundesliga", "MLS"];

function fmtOdds(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ g }: { g: GamePrediction }) {
  const homeWins = g.predictedWinner === g.homeTeam;
  const awayWins = g.predictedWinner === g.awayTeam;

  return (
    <div className="bg-[#0D0B1A] rounded-xl border border-[#252345] p-4 flex flex-col gap-3 hover:border-[#333368] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#4B5675]">{fmtKickoff(g.commenceTime)}</span>
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
  const [filter,     setFilter]     = useState<"all" | "US" | "Soccer">("all");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/sports/predictions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { games?: GamePrediction[]; configured?: boolean } | null) => {
        if (!d) { setFailed(true); return; }
        setGames(d.games ?? []);
        setConfigured(d.configured ?? false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const filtered = filter === "all" ? games : games.filter(g => g.leagueGroup === filter);
    const byLeague = new Map<string, GamePrediction[]>();
    for (const g of filtered) {
      if (!byLeague.has(g.league)) byLeague.set(g.league, []);
      byLeague.get(g.league)!.push(g);
    }
    return LEAGUE_ORDER
      .map(l => ({ league: l, games: byLeague.get(l) ?? [] }))
      .filter(l => l.games.length > 0);
  }, [games, filter]);

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

          {/* Filter tabs */}
          {!loading && games.length > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {(["all", "US", "Soccer"] as const).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${
                    filter === f
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
                  }`}>
                  {f === "all" ? "All Leagues" : f === "US" ? "NFL · NBA · MLB · NHL" : "Soccer"}
                </button>
              ))}
            </div>
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
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">No games with posted lines right now</p>
              <p className="text-xs text-[#4B5675]">Books usually post lines within a week or two of kickoff — check back closer to game day.</p>
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
                {section.games.map(g => <GameCard key={g.id} g={g} />)}
              </div>
            </div>
          ))}

        </main>
      </div>
      <Sidebar />
    </div>
  );
}
