// Everything known about one game: who starts, what they look like, where it
// is played, what the market thinks, who is hurt, who is officiating.
//
// The /sports page lists games and predicts a winner, and then stopped — a
// card had a Follow button and no way into the game at all. This is the layer
// behind the game page that fixes that.
//
// Source: ESPN's public `summary` endpoint, free and unauthenticated, the same
// family of endpoints the schedule and standings already use. One request
// carries the lot, which matters because a page that needed six upstream calls
// would be slow and would fail in six different ways.
//
// ── The thing to be careful about ────────────────────────────────────────────
//
// A sportsbook-style page is mostly absences. Lineups are published an hour or
// two before kickoff and not before. A neutral-site game has no weather. Most
// leagues carry no odds here at all. So "we have nothing for this section" is
// the normal case, and it has to be told apart from "we asked and could not
// understand the answer" — because the first is information and the second is
// a bug, and showing them identically is how this codebase's worst bugs have
// always looked.
//
// Every parser below therefore returns null when it cannot read its section,
// and records the section's name in `unreadable`. A section that is simply
// absent upstream leaves `unreadable` alone. The page says "not published yet"
// for one and "we couldn't read this" for the other.

// ── Shapes ────────────────────────────────────────────────────────────────────

export type Person = {
  id: string | null;
  name: string;
  /** "QB", "SS", "GK" — whatever the sport calls it. */
  position: string | null;
  jersey: string | null;
  /** A photo, when ESPN has one. Plenty of athletes have none. */
  headshot: string | null;
  starter: boolean;
  /**
   * What they did, straight from the box score.
   *
   * ESPN sends a parallel pair — `names: ["MIN","REB","AST","PTS"]` beside
   * `stats: ["36","5","7","32"]` — and the parser used to read the athlete and
   * drop the numbers on the floor. That left the page listing who was playing
   * while a search engine showed the same game's points, rebounds and assists,
   * which is a fair thing to be annoyed about.
   *
   * Null before a game, when there is nothing to report.
   */
  stats: Array<{ label: string; value: string }> | null;
};

export type Injury = {
  name: string;
  position: string | null;
  /** "Out", "Questionable", "Day-To-Day". */
  status: string | null;
  detail: string | null;
  headshot: string | null;
};

export type TeamSide = {
  id: string | null;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  /** Null before the game and for a side with no score reported. */
  score: number | null;
  record: string | null;
  homeAway: "home" | "away";
  /** Null when no lineup has been published, or none could be read. */
  lineup: Person[] | null;
  /**
   * What that list actually is.
   *
   * "named" is a published line-up — soccer's eleven, a probable pitcher.
   * "appeared" is who turned up in the box score, which only exists once a
   * game is under way and is a record of appearances, not a starting lineup.
   * Calling the second one a line-up would be inventing information, so the
   * page says "Who played" for it instead.
   */
  lineupKind: "named" | "appeared" | null;
  /** Who to watch — the one player list that exists before a game starts. */
  leaders: Leader[] | null;
  /** The team's own totals, once a game is under way. */
  stats: TeamStat[] | null;
  /** The formation, for sports that field one. */
  formation: string | null;
  injuries: Injury[] | null;
  /** Most recent results first: "W", "L", "D". */
  form: string[] | null;
};

export type Venue = {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  capacity: number | null;
  indoor: boolean | null;
  image: string | null;
};

