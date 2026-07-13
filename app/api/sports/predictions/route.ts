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
  predictedWinner:  string | null;
  winnerConfidence: number | null;   // 0-100, vig-removed implied probability
  predictedScore:   { home: number; away: number } | null;
  moneyline:        { home: number | null; away: number | null };
  bookmakerCount:   number;
};

// ── Leagues covered ───────────────────────────────────────────────────────────
// The Odds API sport keys. Games only appear once a bookmaker has posted a
// line — usually within ~1-2 weeks of kickoff — so "every game" means every
// game with odds live right now, not the full season schedule.

const LEAGUES: Array<{ key: string; label: string; group: "US" | "Soccer" }> = [
  { key: "americanfootball_nfl",       label: "NFL",               group: "US"     },
  { key: "basketball_nba",             label: "NBA",               group: "US"     },
  { key: "baseball_mlb",               label: "MLB",               group: "US"     },
  { key: "icehockey_nhl",              label: "NHL",               group: "US"     },
  { key: "americanfootball_ncaaf",     label: "College Football",  group: "US"     },
  { key: "basketball_ncaab",           label: "College Basketball",group: "US"     },
  { key: "basketball_wnba",            label: "WNBA",              group: "US"     },
  { key: "mma_mixed_martial_arts",     label: "MMA / UFC",         group: "US"     },
  { key: "boxing_boxing",              label: "Boxing",            group: "US"     },
  { key: "soccer_fifa_world_cup",      label: "World Cup",         group: "Soccer" },
  { key: "soccer_epl",                 label: "Premier League",    group: "Soccer" },
  { key: "soccer_uefa_champs_league",  label: "Champions League",  group: "Soccer" },
  { key: "soccer_spain_la_liga",       label: "La Liga",           group: "Soccer" },
  { key: "soccer_italy_serie_a",       label: "Serie A",           group: "Soccer" },
  { key: "soccer_germany_bundesliga",  label: "Bundesliga",        group: "Soccer" },
  { key: "soccer_usa_mls",             label: "MLS",               group: "Soccer" },
];

// ── Odds → prediction math ────────────────────────────────────────────────────

