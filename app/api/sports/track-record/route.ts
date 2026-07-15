export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { auth } from "@/auth";
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
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("sports_predictions_log")
      .select("id, league, home_team, away_team, predicted_winner, confidence, commence_time, actual_winner, resolved_at")
      .not("resolved_at", "is", null)
      .not("predicted_winner", "is", null)
      .order("commence_time", { ascending: false })
      .limit(2000);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LoggedRow[];
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

    const payload = { overall, byTier, byLeague, recent, updatedAt: new Date().toISOString() };
    cache = { data: payload, ts: Date.now() };
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Database not available" }, { status: 503 });
  }
}