export type Odds = {
  provider: string | null;
  /** As the book words it, e.g. "LAL -4.5". */
  spread: string | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

export type Official = { name: string; position: string | null };

export type Weather = {
  summary: string | null;
  temperatureF: number | null;
  /** Chance of precipitation, 0-100. */
  precipitationPct: number | null;
};

export type WinProbability = { homePct: number | null; awayPct: number | null };

/**
 * One competitor in a field.
 *
 * A golf tournament, an F1 weekend and a tennis draw are not two sides with a
 * home and an away — they are a hundred and fifty players, a grid, or a
 * bracket. Forcing them through the matchup shape produced a page about a game
 * between the first two names on the list.
 */
export type FieldEntry = {
  /** "1", "T4", "DNF" — as the sport words it. */
  position: string | null;
  name: string;
  headshot: string | null;
  /** Score, time or laps — whatever the sport measures. */
  detail: string | null;
  country: string | null;
};

/** One bout on a fight card. */
export type Bout = {
  /** The weight class or billing, when given. */
  name: string | null;
  fighters: Array<{ name: string; headshot: string | null; record: string | null; winner: boolean }>;
  status: string | null;
};

type BaseDetail = {
  eventId: string;
  sport: string;
  league: string;
  leagueLabel: string | null;
  name: string | null;
  start: string | null;
  state: "pre" | "in" | "post" | null;
  /** "Final", "Top 3rd", "7:30 PM ET" — ESPN's own words for where it is. */
  statusDetail: string | null;
  venue: Venue | null;
  odds: Odds | null;
  broadcasts: string[] | null;
  officials: Official[] | null;
  weather: Weather | null;
  attendance: number | null;
  /** ESPN's own model, which is not ours and is labelled as theirs. */
  espnWinProbability: WinProbability | null;
  /** "Week 9", series standing, anything upstream flags as context. */
  notes: string[] | null;
  /**
   * Sections whose raw data was present but could not be understood.
   *
   * Empty is the healthy state. A name in here means this file needs fixing,
   * not that the game has no lineup — and the page says so in those words.
   */
  unreadable: string[];
};

/**
 * One event, in whichever of the three shapes its sport actually takes.
 *
 * A union rather than a wide object with everything nullable, so the page
 * cannot read `home` off a golf tournament — the compiler stops it, instead of
 * a reader seeing a matchup between whoever happened to be listed first.
 */
export type GameDetail =
  | (BaseDetail & { kind: "head_to_head"; home: TeamSide; away: TeamSide; field: null; bouts: null })
  | (BaseDetail & { kind: "field";        home: null; away: null; field: FieldEntry[] | null; bouts: null })
  | (BaseDetail & { kind: "card";         home: null; away: null; field: null; bouts: Bout[] | null });

export type DetailResult =
  | { ok: true; detail: GameDetail }
  | { ok: false; reason: "unavailable" | "not_found" | "unexpected_shape"; detail?: string };

// ── Reading untyped JSON without pretending it is typed ──────────────────────

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;

const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

const numOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // ESPN sends scores as strings, and moneylines with a leading "+".
    const n = Number(v.replace(/^\+/, "").trim());
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
};

const boolOf = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Follow a dotted path, giving up quietly at the first thing that is not an object. */
function at(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    const o = obj(cur);
    if (!o) return undefined;
    cur = o[key];
  }
  return cur;
}

// ── Section parsers ──────────────────────────────────────────────────────────

/**
 * An athlete, from any of the several shapes ESPN wraps one in.
 *
 * A roster entry nests the person under `athlete`; a leader entry nests it
 * under `athlete` too but one level further out; an injury puts it beside the
 * status. Accepting all of them here keeps that mess out of the callers.
 */
export function parsePerson(raw: unknown, starterDefault = false): Person | null {
  const e = obj(raw);
  if (!e) return null;
  const a = obj(e.athlete) ?? e;

  const name =
    str(a.displayName) ?? str(a.fullName) ??
    str([str(a.firstName), str(a.lastName)].filter(Boolean).join(" "));
  if (!name) return null;

  const position =
    str(at(a, "position.abbreviation")) ?? str(at(a, "position.displayName")) ??
    str(at(e, "position.abbreviation")) ?? str(at(e, "position.displayName"));

  return {
    id: str(a.id),
    name,
    position,
    jersey: str(a.jersey) ?? str(e.jersey),
    headshot: str(at(a, "headshot.href")) ?? str(a.headshot),
    starter: boolOf(e.starter) ?? boolOf(a.starter) ?? starterDefault,
    stats: null,
  };
}

/**
 * A team's published lineup.
 *
 * `null` means none was found — which before a game usually means it is simply
 * not out yet, not that anything failed. Baseball's probable pitchers arrive
 * separately and are merged in by the caller, since a probable pitcher is the
 * only "starter" a baseball game names hours ahead.
 */
export function parseLineup(rawRoster: unknown): Person[] | null {
  const entries = arr(rawRoster);
  if (!entries) return null;
  const out: Person[] = [];
  for (const entry of entries) {
    const p = parsePerson(entry);
    if (p) out.push(p);
  }
  if (out.length === 0) return null;
  // Starters first, then by position so a reader scanning for a goalkeeper or a
  // quarterback finds them in a predictable place.
  return out.sort((a, b) =>
    Number(b.starter) - Number(a.starter) || (a.position ?? "").localeCompare(b.position ?? ""));
}

