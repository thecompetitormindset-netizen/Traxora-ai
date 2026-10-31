// Shared ESPN-based prediction logic — used by both /api/sports/predictions
// (live reads for the page) and the sports-track-record cron (which snapshots
// predictions before games start and resolves them once they finish).

// ── Types ─────────────────────────────────────────────────────────────────────

export type GamePrediction = {
  id:               string;
  /**
   * Where the game is: not yet started, under way, or finished.
   *
   * The page shows all three now. It used to show only `pre`, which meant a
   * line-up or a box score could never be reached from it — the US leagues
   * publish no line-up before a game, so every game anyone could open was one
   * that had nothing to show.
   */
  state:            "pre" | "in" | "post";
  /** ESPN's own words — "Final", "Q3 4:12", "7:30 PM ET". */
  statusDetail:     string | null;
  /** Null before a game; the score once there is one. */
  homeScore:        number | null;
  awayScore:        number | null;
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

export type League = { sport: string; league: string; label: string; group: "US" | "Soccer" };

// ── Leagues covered ───────────────────────────────────────────────────────────
// ESPN's public scoreboard/standings endpoints — free, unauthenticated, no
// request quota. Games only show up here once each sport's season is active
// (NFL is empty in July, MLB/WNBA are live) — that's real season scheduling,
// not a bug. Fight sports (MMA/Boxing) are deliberately excluded: a fighter's
// career win-loss record isn't a comparable signal to a team's season record,
// and building a "prediction" off it would be a much weaker, more misleading
// claim than this same math applied to team sports.

export const LEAGUES: League[] = [
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
  { sport: "soccer",     league: "fra.1",                      label: "Ligue 1",           group: "Soccer" },
  { sport: "soccer",     league: "ned.1",                      label: "Eredivisie",        group: "Soccer" },
  { sport: "soccer",     league: "uefa.europa",                label: "Europa League",     group: "Soccer" },
  { sport: "soccer",     league: "mex.1",                      label: "Liga MX",           group: "Soccer" },
  { sport: "soccer",     league: "eng.2",                      label: "Championship",      group: "Soccer" },
];

const MIN_GAMES_PLAYED = 3; // below this, a record is too small a sample to trust

// ── log5 — Bill James' formula for win probability from two teams' win rates ──

function log5(pA: number, pB: number): number {
  const denom = pA + pB - 2 * pA * pB;
  if (denom === 0) return 0.5;
  return (pA - pA * pB) / denom;
}

// ── ESPN response shapes (only the fields we use) ─────────────────────────────

type EspnTeam = { id: string; displayName: string; abbreviation?: string };
type EspnCompetitor = { id: string; homeAway: "home" | "away"; team: EspnTeam; score?: string };
type EspnStatus = { type: { state: "pre" | "in" | "post"; completed: boolean; detail?: string; shortDetail?: string } };
/**
 * A book's line as the scoreboard carries it.
 *
 * Taken from the scoreboard rather than asked for separately: the schedule is
 * already being fetched for every league and day, so reading the line from the
 * same response costs nothing. Every field is optional because a league may
 * carry no line at all, and most of the ones here do not.
 */
export type EspnOdds = {
  provider?: { name?: string };
  details?: string;
  overUnder?: number | string;
  homeTeamOdds?: { moneyLine?: number | string };
  awayTeamOdds?: { moneyLine?: number | string };
};
export type EspnEvent = {
  id: string;
  date: string;
  competitions: Array<{ competitors: EspnCompetitor[]; status: EspnStatus; odds?: EspnOdds[] }>;
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

export async function fetchStandings(sport: string, league: string): Promise<Map<string, TeamRecord>> {
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

/** A line in the shape the log stores, or null when a league carries none. */
export type CapturedLine = {
  spread: string | null;
  total: number | null;
  homeMl: number | null;
  awayMl: number | null;
  book: string | null;
};

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/^\+/, "").trim());
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
};

/**
 * The line an event's scoreboard entry carries, if any.
 *
 * Returns null — not an empty line — when nothing usable is there, so a league
 * with no market is recorded as having no market rather than as a pick-em at
 * zero. Those are different claims and only one of them is true.
 */
export function captureLine(ev: EspnEvent): CapturedLine | null {
  const o = ev.competitions?.[0]?.odds?.[0];
  if (!o) return null;
  const line: CapturedLine = {
    spread: typeof o.details === "string" && o.details.trim() ? o.details.trim() : null,
    total: asNumber(o.overUnder),
    homeMl: asNumber(o.homeTeamOdds?.moneyLine),
    awayMl: asNumber(o.awayTeamOdds?.moneyLine),
    book: typeof o.provider?.name === "string" && o.provider.name.trim() ? o.provider.name.trim() : null,
  };
  const hasAnything = line.spread !== null || line.total !== null || line.homeMl !== null || line.awayMl !== null;
  return hasAnything ? line : null;
}