function americanToImplied(price: number): number {
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

// Raw American-odds prices can't be arithmetic-averaged across bookmakers —
// when the favorite flips sign between books on a near-toss-up game, the
// mean lands between -100 and 100, which isn't a valid odds value. Average
// in probability space instead, then convert back.
function impliedToAmerican(prob: number): number | null {
  if (prob <= 0 || prob >= 1) return null;
  return Math.round(prob >= 0.5 ? (-100 * prob) / (1 - prob) : (100 * (1 - prob)) / prob);
}

type OddsOutcome = { name: string; price: number; point?: number };
type OddsMarket  = { key: string; outcomes: OddsOutcome[] };
type OddsBookmaker = { key: string; title: string; markets: OddsMarket[] };
type OddsEvent = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

function scoreDecimals(group: "US" | "Soccer", sportKey: string): number {
  if (group === "Soccer") return 0;               // goals are whole numbers
  if (sportKey === "baseball_mlb") return 0;       // runs are whole numbers
  return 0;                                        // NFL/NBA/NHL points also whole
}

function predictGame(ev: OddsEvent, league: { key: string; label: string; group: "US" | "Soccer" }): GamePrediction {
  const bookmakers = ev.bookmakers ?? [];

  // Consensus moneyline: average vig-removed implied probability across books.
  let homeProbSum = 0, awayProbSum = 0, mlBooks = 0;
  for (const bk of bookmakers) {
    const h2h = bk.markets.find(m => m.key === "h2h");
    if (!h2h) continue;
    const home = h2h.outcomes.find(o => o.name === ev.home_team);
    const away = h2h.outcomes.find(o => o.name === ev.away_team);
    if (!home || !away) continue;
    const hImp = americanToImplied(home.price);
    const aImp = americanToImplied(away.price);
    const sum  = hImp + aImp;
    if (sum <= 0) continue;
    homeProbSum += hImp / sum;   // vig-removed, normalized to 100%
    awayProbSum += aImp / sum;
    mlBooks++;
  }

  // Consensus spread + total → derived score, same method bettors use:
  // favorite = (total + |spread|) / 2, underdog = (total - |spread|) / 2.
  let totalSum = 0, totalBooks = 0;
  let spreadSum = 0, spreadBooks = 0, favoriteIsHome = true;
  for (const bk of bookmakers) {
    const totals = bk.markets.find(m => m.key === "totals");
    if (totals) {
      const over = totals.outcomes.find(o => o.name === "Over");
      if (over?.point != null) { totalSum += over.point; totalBooks++; }
    }
    const spreads = bk.markets.find(m => m.key === "spreads");
    if (spreads) {
      const homeSide = spreads.outcomes.find(o => o.name === ev.home_team);
      if (homeSide?.point != null) {
        spreadSum += Math.abs(homeSide.point);
        if (homeSide.point < 0) favoriteIsHome = true; else favoriteIsHome = false;
        spreadBooks++;
      }
    }
  }

  const winnerConfidence = mlBooks > 0
    ? Math.round((Math.max(homeProbSum, awayProbSum) / mlBooks) * 1000) / 10
    : null;
  const predictedWinner = mlBooks > 0
    ? (homeProbSum >= awayProbSum ? ev.home_team : ev.away_team)
    : null;

  let predictedScore: GamePrediction["predictedScore"] = null;
  if (totalBooks > 0 && spreadBooks > 0) {
    const total  = totalSum / totalBooks;
    const spread = spreadSum / spreadBooks;
    const favScore = (total + spread) / 2;
    const dogScore = (total - spread) / 2;
    const dec = scoreDecimals(league.group, league.key);
    const round = (n: number) => Math.max(0, Number(n.toFixed(dec)));
    predictedScore = favoriteIsHome
      ? { home: round(favScore), away: round(dogScore) }
      : { home: round(dogScore), away: round(favScore) };
  }

  return {
    id:               ev.id,
    sportKey:         league.key,
    league:           league.label,
    leagueGroup:      league.group,
    commenceTime:     ev.commence_time,
    homeTeam:         ev.home_team,
    awayTeam:         ev.away_team,
    predictedWinner,
    winnerConfidence,
    predictedScore,
    moneyline: {
      home: mlBooks > 0 ? impliedToAmerican(homeProbSum / mlBooks) : null,
      away: mlBooks > 0 ? impliedToAmerican(awayProbSum / mlBooks) : null,
    },
    bookmakerCount: bookmakers.length,
  };
}

// Exhibition events pit league aggregates against each other ("American League
// @ National League" for the MLB All-Star Game, AFC @ NFC for the Pro Bowl).
// They're not real schedule games — users expect team-vs-team matchups only.
const AGGREGATE_TEAMS = new Set([
  "American League", "National League",
  "AFC", "NFC", "American Football Conference", "National Football Conference",
  "Team AFC", "Team NFC",
]);

function isExhibition(ev: OddsEvent): boolean {
  return [ev.home_team, ev.away_team].some(
    n => !n || AGGREGATE_TEAMS.has(n) || /all[- ]star/i.test(n),
  );
}

async function fetchLeague(
  league: { key: string; label: string; group: "US" | "Soccer" },
  apiKey: string,
  status: { quotaHit: boolean },
): Promise<GamePrediction[]> {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${league.key}/odds/` +
      `?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160);
      if (res.status === 401 && body.includes("OUT_OF_USAGE")) status.quotaHit = true;
      console.warn(`[sports] ${league.key} odds fetch failed: HTTP ${res.status} ${body}`);
      return [];
    }
    const events = await res.json() as OddsEvent[];
    if (!Array.isArray(events)) return [];
    return events.filter(ev => !isExhibition(ev)).map(ev => predictGame(ev, league));
  } catch { return []; }
}

// ── Cache — odds don't move fast enough to justify hitting the API every load ─

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 120 * 60 * 1000; // 120 min — 16 leagues x 3 markets ≈ 48 credits/refresh, ~17K/mo on the 20K plan

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return Response.json({ games: [], configured: false, updatedAt: new Date().toISOString() });
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const status = { quotaHit: false };
  const results = await Promise.all(LEAGUES.map(l => fetchLeague(l, apiKey, status)));
  const games = results.flat().sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());

  const payload = {
    games,
    configured: true,
    quotaExhausted: status.quotaHit && games.length === 0,
    updatedAt: new Date().toISOString(),
  };
  if (games.length > 0) {
    cache = { data: payload, ts: Date.now() };
  } else {
    // Cache empty results too (10 min) — without this, every page load refires
    // 16 upstream requests, which is what burns quota during outages/off-hours.
    cache = { data: payload, ts: Date.now() - (CACHE_TTL - 10 * 60 * 1000) };
  }
  return Response.json(payload);
}