export function parseVenue(raw: unknown): Venue | null {
  const v = obj(raw);
  if (!v) return null;
  const name = str(v.fullName) ?? str(v.name);
  if (!name) return null;
  const images = arr(v.images);
  const firstImage = images?.map(i => str(at(i, "href")) ?? str(i)).find(Boolean) ?? null;
  return {
    name,
    city: str(at(v, "address.city")),
    state: str(at(v, "address.state")),
    country: str(at(v, "address.country")),
    capacity: numOf(v.capacity),
    indoor: boolOf(v.indoor),
    image: firstImage,
  };
}

/**
 * The market's view, when a book is quoted at all.
 *
 * Most leagues here carry none. That is an absence, not a failure, and the
 * page says "no line quoted for this game" rather than showing zeroes — a
 * spread of 0.0 is a real and different claim from no spread.
 */
export function parseOdds(raw: unknown): Odds | null {
  const list = arr(raw);
  const first = obj(list?.[0]) ?? obj(raw);
  if (!first) return null;

  const spread = str(first.details);
  const overUnder = numOf(first.overUnder);
  const homeMoneyline =
    numOf(at(first, "homeTeamOdds.moneyLine")) ?? numOf(at(first, "homeTeamOdds.favorite"));
  const awayMoneyline = numOf(at(first, "awayTeamOdds.moneyLine"));

  // Nothing usable means nothing to show, rather than an empty card.
  if (spread === null && overUnder === null && homeMoneyline === null && awayMoneyline === null) {
    return null;
  }
  return {
    provider: str(at(first, "provider.name")),
    spread,
    overUnder,
    homeMoneyline: typeof homeMoneyline === "number" ? homeMoneyline : null,
    awayMoneyline,
  };
}

export function parseWeather(raw: unknown): Weather | null {
  const w = obj(raw);
  if (!w) return null;
  const summary = str(w.displayValue) ?? str(w.conditionId);
  const temperatureF = numOf(w.temperature) ?? numOf(w.highTemperature);
  const precipitationPct = numOf(w.precipitation);
  if (summary === null && temperatureF === null && precipitationPct === null) return null;
  return { summary, temperatureF, precipitationPct };
}

export function parseOfficials(raw: unknown): Official[] | null {
  const list = arr(raw);
  if (!list) return null;
  const out: Official[] = [];
  for (const o of list) {
    const e = obj(o);
    if (!e) continue;
    const name = str(e.displayName) ?? str(e.fullName) ?? str(at(e, "athlete.displayName"));
    if (!name) continue;
    out.push({ name, position: str(at(e, "position.displayName")) ?? str(at(e, "position.name")) ?? str(e.order) });
  }
  return out.length ? out : null;
}

export function parseInjuries(raw: unknown): Injury[] | null {
  const list = arr(raw);
  if (!list) return null;
  const out: Injury[] = [];
  for (const i of list) {
    const e = obj(i);
    if (!e) continue;
    const person = parsePerson(e);
    if (!person) continue;
    out.push({
      name: person.name,
      position: person.position,
      status: str(e.status) ?? str(at(e, "type.description")) ?? str(at(e, "type.name")),
      detail: str(at(e, "details.type")) ?? str(e.longComment) ?? str(e.shortComment),
      headshot: person.headshot,
    });
  }
  return out.length ? out : null;
}

/** Last results, newest first, as single letters. */
export function parseForm(raw: unknown): string[] | null {
  const events = arr(at(raw, "events")) ?? arr(raw);
  if (!events) return null;
  const out: string[] = [];
  for (const e of events) {
    const o = obj(e);
    if (!o) continue;
    const result = str(o.gameResult) ?? str(o.result) ?? str(at(o, "score.result"));
    if (!result) continue;
    const letter = result.trim().charAt(0).toUpperCase();
    if (letter === "W" || letter === "L" || letter === "D" || letter === "T") out.push(letter);
  }
  return out.length ? out.slice(0, 5) : null;
}

