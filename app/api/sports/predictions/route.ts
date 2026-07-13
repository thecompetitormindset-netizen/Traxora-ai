export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GamePrediction = {
  id:               string;
  sportKey:         string;
  league:           string;
  leagueGroup:      "US" | "Soccer";
  commenceTime:     string;
  homeTeam:         string;
  awayTeam:         string;
  homeRecord:       string | null;   // "W-L" or "W-D-L" as ESPN reports it, display only
  awayRecord:       string | null;
  predictedWinner:  string | null;   // null when either team has too few games played
  winnerConfidence: number | null;   // 0-100, log5 win probability from season records
};

// ── Leagues covered ───────────────────────────────────────────────────────────
// ESPN's public scoreboard/standings endpoints — free, unauthenticated, no
// request quota. Games only show up here once each sport's season is active
// (NFL is empty in July, MLB/WNBA are live) — that's real season scheduling,
// not a bug. Fight sports (MMA/Boxing) are deliberately excluded: a fighter's
// career win-loss record isn't a comparable signal to a team's season record,
// and building a "prediction" off it would be a much weaker, more misleading
// claim than this same math applied to team sports.

const LEAGUES: Array<{ sport: string; league: string; label: string; group: "US" | "Soccer" }> = [
  { sport: "football",   league: "nfl",                        label: "NFL",               group: "US"     },
  { sport: "basketball", league: "nba",                        label: "NBA",               group: "US"     },
  { sport: "baseball",   league: "mlb",                        label: "MLB",               group: "US"     },
  { sport: "hockey",     league: "nhl",                        label: "NHL",               group: "US"     },
  { sport: "football",   league: "college-football",           label: "College Football",  group: "US"     },
  { sport: "basketball", league: "mens-college-basketball",    label: "College Basketball",group: "US"     },
  { sport: "basketball", league: "wnba",                       label: "WNBA",              group: "US"     },
  { sport: "soccer",     league: "fifa.world",                 label: "World Cup",         group: "Soccer" },
  { sport: "soccer",     league: "eng.1",                      label: "Premier League",    group: "Soccer" },
  { sport: "soccer",     league: "uefa.champions",              label: "Champions League",  group: "Soccer" },
  { sport: "soccer",     league: "esp.1",                      label: "La Liga",           group: "Soccer" },
  { sport: "soccer",     league: "ita.1",                      label: "Serie A",           group: "Soccer" },
  { sport: "soccer",     league: "ger.1",                      label: "Bundesliga",        group: "Soccer" },
  { sport: "soccer",     league: "usa.1",                      label: "MLS",               group: "Soccer" },
];

const MIN_GAMES_PLAYED = 3; // below this, a record is too small a sample to trust

// ── log5 — Bill James' formula for win probability from two teams' win rates ──

function log5(pA: number, pB: number): number {
  const denom = pA + pB - 2 * pA * pB;
  if (denom === 0) return 0.5;
  return (pA - pA * pB) / denom;
}

// ── ESPN response shapes (only the fields we use) ─────────────────────────────

type EspnTeam = { id: string; displayName: string };
type EspnCompetitor = { id: string; homeAway: "home" | "away"; team: EspnTeam };
type EspnStatus = { type: { state: "pre" | "in" | "post"; completed: boolean } };
type EspnEvent = {
  id: string;
  date: string;
  competitions: Array<{ competitors: EspnCompetitor[]; status: EspnStatus }>;
};
type EspnScoreboard = { events?: EspnEvent[] };

type StandingsStat = { name: string; value?: number };
type StandingsEntry = { team: { id: string }; stats: StandingsStat[] };
type EspnStandings = {
  children?: Array<{ standings?: { entries?: StandingsEntry[] } }>;
  standings?: { entries?: StandingsEntry[] };
};

type TeamRecord = { wins: number; losses: number; ties: number; games: number; winPct: number };

function statVal(stats: StandingsStat[], name: string): number | null {
  const s = stats.find(s => s.name === name);
  return typeof s?.value === "number" ? s.value : null;
}

