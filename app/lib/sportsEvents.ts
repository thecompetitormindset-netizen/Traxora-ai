// "More sports" for the /sports page: schedules for sports where we don't
// make predictions (no team-record model fits them) — cricket, rugby, AFL,
// field and college ice hockey, volleyball, lacrosse, CFL, FIBA, tennis,
// golf, motor racing, UFC and top chess tournaments.
//
// Sources (free, no key): ESPN's public scoreboards (per competition, one day
// at a time — ranges are rejected), ESPN's cricket "header" feed (every
// cricket competition at once), and Lichess's official broadcasts for chess.
// Horse racing and boxing have no free public schedule, so they're absent.

export type SportEvent = {
  id: string;
  sport: string;          // "Cricket", "Tennis", "Chess", …
  league: string;         // competition name
  name: string;           // "India v West Indies", "China Open", …
  start: string;          // ISO
  end: string | null;     // multi-day events (tournaments, races weekends)
  live: boolean;
  url: string | null;     // more info (chess broadcasts)
};

type EspnEvent = { id: string; name?: string; shortName?: string; date: string; endDate?: string; competitions?: { status?: { type?: { state?: string } } }[]; status?: { type?: { state?: string } } };
type Board = { events?: EspnEvent[]; leagues?: { name?: string }[] };

const MATCH_COMPS: { sport: string; path: string }[] = [
  { sport: "Rugby", path: "rugby/164205" },          // Rugby World Cup
  { sport: "Rugby", path: "rugby/267979" },          // Premiership Rugby
  { sport: "Rugby league", path: "rugby-league/3" }, // NRL
  { sport: "Australian football", path: "australian-football/afl" },
  { sport: "Field hockey", path: "field-hockey/womens-college-field-hockey" },
  { sport: "College ice hockey", path: "hockey/mens-college-hockey" },
  { sport: "Volleyball", path: "volleyball/womens-college-volleyball" },
  { sport: "Lacrosse", path: "lacrosse/pll" },
  { sport: "Canadian football", path: "football/cfl" },
  { sport: "Basketball", path: "basketball/fiba" },
];

const EVENT_COMPS: { sport: string; path: string }[] = [
  { sport: "Tennis", path: "tennis/atp" },
  { sport: "Tennis", path: "tennis/wta" },
  { sport: "Golf", path: "golf/pga" },
  { sport: "Golf", path: "golf/lpga" },
  { sport: "Motor racing", path: "racing/f1" },
  { sport: "Motor racing", path: "racing/nascar-premier" },
  { sport: "Motor racing", path: "racing/irl" },
  { sport: "MMA", path: "mma/ufc" },
];

const DAYS = 7;
const dayKey = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    return r.ok ? (await r.json() as T) : null;
  } catch { return null; }
}

function stateOf(e: EspnEvent): string | undefined {
  return e.competitions?.[0]?.status?.type?.state ?? e.status?.type?.state;
}

async function matchComp(c: { sport: string; path: string }): Promise<SportEvent[]> {
  const days = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(Date.now() + i * 86400_000)));
  const boards = await Promise.all(days.map(d => getJSON<Board>(`https://site.api.espn.com/apis/site/v2/sports/${c.path}/scoreboard?dates=${d}`)));
  const out = new Map<string, SportEvent>();
  for (const b of boards) {
    const league = b?.leagues?.[0]?.name ?? c.sport;
    for (const e of b?.events ?? []) {
      const st = stateOf(e);
      if (st !== "pre" && st !== "in") continue;
      out.set(e.id, { id: `${c.path}:${e.id}`, sport: c.sport, league, name: e.name ?? e.shortName ?? "", start: e.date, end: null, live: st === "in", url: null });
    }
  }
  return [...out.values()];
}

async function eventComp(c: { sport: string; path: string }): Promise<SportEvent[]> {
  const b = await getJSON<Board>(`https://site.api.espn.com/apis/site/v2/sports/${c.path}/scoreboard`);
  const league = b?.leagues?.[0]?.name ?? c.sport;
  const horizon = Date.now() + DAYS * 86400_000;
  return (b?.events ?? []).filter(e => {
    const st = stateOf(e);
    return (st === "pre" || st === "in") && Date.parse(e.date) <= horizon;
  }).map(e => ({
    id: `${c.path}:${e.id}`, sport: c.sport, league, name: e.name ?? e.shortName ?? league,
    start: e.date, end: e.endDate ?? null, live: stateOf(e) === "in", url: null,
  }));
}

type HeaderFeed = { sports?: { leagues?: { name?: string; events?: { id: string; name?: string; date: string; status?: string }[] }[] }[] };

async function cricket(): Promise<SportEvent[]> {
  const d = await getJSON<HeaderFeed>("https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket");
  const out: SportEvent[] = [];
  for (const s of d?.sports ?? []) for (const l of s.leagues ?? []) for (const e of l.events ?? []) {
    if (e.status !== "pre" && e.status !== "in") continue;
    out.push({ id: `cricket:${e.id}`, sport: "Cricket", league: l.name ?? "Cricket", name: e.name ?? "", start: e.date, end: null, live: e.status === "in", url: null });
  }
  return out;
}

type LichessTour = { tour?: { id: string; name: string; url?: string; tier?: number; dates?: number[]; info?: { location?: string } } };

async function chess(): Promise<SportEvent[]> {
  try {
    const r = await fetch("https://lichess.org/api/broadcast?nb=30", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return [];
    const now = Date.now(), horizon = now + DAYS * 86400_000;
    const out: SportEvent[] = [];
    for (const line of (await r.text()).split("\n")) {
      if (!line.trim()) continue;
      let t: LichessTour;
      try { t = JSON.parse(line) as LichessTour; } catch { continue; }
      const tour = t.tour;
      const [from, to] = tour?.dates ?? [];
      // Top events only (Lichess's highest tier).
      if (!tour || (tour.tier ?? 0) < 5 || !from) continue;
      if (from > horizon || (to ?? from) < now) continue;
      out.push({
        id: `chess:${tour.id}`, sport: "Chess", league: tour.info?.location ? `Chess · ${tour.info.location}` : "Chess",
        name: tour.name.split("|")[0].trim(), start: new Date(from).toISOString(), end: to ? new Date(to).toISOString() : null,
        live: from <= now, url: tour.url ?? null,
      });
    }
    return out;
  } catch { return []; }
}

export async function fetchOtherSports(): Promise<SportEvent[]> {
  const parts = await Promise.all([
    ...MATCH_COMPS.map(matchComp),
    ...EVENT_COMPS.map(eventComp),
    cricket(),
    chess(),
  ]);
  return parts.flat().sort((a, b) => Number(b.live) - Number(a.live) || a.start.localeCompare(b.start));
}