export function parseWinProbability(raw: unknown): WinProbability | null {
  const p = obj(raw);
  if (!p) return null;
  const home = numOf(at(p, "homeTeam.gameProjection")) ?? numOf(p.homeWinPercentage);
  const away = numOf(at(p, "awayTeam.gameProjection")) ?? numOf(p.awayWinPercentage);
  if (home === null && away === null) return null;
  // ESPN gives these as percentages already; derive the other side when only
  // one is quoted rather than leaving a card half empty.
  const homePct = home ?? (away === null ? null : Math.round((100 - away) * 10) / 10);
  const awayPct = away ?? (home === null ? null : Math.round((100 - home) * 10) / 10);
  return { homePct, awayPct };
}

/**
 * A field of competitors — a leaderboard, a grid, a draw.
 *
 * Null when nothing readable is there, which before a tournament starts is the
 * normal case: an entry list is often published later than the event itself.
 */
export function parseField(rawCompetitors: unknown): FieldEntry[] | null {
  const list = arr(rawCompetitors);
  if (!list) return null;
  const out: FieldEntry[] = [];
  for (const c of list) {
    const e = obj(c);
    if (!e) continue;
    const person = parsePerson(e);
    // A field entry can also be a team (golf's team events, racing's
    // constructors), so fall back to the team's name before giving up.
    const name = person?.name ?? str(at(e, "team.displayName"));
    if (!name) continue;
    out.push({
      position:
        str(at(e, "status.position.id")) ?? str(at(e, "status.position.displayName")) ??
        str(e.order) ?? str(e.curtainPosition),
      name,
      headshot: person?.headshot ?? null,
      detail:
        str(e.score) ?? str(at(e, "linescores.0.displayValue")) ??
        str(at(e, "statistics.0.displayValue")) ?? str(e.time),
      country: str(at(e, "athlete.flag.alt")) ?? str(at(e, "team.location")),
    });
  }
  return out.length ? out : null;
}

/**
 * A fight card: several separate bouts under one event.
 *
 * ESPN models this as many competitions rather than one, which is why taking
 * `competitions[0]` and calling it the event showed a UFC night as a single
 * fight between two names.
 */
export function parseBouts(rawCompetitions: unknown): Bout[] | null {
  const list = arr(rawCompetitions);
  if (!list) return null;
  const out: Bout[] = [];
  for (const c of list) {
    const comp = obj(c);
    const competitors = arr(comp?.competitors);
    if (!competitors || competitors.length < 2) continue;
    const fighters: Bout["fighters"] = [];
    for (const f of competitors) {
      const e = obj(f);
      if (!e) continue;
      const person = parsePerson(e);
      const name = person?.name ?? str(at(e, "team.displayName"));
      if (!name) continue;
      fighters.push({
        name,
        headshot: person?.headshot ?? null,
        record: str(at(arr(e.records)?.[0], "summary")) ?? str(at(e, "record.summary")),
        winner: boolOf(e.winner) ?? false,
      });
    }
    if (fighters.length < 2) continue;
    out.push({
      name: str(at(comp, "type.text")) ?? str(comp?.note) ?? str(at(comp, "format.regulation.periods")),
      fighters,
      status: str(at(comp, "status.type.detail")) ?? str(at(comp, "status.type.shortDetail")),
    });
  }
  return out.length ? out : null;
}

// ── Assembling one game ──────────────────────────────────────────────────────

/** Pick the roster block belonging to a team id, however it is keyed. */
function rosterFor(rosters: unknown[] | null, teamId: string | null): Obj | null {
  if (!rosters || !teamId) return null;
  for (const r of rosters) {
    const o = obj(r);
    if (!o) continue;
    if (str(at(o, "team.id")) === teamId || str(o.teamId) === teamId) return o;
  }
  return null;
}

/**
 * A team's players out of the box score, for sports that publish no roster.
 *
 * Soccer puts a named eleven in `rosters` before kickoff. The US leagues do
 * not: their players appear inside `boxscore.players`, grouped by statistic,
 * and only once the game is under way. Reading it means a live or finished
 * game shows who actually played instead of "not named yet", which is what it
 * said for every NBA and NFL game.
 *
 * It is NOT a starting lineup, so nobody is marked as a starter unless the
 * payload says so — claiming a starting five from a list of appearances would
 * be inventing information.
 */