async function fetchStandings(sport: string, league: string): Promise<Map<string, TeamRecord>> {
  const map = new Map<string, TeamRecord>();
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return map;
    const data = await res.json() as EspnStandings;
    const groups = data.children?.length ? data.children.map(c => c.standings?.entries ?? []) : [data.standings?.entries ?? []];
    for (const entries of groups) {
      for (const e of entries) {
        const wins   = statVal(e.stats, "wins")   ?? 0;
        const losses = statVal(e.stats, "losses") ?? 0;
        const ties   = statVal(e.stats, "ties")   ?? 0;
        const games  = statVal(e.stats, "gamesPlayed") ?? (wins + losses + ties);
        // Shrink toward .500 with 4 "phantom" games (regression to the mean) —
        // without this, a 3-0 start (common in group-stage soccer) computes as
        // a mathematically perfect 1.000 win rate, which log5 then turns into
        // a false-certainty 100% prediction against literally any opponent.
        // Barely moves large samples (94 MLB games), stabilizes tiny ones.
        const SHRINK = 4;
        const winPct = games + SHRINK > 0 ? (wins + 0.5 * ties + SHRINK * 0.5) / (games + SHRINK) : 0.5;
        map.set(e.team.id, { wins, losses, ties, games, winPct });
      }
    }
  } catch { /* leave map empty — games still show, just without a prediction */ }
  return map;
}

function recordLabel(r: TeamRecord | undefined): string | null {
  if (!r) return null;
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

// Exhibition events pit league aggregates against each other ("American League
// @ National League" for the MLB All-Star Game, AFC @ NFC for the Pro Bowl).
// Not real matchups, and no season "team" record exists for them.
const AGGREGATE_TEAMS = new Set([
  "American League", "National League", "AFC", "NFC",
  "American Football Conference", "National Football Conference", "Team AFC", "Team NFC",
]);

function isExhibition(homeName: string, awayName: string): boolean {
  return [homeName, awayName].some(n => !n || AGGREGATE_TEAMS.has(n) || /all[- ]star/i.test(n));
}

function toDateKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchLeague(
  league: { sport: string; league: string; label: string; group: "US" | "Soccer" },
): Promise<GamePrediction[]> {
  try {
    const from = new Date();
    const to   = new Date(Date.now() + 10 * 86_400_000);
    const dates = `${toDateKey(from)}-${toDateKey(to)}`;

    const [scoreRes, standings] = await Promise.all([
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard?dates=${dates}`,
        { cache: "no-store", signal: AbortSignal.timeout(12_000) },
      ),
      fetchStandings(league.sport, league.league),
    ]);
    if (!scoreRes.ok) return [];
    const data = await scoreRes.json() as EspnScoreboard;
    const events = (data.events ?? []).filter(e => e.competitions?.[0]?.status?.type?.state === "pre");

    const games: GamePrediction[] = [];
    for (const ev of events) {
      const comp = ev.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === "home");
      const away = comp.competitors.find(c => c.homeAway === "away");
      if (!home || !away) continue;
      if (isExhibition(home.team.displayName, away.team.displayName)) continue;

      const homeRec = standings.get(home.team.id);
      const awayRec = standings.get(away.team.id);
      const enoughData = !!homeRec && !!awayRec && homeRec.games >= MIN_GAMES_PLAYED && awayRec.games >= MIN_GAMES_PLAYED;

      let predictedWinner: string | null = null;
      let winnerConfidence: number | null = null;
      if (enoughData) {
        const pHome = log5(homeRec!.winPct, awayRec!.winPct);
        winnerConfidence = Math.round(Math.max(pHome, 1 - pHome) * 1000) / 10;
        predictedWinner  = pHome >= 0.5 ? home.team.displayName : away.team.displayName;
      }

      games.push({
        id:           ev.id,
        sportKey:     `${league.sport}_${league.league}`,
        league:       league.label,
        leagueGroup:  league.group,
        commenceTime: ev.date,
        homeTeam:     home.team.displayName,
        awayTeam:     away.team.displayName,
        homeRecord:   recordLabel(homeRec),
        awayRecord:   recordLabel(awayRec),
        predictedWinner,
        winnerConfidence,
      });
    }
    return games;
  } catch { return []; }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min — ESPN is free/unauthenticated, no quota to protect

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const results = await Promise.all(LEAGUES.map(fetchLeague));
  const games = results.flat().sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());

  const payload = { games, configured: true, updatedAt: new Date().toISOString() };
  cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
