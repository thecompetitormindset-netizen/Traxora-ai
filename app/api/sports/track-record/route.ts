export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { viewer } from "@/app/lib/viewer";
import {
  devig, favouredSide, winner, marketRecord, ourRecord, versusMarket, calibration,
  type GradedGame,
} from "@/app/lib/marketGrading";
import { supabaseAdmin } from "@/app/lib/supabase";

type LoggedRow = {
  id:               string;
  league:           string;
  home_team:        string;
  away_team:        string;
  predicted_winner: string | null;
  confidence:       number | null;
  commence_time:    string;
  actual_winner:    string | null;
  resolved_at:      string | null;
  // Final scores: a winner alone cannot grade a spread or a total.
  home_score:          number | null;
  away_score:          number | null;
  // What a book was offering, last read before the game started.
  closing_spread:      string | null;
  closing_total:       number | null;
  closing_home_ml:     number | null;
  closing_away_ml:     number | null;
  closing_book:        string | null;
  closing_captured_at: string | null;
};

const TIERS = [
  { label: "50–60%", min: 50, max: 60 },
  { label: "60–70%", min: 60, max: 70 },
  { label: "70–80%", min: 70, max: 80 },
  { label: "80–90%", min: 80, max: 90 },
  { label: "90–100%", min: 90, max: 101 },
];

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const db = supabaseAdmin();

    // The columns the track record has always needed, and the ones the market
    // panel adds. Kept apart because the second set arrived later: asking for
    // them in one select meant that until the migration ran, the whole page
    // answered 503 — a feature nobody had yet taking down one that worked.
    const CORE = "id, league, home_team, away_team, predicted_winner, confidence, commence_time, actual_winner, resolved_at";
    const MARKET = "home_score, away_score, closing_spread, closing_total, closing_home_ml, closing_away_ml, closing_book, closing_captured_at";

    const query = (columns: string) => db
      .from("sports_predictions_log")
      .select(columns)
      .not("resolved_at", "is", null)
      .not("predicted_winner", "is", null)
      .order("commence_time", { ascending: false })
      .limit(2000);

    let { data, error } = await query(`${CORE}, ${MARKET}`);
    let marketColumnsPresent = true;

    if (error) {
      // Fall back rather than fail. If the market columns are not there yet,
      // the record of our own picks is still perfectly good and is what this
      // page is for; the market panel simply says it has nothing yet.
      marketColumnsPresent = false;
      ({ data, error } = await query(CORE));
    }

    if (error) throw new Error(error.message);
    // The two selects return different column sets, so the client's inferred
    // row type cannot cover both. The narrowing below treats every market
    // column as possibly absent, which is exactly what the fallback means.
    const rows = ((data ?? []) as unknown[]).map(r => r as Partial<LoggedRow> & {
      id: string; league: string; home_team: string; away_team: string;
      predicted_winner: string | null; confidence: number | null;
      commence_time: string; actual_winner: string | null;
    });
    // Ties/draws have no winner to grade against — exclude, don't count as misses.
    const graded = rows.filter(r => r.actual_winner !== null);

    const overall = {
      total:   graded.length,
      correct: graded.filter(r => r.predicted_winner === r.actual_winner).length,
    };

    const byTier = TIERS.map(t => {
      const inTier = graded.filter(r => r.confidence !== null && r.confidence >= t.min && r.confidence < t.max);
      return {
        label:   t.label,
        total:   inTier.length,
        correct: inTier.filter(r => r.predicted_winner === r.actual_winner).length,
      };
    });

    const leagueSet = [...new Set(graded.map(r => r.league))];
    const byLeague = leagueSet.map(league => {
      const inLeague = graded.filter(r => r.league === league);
      return {
        league,
        total:   inLeague.length,
        correct: inLeague.filter(r => r.predicted_winner === r.actual_winner).length,
      };
    }).sort((a, b) => b.total - a.total);

    const recent = graded.slice(0, 30).map(r => ({
      id:              r.id,
      league:          r.league,
      homeTeam:        r.home_team,
      awayTeam:        r.away_team,
      predictedWinner: r.predicted_winner,
      confidence:      r.confidence,
      actualWinner:    r.actual_winner,
      hit:             r.predicted_winner === r.actual_winner,
      commenceTime:    r.commence_time,
    }));

    // ── The market, graded the same way ──────────────────────────────────
    //
    // Our own hit rate says very little by itself: being right 58% of the time
    // where the closing line implied 57% is no edge at all. So the same games
    // are graded against what a book was offering, and the two are shown side
    // by side.
    const marketGames: GradedGame[] = [];
    for (const r of graded) {
      // Needs both sides of a moneyline to say what the market implied, and
      // the final scores to know what happened.
      const homeScore = r.home_score ?? null;
      const awayScore = r.away_score ?? null;
      if (homeScore === null || awayScore === null) continue;
      const fair = devig(r.closing_home_ml ?? null, r.closing_away_ml ?? null);
      const favoured = favouredSide(r.closing_home_ml ?? null, r.closing_away_ml ?? null);
      const result = winner(homeScore, awayScore);
      // Our pick is stored as a team NAME; the grading works in sides.
      const ourPick: "home" | "away" | null =
        r.predicted_winner === r.home_team ? "home"
        : r.predicted_winner === r.away_team ? "away"
        : null;
      marketGames.push({
        marketPick: favoured,
        marketProbability: fair === null || favoured === null ? null : (favoured === "home" ? fair.home : fair.away),
        ourPick,
        ourProbability: r.confidence === null ? null : r.confidence / 100,
        result,
      });
    }

    const market = !marketColumnsPresent ? {
      record: { hitRate: null, correct: 0, graded: 0, note: null },
      ours:   { hitRate: null, correct: 0, graded: 0, note: null },
      versus: { disagreements: 0, weWere: 0, ourShare: null, note: null },
      calibration: calibration([]),
      gamesWithALine: 0,
      // Said as the fact it is. The columns arrive with the next run of
      // /api/cron/migrate, which applies them itself.
      note: "The closing line isn't being recorded yet — the database is still waiting for its new columns, which /api/cron/migrate adds.",
    } : {
      /** How often the book's favourite won. */
      record: marketRecord(marketGames),
      /** Ours over the same games, counted identically so they compare. */
      ours: ourRecord(marketGames),
      /** The only test of an edge: the games where we took the other side. */
      versus: versusMarket(marketGames),
      /** Did the chances it implied come up at that rate? */
      calibration: calibration(marketGames),
      /** How many settled games carry a usable line at all. */
      gamesWithALine: marketGames.filter(g => g.marketPick !== null).length,
      /**
       * Said plainly, because an empty market panel otherwise reads as a
       * fault rather than as "no book quotes these leagues".
       */
      note: marketGames.some(g => g.marketPick !== null)
        ? null
        : "No closing line has been recorded yet for any settled game. ESPN carries one for some leagues and not others, and lines are only captured from the day this went live onward.",
    };

    const payload = { overall, byTier, byLeague, recent, market, updatedAt: new Date().toISOString() };
    cache = { data: payload, ts: Date.now() };
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database not available" }, { status: 503 });
  }
}