export function parseBoxscorePlayers(rawPlayers: unknown, teamId: string | null): Person[] | null {
  const blocks = arr(rawPlayers);
  if (!blocks || !teamId) return null;
  for (const block of blocks) {
    const b = obj(block);
    if (!b) continue;
    if (str(at(b, "team.id")) !== teamId) continue;
    const out: Person[] = [];
    const seen = new Map<string, Person>();
    // One entry per statistic category, each carrying the same athletes and a
    // `names` array that labels the numbers beside them.
    for (const group of arr(b.statistics) ?? []) {
      const labels = (arr(obj(group)?.names) ?? []).map(n => str(n));
      for (const entry of arr(obj(group)?.athletes) ?? []) {
        // Someone listed but unused does not belong under "who played".
        if (boolOf(obj(entry)?.didNotPlay) === true) continue;
        const p = parsePerson(entry);
        if (!p) continue;

        // Pair each number with the label at the same index. A row shorter or
        // longer than its header is skipped rather than shifted, because a
        // misaligned box score reads as confidently wrong numbers.
        const values = arr(obj(entry)?.stats) ?? [];
        const stats: Array<{ label: string; value: string }> = [];
        if (labels.length > 0 && values.length === labels.length) {
          for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            const value = str(values[i]);
            if (label && value) stats.push({ label, value });
          }
        }

        const key = p.id ?? p.name;
        const already = seen.get(key);
        if (already) {
          // A player appears under several categories (passing, rushing).
          // Keep every number rather than the first category's alone.
          if (stats.length) {
            const have = new Set((already.stats ?? []).map(x => x.label));
            already.stats = [...(already.stats ?? []), ...stats.filter(x => !have.has(x.label))];
          }
          continue;
        }
        const withStats = { ...p, stats: stats.length ? stats : null };
        seen.set(key, withStats);
        out.push(withStats);
      }
    }
    if (out.length) return out;
  }
  return null;
}

/**
 * Every place a box score keeps its players.
 *
 * The documented shape nests them under `boxscore.teams[].players[]`; some
 * responses carry a flat `boxscore.players[]` beside `teams`. Reading only the
 * flat one is why every NBA and NFL game said nobody had played.
 */
function boxscorePlayerBlocks(root: Obj): unknown[] {
  const flat = arr(at(root, "boxscore.players")) ?? [];
  const nested: unknown[] = [];
  for (const t of arr(at(root, "boxscore.teams")) ?? []) {
    for (const p of arr(obj(t)?.players) ?? []) nested.push(p);
  }
  return [...flat, ...nested];
}

/** One line of a team's box score — "Rebounds 41". */
export type TeamStat = { label: string; value: string };

/**
 * A team's totals, which is the side-by-side table a reader expects.
 *
 * `boxscore.teams[].statistics` carries them already labelled; the page had
 * simply never read them, so a game showed who was on court and nothing about
 * how it was going.
 */
export function parseTeamStats(rawTeams: unknown, teamId: string | null): TeamStat[] | null {
  const teams = arr(rawTeams);
  if (!teams || !teamId) return null;
  for (const t of teams) {
    const block = obj(t);
    if (!block || str(at(block, "team.id")) !== teamId) continue;
    const out: TeamStat[] = [];
    for (const st of arr(block.statistics) ?? []) {
      const entry = obj(st);
      if (!entry) continue;
      const label = str(entry.label) ?? str(entry.displayName) ?? str(entry.name);
      const value = str(entry.displayValue) ?? str(entry.value);
      if (label && value) out.push({ label, value });
    }
    if (out.length) return out;
  }
  return null;
}

/** A statistical leader, which is the one player list that exists before a game. */
export type Leader = {
  /** "Points", "Passing Yards" — what they lead in. */
  category: string;
  name: string;
  value: string;
  headshot: string | null;
};

/**
 * Who to watch, per team.
 *
 * This matters more than it looks. The US leagues publish no line-up before a
 * game, so without this the page had nothing at all to say pre-game about who
 * is involved — which is exactly how it came across. Leaders are published
 * well ahead, so a game tomorrow can still show the players who decide it.
 */
