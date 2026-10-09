export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { LEAGUES, fetchAllUpcoming, fetchScoreboard } from "@/app/lib/sportsPredictions";

// Snapshots today's predictions (before games start, so nothing is graded with
// hindsight) and backfills results for previously-logged games that have since
// finished. This is what makes /sports/track-record an honest accuracy record
// instead of a claim nobody can check.

function toDateKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

type ScoreInfo = { completed: boolean; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };

async function collectRecentResults(): Promise<Map<string, ScoreInfo>> {
  const results = new Map<string, ScoreInfo>();
  // One request per day: ESPN rejects date ranges.
  const days = Array.from({ length: 5 }, (_, i) => toDateKey(new Date(Date.now() - i * 86_400_000)));

  await Promise.all(LEAGUES.map(async league => {
    const events = (await Promise.all(days.map(d => fetchScoreboard(league, d)))).flat();
    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp || comp.status.type.state !== "post" || !comp.status.type.completed) continue;
      const home = comp.competitors.find(c => c.homeAway === "home");
      const away = comp.competitors.find(c => c.homeAway === "away");
      if (!home || !away) continue;
      results.set(ev.id, {
        completed: true,
        homeTeam: home.team.displayName,
        awayTeam: away.team.displayName,
        homeScore: Number(home.score ?? 0),
        awayScore: Number(away.score ?? 0),
      });
    }
  }));
  return results;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("CRON_SECRET not configured", { status: 500 });
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { supabaseAdmin } = await import("@/app/lib/supabase");
    const db = supabaseAdmin();

    // ── Snapshot: log any current prediction not already logged ──
    const upcoming = await fetchAllUpcoming();
    const withPick = upcoming.filter(g => g.predictedWinner !== null);
    let logged = 0;
    if (withPick.length > 0) {
      const rows = withPick.map(g => ({
        id:               g.id,
        league:           g.league,
        league_group:     g.leagueGroup,
        home_team:        g.homeTeam,
        away_team:        g.awayTeam,
        predicted_winner: g.predictedWinner,
        confidence:       g.winnerConfidence,
        commence_time:    g.commenceTime,
      }));
      // ignoreDuplicates so an already-logged prediction is never overwritten
      // by a later run with updated (post-hoc) confidence.
      const { error } = await db.from("sports_predictions_log").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) console.error("sports-track-record snapshot error:", error.message);
      else logged = rows.length;
    }

    // ── Resolve: backfill outcomes for previously-logged, now-finished games ──
    const { data: unresolved, error: fetchErr } = await db
      .from("sports_predictions_log")
      .select("id, home_team, away_team, predicted_winner")
      .is("resolved_at", null)
      .lt("commence_time", new Date().toISOString());

    if (fetchErr) {
      console.error("sports-track-record unresolved fetch error:", fetchErr.message);
      return Response.json({ logged, resolved: 0, error: fetchErr.message });
    }

    let resolved = 0;
    if (unresolved && unresolved.length > 0) {
      const results = await collectRecentResults();
      for (const row of unresolved) {
        const info = results.get(row.id);
        if (!info) continue; // not finished yet, or outside the lookback window
        const actualWinner = info.homeScore === info.awayScore
          ? null // tie/draw — no winner to grade against
          : info.homeScore > info.awayScore ? info.homeTeam : info.awayTeam;
        await db.from("sports_predictions_log")
          .update({ actual_winner: actualWinner, resolved_at: new Date().toISOString() })
          .eq("id", row.id);
        resolved++;
      }
    }

    return Response.json({ logged, resolved });
  } catch (err) {
    console.error("sports-track-record error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Database not available" }, { status: 503 });
  }
}
