export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { auth } from "@/auth";
import { parseGameSummary, summaryUrl } from "@/app/lib/sportsDetail";

// What ESPN's summary endpoint actually sends back, and which of our parsers
// found anything in it.
//
// This exists because of a specific and repeated failure. The sandbox the game
// page was written in cannot reach ESPN — the network policy denies it — so the
// parsers were written against the documented shape rather than a real
// response, and the first thing anyone saw on the page was a lot of absences.
// Guessing again would have been the same mistake twice.
//
// The deployment CAN reach ESPN. So this returns an outline of the real payload
// — keys, types, array lengths, a few sample values — next to a report of what
// each parser got out of it. That turns "no lineups showed" into "lineups live
// under this key and we looked under that one", which is fixable in one pass.
//
// Owner only. It exposes nothing private — it is public sports data either way
// — but it is a developer tool and does not belong on a reader's path.

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

/** Longest a sample string is worth printing. */
const SAMPLE = 60;

/** Most keys to describe at one level, so one huge object cannot flood the output. */
const MAX_KEYS = 40;

/**
 * A structural outline: what is here, of what type, how much of it.
 *
 * Values are described rather than dumped. A box score is hundreds of
 * kilobytes and the question is never what Jokic scored, it is which key the
 * players are under.
 */
function outline(v: unknown, depth: number): unknown {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[] (empty)";
    if (depth <= 0) return `[${v.length} items]`;
    // One item describes the shape; the length says how many there are.
    return { _count: v.length, _first: outline(v[0], depth - 1) };
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (depth <= 0) return `{${keys.length} keys: ${keys.slice(0, 12).join(", ")}${keys.length > 12 ? ", …" : ""}}`;
    const out: Record<string, unknown> = {};
    for (const k of keys.slice(0, MAX_KEYS)) out[k] = outline(o[k], depth - 1);
    if (keys.length > MAX_KEYS) out._more = `${keys.length - MAX_KEYS} more keys`;
    return out;
  }
  if (typeof v === "string") return v.length > SAMPLE ? `"${v.slice(0, SAMPLE)}…"` : `"${v}"`;
  return v;
}

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.email !== OWNER_EMAIL) {
    // Deliberately does not say who the owner is.
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const sport = (url.searchParams.get("sport") ?? "").trim();
  const league = (url.searchParams.get("league") ?? "").trim();
  const event = (url.searchParams.get("event") ?? "").trim();
  const depth = Math.min(6, Math.max(1, Number(url.searchParams.get("depth") ?? 3) || 3));

  if (!/^[\w-]{1,30}$/.test(sport) || !/^[\w.-]{1,40}$/.test(league) || !/^\d{1,20}$/.test(event)) {
    return Response.json({
      error: "sport, league and event are required",
      example: "/api/sports/shape?sport=basketball&league=nba&event=401584692&depth=3",
      hint: "Take the three values from the game page's own URL.",
    }, { status: 400 });
  }

  // The same URL the page uses, so the diagnostic cannot disagree with it.
  const target = summaryUrl(sport, league, event);

  let body: unknown;
  try {
    const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return Response.json({ error: `ESPN answered ${res.status}`, url: target }, { status: 502 });
    body = await res.json();
  } catch (e) {
    return Response.json({
      error: "could not reach ESPN",
      detail: e instanceof Error ? e.message.slice(0, 160) : String(e),
    }, { status: 502 });
  }

  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const parsed = parseGameSummary(body, { eventId: event, sport, league });

  // What each parser actually got. This is the half that says where to look:
  // a section that is null here while the outline shows data present is a
  // parser reading the wrong key.
  const found = parsed === null ? null : {
    kind: parsed.kind,
    lineupHome: parsed.kind === "head_to_head" ? (parsed.home.lineup?.length ?? null) : null,
    lineupHomeKind: parsed.kind === "head_to_head" ? parsed.home.lineupKind : null,
    lineupAway: parsed.kind === "head_to_head" ? (parsed.away.lineup?.length ?? null) : null,
    field: parsed.kind === "field" ? (parsed.field?.length ?? null) : null,
    bouts: parsed.kind === "card" ? (parsed.bouts?.length ?? null) : null,
    venue: parsed.venue?.name ?? null,
    odds: parsed.odds === null ? null : parsed.odds.spread ?? "present",
    injuriesHome: parsed.kind === "head_to_head" ? (parsed.home.injuries?.length ?? null) : null,
    formHome: parsed.kind === "head_to_head" ? parsed.home.form : null,
    broadcasts: parsed.broadcasts,
    officials: parsed.officials?.length ?? null,
    weather: parsed.weather,
    espnWinProbability: parsed.espnWinProbability,
    unreadable: parsed.unreadable,
  };

  return Response.json({
    asked: { sport, league, event, depth },
    /** Every top-level key ESPN sent, which is the first thing to compare against. */
    topLevelKeys: Object.keys(root).sort(),
    /** Where a lineup could plausibly live, so the right one can be identified. */
    lineupCandidates: {
      rosters: outline(root.rosters, 4),
      "boxscore.players": outline((root.boxscore as Record<string, unknown> | undefined)?.players, 4),
      "boxscore.teams[].players": outline(
        ((root.boxscore as { teams?: Array<{ players?: unknown }> } | undefined)?.teams ?? [])
          .map(t => t?.players),
        4,
      ),
      leadersFull: outline(root.leaders, 3),
      probables: outline(root.probables, 3),
      leaders: outline(root.leaders, 2),
    },
    oddsCandidates: {
      pickcenter: outline(root.pickcenter, 3),
      odds: outline(root.odds, 3),
    },
    outline: outline(body, depth),
    /** What our parsers made of it. Nulls next to present data are the bugs. */
    found,
  }, { headers: { "Cache-Control": "no-store" } });
}