export function parseLeaders(rawLeaders: unknown, teamId: string | null): Leader[] | null {
  const groups = arr(rawLeaders);
  if (!groups || !teamId) return null;
  const out: Leader[] = [];

  /** One category — "Points" — and its top athlete for this team. */
  const takeCategory = (raw: unknown, teamFromWrapper: string | null) => {
    const group = obj(raw);
    if (!group) return;
    const category = str(group.displayName) ?? str(group.name);
    if (!category) return;
    for (const l of arr(group.leaders) ?? []) {
      const entry = obj(l);
      if (!entry) continue;
      const owner = str(at(entry, "team.id")) ?? teamFromWrapper;
      if (owner && owner !== teamId) continue;
      const person = parsePerson(entry);
      const value = str(entry.displayValue);
      if (!person || !value) continue;
      out.push({ category, name: person.name, value, headshot: person.headshot });
      return; // one per category is plenty; the rest is a stats page
    }
  };

  for (const g of groups) {
    const group = obj(g);
    if (!group) continue;

    // Two shapes, and reading only the second is why this section was empty
    // on every game the list actually offers.
    //
    // Before a game ESPN wraps the categories in a per-team object:
    //   leaders[] = { team, leaders[] = { name, displayName, leaders[] } }
    // Elsewhere the categories are the top level, each athlete carrying its
    // own team. The wrapped form has no displayName of its own, so the old
    // code read null, gave up, and reported no leaders at all.
    const wrappedTeam = str(at(group, "team.id"));
    const inner = arr(group.leaders);
    const isWrapper = !!inner && inner.some(i => Array.isArray(obj(i)?.leaders));

    if (isWrapper) {
      // Only this team's block is worth walking.
      if (wrappedTeam && wrappedTeam !== teamId) continue;
      for (const category of inner) takeCategory(category, wrappedTeam);
    } else {
      takeCategory(group, wrappedTeam);
    }
  }
  return out.length ? out : null;
}

function teamSide(
  competitor: unknown,
  homeAway: "home" | "away",
  rosters: unknown[] | null,
  boxscorePlayers: unknown,
  rawLeaders: unknown,
  boxscoreTeams: unknown,
  injuriesByTeam: Map<string, Injury[]>,
  formByTeam: Map<string, string[]>,
  unreadable: string[],
): TeamSide | null {
  const c = obj(competitor);
  if (!c) return null;
  const t = obj(c.team) ?? {};
  const id = str(t.id) ?? str(c.id);

  // A side is usually a team, but in tennis and boxing it is one person. Those
  // used to fail the team-name check and take the whole game down with them —
  // a match between two players read as a payload we could not understand.
  const individual = parsePerson(c);
  const name =
    str(t.displayName) ?? str(t.name) ?? str(t.shortDisplayName) ?? individual?.name ?? null;
  if (!name) return null;

  const logo =
    str(t.logo) ?? str(at(arr(t.logos)?.[0], "href")) ?? individual?.headshot ?? null;
  // The scoreboard sends `records` as an array; a summary's competitor sends
  // `record`, which is itself sometimes an array and sometimes one object.
  // All three spellings appear, so all three are read — a season record that
  // silently fails to show is a small thing that makes the card look broken.
  const record =
    str(at(arr(c.records)?.[0], "summary")) ??
    str(at(arr(c.record)?.[0], "summary")) ??
    str(at(c, "record.summary")) ??
    str(c.record);

  const rosterBlock = rosterFor(rosters, id);
  let lineup: Person[] | null = null;
  let lineupKind: TeamSide["lineupKind"] = null;
  if (rosterBlock) {
    lineup = parseLineup(rosterBlock.roster);
    if (lineup) lineupKind = "named";
    // The block existed and held entries we could not read — that is a bug
    // here, not a lineup that is unpublished, so say which.
    else if ((arr(rosterBlock.roster)?.length ?? 0) > 0) {
      unreadable.push(`${homeAway} lineup`);
    }
  }
  // No published roster: fall back to who appears in the box score, which is
  // the only player list the US leagues give and exists only once the game is
  // under way. Labelled as appearances, never as a starting lineup.
  if (!lineup) {
    const played = parseBoxscorePlayers(boxscorePlayers, id);
    if (played) { lineup = played; lineupKind = "appeared"; }
  }

  return {
    id, name,
    abbreviation: str(t.abbreviation),
    logo,
    score: numOf(c.score),
    record,
    homeAway,
    lineup,
    lineupKind,
    leaders: parseLeaders(rawLeaders, id),
    stats: parseTeamStats(boxscoreTeams, id),
    formation: str(rosterBlock?.formation),
    injuries: id ? injuriesByTeam.get(id) ?? null : null,
    form: id ? formByTeam.get(id) ?? null : null,
  };
}