export function recordLabel(r: TeamRecord | undefined): string | null {
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

export function isExhibition(homeName: string, awayName: string): boolean {
  return [homeName, awayName].some(n => !n || AGGREGATE_TEAMS.has(n) || /all[- ]star/i.test(n));
}

function toDateKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function fetchScoreboard(league: League, dates: string): Promise<EspnEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard?dates=${dates}`,
      { cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as EspnScoreboard;
    return data.events ?? [];
  } catch { return []; }
}

const toScore = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function predictFromEvent(ev: EspnEvent, league: League, standings: Map<string, TeamRecord>): GamePrediction | null {
  const comp = ev.competitions[0];
  const home = comp.competitors.find(c => c.homeAway === "home");
  const away = comp.competitors.find(c => c.homeAway === "away");
  if (!home || !away) return null;
  if (isExhibition(home.team.displayName, away.team.displayName)) return null;

  const state = comp.status?.type?.state ?? "pre";

  const homeRec = standings.get(home.team.id);
  const awayRec = standings.get(away.team.id);
  const enoughData = !!homeRec && !!awayRec && homeRec.games >= MIN_GAMES_PLAYED && awayRec.games >= MIN_GAMES_PLAYED;

  let predictedWinner: string | null = null;
  let winnerConfidence: number | null = null;
  // Only an unstarted game gets a prediction here.
  //
  // Standings are read live, and once a game has finished they already contain
  // its result — so computing a "prediction" for it would be hindsight wearing
  // a forecast's clothes, and it would be flattering. What we actually said
  // beforehand is snapshotted by the cron and shown on the track record, which
  // is the only place such a claim can be checked.
  if (enoughData && state === "pre") {
    const pHome = log5(homeRec!.winPct, awayRec!.winPct);
    winnerConfidence = Math.round(Math.max(pHome, 1 - pHome) * 1000) / 10;
    predictedWinner  = pHome >= 0.5 ? home.team.displayName : away.team.displayName;
  }

  return {
    id:           ev.id,
    state,
    statusDetail: comp.status?.type?.detail ?? comp.status?.type?.shortDetail ?? null,
    homeScore:    toScore(home.score),
    awayScore:    toScore(away.score),
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
  };
}

const UPCOMING_DAYS = 7;

/**
 * How far back to look for games already played.
 *
 * Two days is enough to catch last night's results without turning the page
 * into an archive. The track record is where history belongs; this is so a
 * finished game can still be opened while anyone would plausibly want to.
 */
const RECENT_DAYS = 2;

type Window = { back: number; forward: number; states: ReadonlySet<"pre" | "in" | "post"> };

/** Only unstarted games. What the cron snapshots, and it must stay that way. */
const PRE_ONLY: Window = { back: 0, forward: UPCOMING_DAYS, states: new Set(["pre"] as const) };

/** Everything worth showing: what is coming, what is on, what just finished. */
const EVERYTHING: Window = { back: RECENT_DAYS, forward: UPCOMING_DAYS, states: new Set(["pre", "in", "post"] as const) };

async function fetchLeagueWindow(league: League, w: Window): Promise<GamePrediction[]> {
  // ESPN stopped accepting date ranges ("20261009-20261019" → 400), so ask
  // for each day separately and de-duplicate.
  const days: string[] = [];
  for (let i = -w.back; i < w.forward; i++) days.push(toDateKey(new Date(Date.now() + i * 86_400_000)));

  const [perDay, standings] = await Promise.all([
    Promise.all(days.map(d => fetchScoreboard(league, d))),
    fetchStandings(league.sport, league.league),
  ]);
  const seen = new Set<string>();
  const events = perDay.flat().filter(ev => (seen.has(ev.id) ? false : (seen.add(ev.id), true)));

  const games: GamePrediction[] = [];
  for (const ev of events) {
    const state = ev.competitions?.[0]?.status?.type?.state;
    if (!state || !w.states.has(state)) continue;
    const g = predictFromEvent(ev, league, standings);
    if (g) games.push(g);
  }
  return games;
}

/** Unstarted games with predictions. */
export async function fetchLeagueUpcoming(league: League): Promise<GamePrediction[]> {
  return fetchLeagueWindow(league, PRE_ONLY);
}

/**
 * Unstarted games only — what the track-record cron snapshots.
 *
 * Kept separate from the page's fetch on purpose. If the cron ever logged a
 * game already under way it would be recording a prediction it did not make
 * before the fact, which is the one thing that would make the whole track
 * record worthless.
 */
export async function fetchAllUpcoming(): Promise<GamePrediction[]> {
  const results = await Promise.all(LEAGUES.map(fetchLeagueUpcoming));
  return results.flat().sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
}

/**
 * Everything the page shows: upcoming, live, and recently finished.
 *
 * Live first, because a game in progress is the most useful thing on the
 * screen; then what is coming, soonest first; then what just finished, most
 * recent first.
 */
export async function fetchAllGames(): Promise<GamePrediction[]> {
  const results = await Promise.all(LEAGUES.map(l => fetchLeagueWindow(l, EVERYTHING)));
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return results.flat().sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    const at = new Date(a.commenceTime).getTime();
    const bt = new Date(b.commenceTime).getTime();
    // Finished games read best newest-first; everything else soonest-first.
    return a.state === "post" ? bt - at : at - bt;
  });
}
