export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { viewer } from "@/app/lib/viewer";
import { fetchGameDetail } from "@/app/lib/sportsDetail";
import { LEAGUES } from "@/app/lib/sportsPredictions";
import { MATCH_COMPS, EVENT_COMPS, splitCompPath } from "@/app/lib/sportsEvents";

// One game in full: lineups, venue, odds, injuries, officials, broadcast.
//
// Takes the sport and league from the query rather than accepting any path:
// these values are interpolated into an upstream URL, so they are checked
// against the leagues the app actually covers. Without that this route would
// forward an arbitrary path to ESPN on a caller's behalf.

/**
 * Every competition the app can open a page for.
 *
 * Built from the same lists the fetching uses — the nineteen leagues that get
 * a prediction, plus every competition on the "more sports" schedule — so a
 * sport cannot appear on the games list without the route accepting it, or the
 * other way round. Cricket is addressed by a competition id that arrives in
 * its feed rather than from a list here, so it is matched on the sport alone.
 */
const COVERED = new Set<string>([
  ...LEAGUES.map(l => `${l.sport}/${l.league}`),
  ...[...MATCH_COMPS, ...EVENT_COMPS]
    .map(c => splitCompPath(c.path))
    .filter((p): p is { sport: string; league: string } => p !== null)
    .map(p => `${p.sport}/${p.league}`),
]);

function covered(sport: string, league: string): boolean {
  if (COVERED.has(`${sport}/${league}`)) return true;
  // Cricket's competitions are many and are named by the upstream feed, not by
  // us. The league half is still checked for shape below, and an id ESPN does
  // not know simply comes back as not_found.
  return sport === "cricket" && /^[\w.-]{1,40}$/.test(league);
}

/** A short cache, because a lineup changes on the hour and a venue never does. */
const CACHE_TTL = 2 * 60 * 1000;
const cache = new Map<string, { body: unknown; status: number; ts: number }>();

/** Bounded so a long session cannot grow this without end. */
const MAX_CACHE = 200;

function cached(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) { cache.delete(key); return null; }
  return hit;
}

function remember(key: string, body: unknown, status: number) {
  if (cache.size >= MAX_CACHE) {
    // Oldest insertion first — Map preserves it.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { body, status, ts: Date.now() });
}

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const sport = (url.searchParams.get("sport") ?? "").trim();
  const league = (url.searchParams.get("league") ?? "").trim();
  const event = (url.searchParams.get("event") ?? "").trim();

  if (!sport || !league || !event) {
    return Response.json(
      { ok: false, reason: "bad_request", hint: "sport, league and event are all required." },
      { status: 400 },
    );
  }

  // An event id is always digits upstream. Checking it keeps anything else out
  // of the URL this route builds.
  if (!/^\d{1,20}$/.test(event)) {
    return Response.json(
      { ok: false, reason: "bad_request", hint: "An event id is a number." },
      { status: 400 },
    );
  }

  if (!covered(sport, league)) {
    return Response.json(
      { ok: false, reason: "unsupported_league", hint: "This competition is not one the app covers." },
      { status: 400 },
    );
  }

  const key = `${sport}/${league}/${event}`;
  const hit = cached(key);
  if (hit) return Response.json(hit.body, { status: hit.status });

  const result = await fetchGameDetail(sport, league, event);

  if (!result.ok) {
    // Three different facts, said three different ways: the game is gone, the
    // source did not answer, or we could not understand what it said. A page
    // that showed one sentence for all three would send a reader to refresh
    // over a bug, or to report a bug over a cancelled game.
    const status = result.reason === "not_found" ? 404 : 503;
    const hint =
      result.reason === "not_found"  ? "That game is not on ESPN's schedule — it may have been postponed or rescheduled."
      : result.reason === "unavailable" ? "The source didn't answer. Try again in a moment."
      : "We reached the source but couldn't read its answer. That's a fault on our side, not a missing game.";
    const body = { ok: false, reason: result.reason, hint, detail: result.detail };
    // Only a shape fault is worth caching: the other two should be retried.
    if (result.reason === "unexpected_shape") remember(key, body, status);
    return Response.json(body, { status });
  }

  const body = { ok: true, detail: result.detail, updatedAt: new Date().toISOString() };
  remember(key, body, 200);
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