/**
 * Turn one `summary` payload into a game.
 *
 * Pure, so the whole of it is testable without a network. Returns null only
 * when the payload has no recognisable game in it at all — which is the one
 * case the caller must report as `unexpected_shape` rather than as an empty
 * page, because an empty page would read as "nothing on today".
 */
export function parseGameSummary(
  body: unknown,
  ctx: { eventId: string; sport: string; league: string },
): GameDetail | null {
  const root = obj(body);
  if (!root) return null;

  const header = obj(root.header);
  const allCompetitions =
    arr(at(header, "competitions")) ?? arr(at(root, "competitions"));
  const competition = obj(allCompetitions?.[0]);
  const competitors = arr(competition?.competitors);
  if (!competitors || competitors.length < 2) return null;

  const unreadable: string[] = [];

  // Injuries and recent form are keyed by team elsewhere in the payload.
  const injuriesByTeam = new Map<string, Injury[]>();
  for (const block of arr(root.injuries) ?? []) {
    const b = obj(block);
    const teamId = str(at(b, "team.id"));
    const parsed = parseInjuries(b?.injuries);
    if (teamId && parsed) injuriesByTeam.set(teamId, parsed);
  }

  const formByTeam = new Map<string, string[]>();
  for (const block of arr(root.lastFiveGames) ?? arr(at(root, "lastFiveGames.teams")) ?? []) {
    const b = obj(block);
    const teamId = str(at(b, "team.id"));
    const parsed = parseForm(b);
    if (teamId && parsed) formByTeam.set(teamId, parsed);
  }

  const rosters = arr(root.rosters);
  const boxscorePlayers = boxscorePlayerBlocks(root);
  const boxscoreTeams = at(root, "boxscore.teams");

  // ── Which of the three shapes is this? ───────────────────────────────────
  //
  // Decided from the payload rather than from the sport's name, because the
  // sport does not settle it: tennis is a field at tournament level and two
  // players at match level, and the same endpoint serves both.
  //
  //   many competitions, two competitors each → a fight card
  //   one competition, more than two          → a field
  //   otherwise                                → two sides
  const looksLikeCard =
    (allCompetitions?.length ?? 0) > 1 &&
    allCompetitions!.every(c => (arr(obj(c)?.competitors)?.length ?? 0) === 2);
  const hasHomeAway = competitors.some(c => {
    const side = str(obj(c)?.homeAway);
    return side === "home" || side === "away";
  });
  const looksLikeField = !looksLikeCard && !hasHomeAway && competitors.length > 2;

  const findSide = (side: "home" | "away") =>
    competitors.find(c => str(obj(c)?.homeAway) === side) ?? null;

  const gameInfo = obj(root.gameInfo);
  const status = obj(competition?.status) ?? obj(at(root, "header.status"));
  const stateRaw = str(at(status, "type.state"));
  const state = stateRaw === "pre" || stateRaw === "in" || stateRaw === "post" ? stateRaw : null;

  const broadcasts: string[] = [];
  for (const b of [...(arr(root.broadcasts) ?? []), ...(arr(competition?.broadcasts) ?? [])]) {
    const o = obj(b);
    const names = arr(o?.names)?.map(n => str(n)).filter((n): n is string => !!n) ?? [];
    const single = str(o?.shortName) ?? str(o?.media);
    for (const n of names.length ? names : single ? [single] : []) broadcasts.push(n);
  }

  const notes: string[] = [];
  for (const n of arr(competition?.notes) ?? arr(root.notes) ?? []) {
    const headline = str(at(n, "headline")) ?? str(n);
    if (headline) notes.push(headline);
  }
  const seasonNote = str(at(header, "season.slug")) && str(at(header, "week"))
    ? `Week ${str(at(header, "week"))}`
    : null;
  if (seasonNote) notes.push(seasonNote);

  const base: BaseDetail = {
    eventId: ctx.eventId,
    sport: ctx.sport,
    league: ctx.league,
    leagueLabel: str(at(header, "league.name")) ?? str(at(root, "leagues.0.name")),
    name: str(competition?.name) ?? str(at(header, "label")),
    start: str(competition?.date) ?? str(at(header, "competitions.0.date")),
    state,
    statusDetail: str(at(status, "type.detail")) ?? str(at(status, "type.shortDetail")),
    venue: parseVenue(gameInfo?.venue ?? competition?.venue),
    // `pickcenter` is where the summary endpoint puts the book lines for the
    // US leagues; `odds` is the scoreboard's name for the same thing. Both are
    // tried because which one appears depends on the endpoint, and reading
    // only the second is a likely reason a line never showed.
    odds: parseOdds(root.pickcenter ?? root.odds ?? competition?.odds),
    broadcasts: broadcasts.length ? [...new Set(broadcasts)] : null,
    officials: parseOfficials(gameInfo?.officials),
    weather: parseWeather(gameInfo?.weather ?? root.weather),
    attendance: numOf(gameInfo?.attendance),
    espnWinProbability: parseWinProbability(root.predictor),
    notes: notes.length ? [...new Set(notes)] : null,
    unreadable,
  };

  if (looksLikeCard) {
    const bouts = parseBouts(allCompetitions);
    // The competitions were there and none of them read — that is a fault
    // here, not a card with no fights on it.
    if (!bouts) unreadable.push("the card");
    return { ...base, kind: "card", home: null, away: null, field: null, bouts };
  }

  if (looksLikeField) {
    const field = parseField(competitors);
    if (!field) unreadable.push("the field");
    return { ...base, kind: "field", home: null, away: null, field, bouts: null };
  }

  // Fall back to array order only when homeAway is absent entirely: ESPN lists
  // away first. Guessing is worse than failing, so it is the last resort.
  const rawHome = findSide("home") ?? competitors[1];
  const rawAway = findSide("away") ?? competitors[0];

  const home = teamSide(rawHome, "home", rosters, boxscorePlayers, root.leaders, boxscoreTeams, injuriesByTeam, formByTeam, unreadable);
  const away = teamSide(rawAway, "away", rosters, boxscorePlayers, root.leaders, boxscoreTeams, injuriesByTeam, formByTeam, unreadable);
  if (!home || !away) return null;

  // Baseball names a probable pitcher long before any lineup exists, and it is
  // the single most useful thing on the page for that sport.
  for (const p of arr(root.probables) ?? []) {
    const block = obj(p);
    const teamId = str(at(block, "team.id"));
    const person = parsePerson(block?.athlete ?? block, true);
    if (!teamId || !person) continue;
    const target = home.id === teamId ? home : away.id === teamId ? away : null;
    if (!target) continue;
    target.lineup = [{ ...person, starter: true }, ...(target.lineup ?? []).filter(x => x.id !== person.id)];
    target.lineupKind = "named";
  }

  return {
    ...base,
    name: base.name ?? `${away.name} at ${home.name}`,
    kind: "head_to_head",
    home,
    away,
    field: null,
    bouts: null,
  };
}

// ── Fetching ─────────────────────────────────────────────────────────────────

/**
 * Where one event's summary lives.
 *
 * Cricket is not served from the same place as everything else. Its summary is
 * on the web host rather than the site host, it is addressed by a numeric
 * series id, and it wants `lang`, `region` and `contentorigin` — without them
 * the request does not come back with a match on it. Every other sport is the
 * plain site endpoint.
 */
export function summaryUrl(sport: string, league: string, eventId: string): string {
  const s = encodeURIComponent(sport);
  const l = encodeURIComponent(league);
  const e = encodeURIComponent(eventId);
  if (sport === "cricket") {
    return `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${l}/summary` +
      `?contentorigin=espn&event=${e}&lang=en&region=in`;
  }
  return `https://site.api.espn.com/apis/site/v2/sports/${s}/${l}/summary?event=${e}`;
}

/**
 * One game's detail from ESPN.
 *
 * Never throws and never returns an empty game. A failure says which kind it
 * was, so the page can tell the reader whether to try again (`unavailable`),
 * whether the game is gone (`not_found`), or whether we have a bug
 * (`unexpected_shape`) — three different sentences for three different facts.
 */
export async function fetchGameDetail(
  sport: string,
  league: string,
  eventId: string,
  timeoutMs = 12_000,
): Promise<DetailResult> {
  const url = summaryUrl(sport, league, eventId);

  let body: unknown;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable", detail: `HTTP ${res.status}` };
    body = await res.json();
  } catch (e) {
    return {
      ok: false, reason: "unavailable",
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 120),
    };
  }

  const detail = parseGameSummary(body, { eventId, sport, league });
  if (!detail) return { ok: false, reason: "unexpected_shape" };
  return { ok: true, detail };
}
