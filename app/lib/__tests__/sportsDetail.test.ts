import { describe, it, expect } from "vitest";
import {
  parseGameSummary, parsePerson, parseLineup, parseVenue, parseOdds,
  parseWeather, parseOfficials, parseInjuries, parseForm, parseWinProbability,
  parseField, parseBouts, parseBoxscorePlayers, type GameDetail,
} from "../sportsDetail";

// A game page is mostly absences: lineups appear an hour before kickoff, most
// leagues carry no odds, a dome has no weather. So most of what is tested here
// is that an absence reads as an absence and never as a zero, an empty list or
// a silent success.

const ctx = { eventId: "401", sport: "basketball", league: "nba" };

/** Parse, assert it came out as a matchup, and narrow to that shape. */
function h2h(body: unknown): Extract<GameDetail, { kind: "head_to_head" }> {
  const d = parseGameSummary(body, ctx);
  expect(d, "expected a readable game").not.toBeNull();
  expect(d!.kind).toBe("head_to_head");
  return d as Extract<GameDetail, { kind: "head_to_head" }>;
}

const athlete = (over: Record<string, unknown> = {}) => ({
  id: "1", displayName: "Jordan Reyes", jersey: "23",
  position: { abbreviation: "PG", displayName: "Point Guard" },
  headshot: { href: "https://a.espncdn.com/i/headshots/nba/players/full/1.png" },
  ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  header: {
    league: { name: "National Basketball Association" },
    competitions: [{
      date: "2026-11-02T00:30Z",
      status: { type: { state: "pre", detail: "7:30 PM ET" } },
      competitors: [
        { id: "20", homeAway: "away", score: null, team: { id: "20", displayName: "Phoenix Suns", abbreviation: "PHX", logo: "https://x/phx.png" }, records: [{ summary: "6-3" }] },
        { id: "10", homeAway: "home", score: null, team: { id: "10", displayName: "Denver Nuggets", abbreviation: "DEN", logo: "https://x/den.png" }, records: [{ summary: "7-2" }] },
      ],
      broadcasts: [{ names: ["ESPN", "ABC"] }],
    }],
  },
  gameInfo: {
    venue: { fullName: "Ball Arena", address: { city: "Denver", state: "CO" }, capacity: 19520, indoor: true },
    officials: [{ displayName: "Kane Fitzgerald", position: { displayName: "Referee" } }],
    attendance: 19104,
  },
  rosters: [
    { team: { id: "10" }, roster: [{ starter: true, athlete: athlete({ id: "11", displayName: "Nikola Vance" }) }, { starter: false, athlete: athlete({ id: "12", displayName: "Bench Guy", position: { abbreviation: "SF" } }) }] },
    { team: { id: "20" }, roster: [{ starter: true, athlete: athlete({ id: "21", displayName: "Devin Cross" }) }] },
  ],
  odds: [{ provider: { name: "ESPN BET" }, details: "DEN -4.5", overUnder: 228.5, homeTeamOdds: { moneyLine: -190 }, awayTeamOdds: { moneyLine: 160 } }],
  predictor: { homeTeam: { gameProjection: 64.2 }, awayTeam: { gameProjection: 35.8 } },
  injuries: [{ team: { id: "10" }, injuries: [{ status: "Out", athlete: athlete({ id: "13", displayName: "Hurt Player" }), details: { type: "Knee" } }] }],
  lastFiveGames: [{ team: { id: "10" }, events: [{ gameResult: "W" }, { gameResult: "L" }, { gameResult: "W" }] }],
  ...over,
});

describe("one athlete", () => {
  it("reads a roster entry, photo and all", () => {
    const p = parsePerson({ starter: true, athlete: athlete() });
    expect(p).toMatchObject({ name: "Jordan Reyes", position: "PG", jersey: "23", starter: true });
    expect(p?.headshot).toContain("headshots");
  });

  it("reads a bare athlete with no wrapper", () => {
    expect(parsePerson(athlete())?.name).toBe("Jordan Reyes");
  });

  it("builds a name from parts when there is no display name", () => {
    expect(parsePerson({ firstName: "Ada", lastName: "Byron" })?.name).toBe("Ada Byron");
  });

  it("returns null rather than a nameless person", () => {
    expect(parsePerson({ id: "9", jersey: "7" })).toBeNull();
    expect(parsePerson(null)).toBeNull();
    expect(parsePerson("Jordan")).toBeNull();
  });

  it("reports no photo as null, not as an empty string", () => {
    expect(parsePerson(athlete({ headshot: undefined }))?.headshot).toBeNull();
  });
});

describe("a lineup", () => {
  it("puts starters first", () => {
    const l = parseLineup([
      { starter: false, athlete: athlete({ id: "2", displayName: "Second" }) },
      { starter: true, athlete: athlete({ id: "1", displayName: "First" }) },
    ]);
    expect(l?.map(p => p.name)).toEqual(["First", "Second"]);
  });

  it("is null when no lineup has been published", () => {
    // The normal case before kickoff. Not an error, and not an empty list that
    // would render as a team with nobody on it.
    expect(parseLineup([])).toBeNull();
    expect(parseLineup(null)).toBeNull();
    expect(parseLineup(undefined)).toBeNull();
  });

  it("keeps the readable entries when one is junk", () => {
    const l = parseLineup([{ athlete: athlete() }, null, { nope: true }]);
    expect(l).toHaveLength(1);
  });
});

describe("the venue", () => {
  it("reads the ground and where it is", () => {
    expect(parseVenue({ fullName: "Anfield", address: { city: "Liverpool", country: "England" }, capacity: 61276 }))
      .toMatchObject({ name: "Anfield", city: "Liverpool", country: "England", capacity: 61276 });
  });

  it("is null without a name, since a city alone is not a venue", () => {
    expect(parseVenue({ address: { city: "Denver" } })).toBeNull();
    expect(parseVenue(null)).toBeNull();
  });

  it("leaves capacity null rather than guessing zero", () => {
    expect(parseVenue({ fullName: "Some Park" })?.capacity).toBeNull();
  });
});

describe("the odds", () => {
  it("reads the line, the total and both moneylines", () => {
    expect(parseOdds([{ provider: { name: "ESPN BET" }, details: "DEN -4.5", overUnder: 228.5, homeTeamOdds: { moneyLine: -190 }, awayTeamOdds: { moneyLine: 160 } }]))
      .toEqual({ provider: "ESPN BET", spread: "DEN -4.5", overUnder: 228.5, homeMoneyline: -190, awayMoneyline: 160 });
  });

  it("reads a moneyline sent as a string with a plus", () => {
    expect(parseOdds([{ awayTeamOdds: { moneyLine: "+160" } }])?.awayMoneyline).toBe(160);
  });

  it("is null when no book is quoted", () => {
    // Most leagues on this page carry none. A card of zeroes would assert a
    // pick-em line, which is a real and different claim from no line at all.
    expect(parseOdds([])).toBeNull();
    expect(parseOdds(null)).toBeNull();
    expect(parseOdds([{ provider: { name: "ESPN BET" } }])).toBeNull();
  });

  it("keeps a genuine pick-em line of zero", () => {
    expect(parseOdds([{ details: "EVEN", overUnder: 0 }])?.overUnder).toBe(0);
  });
});

describe("weather, officials, injuries and form", () => {
  it("reads weather when there is any", () => {
    expect(parseWeather({ displayValue: "Partly Cloudy", temperature: 54, precipitation: 20 }))
      .toEqual({ summary: "Partly Cloudy", temperatureF: 54, precipitationPct: 20 });
  });

  it("reports no weather as null — an indoor game has none", () => {
    expect(parseWeather({})).toBeNull();
    expect(parseWeather(null)).toBeNull();
  });

  it("keeps a freezing temperature instead of dropping a falsy zero", () => {
    expect(parseWeather({ temperature: 0 })?.temperatureF).toBe(0);
  });

  it("reads officials", () => {
    expect(parseOfficials([{ displayName: "Kane Fitzgerald", position: { displayName: "Referee" } }]))
      .toEqual([{ name: "Kane Fitzgerald", position: "Referee" }]);
  });

  it("reports no officials as null, not an empty crew", () => {
    expect(parseOfficials([])).toBeNull();
    expect(parseOfficials([{ position: { displayName: "Referee" } }])).toBeNull();
  });

  it("reads an injury with its status and the part that hurts", () => {
    expect(parseInjuries([{ status: "Out", athlete: athlete(), details: { type: "Knee" } }])?.[0])
      .toMatchObject({ name: "Jordan Reyes", status: "Out", detail: "Knee" });
  });

  it("reads recent form newest first and caps it at five", () => {
    const form = parseForm({ events: [{ gameResult: "W" }, { gameResult: "L" }, { gameResult: "D" }, { gameResult: "W" }, { gameResult: "W" }, { gameResult: "L" }] });
    expect(form).toEqual(["W", "L", "D", "W", "W"]);
  });

  it("ignores a result it does not recognise", () => {
    expect(parseForm({ events: [{ gameResult: "?" }] })).toBeNull();
  });
});

describe("ESPN's own win probability", () => {
  it("reads both sides", () => {
    expect(parseWinProbability({ homeTeam: { gameProjection: 64.2 }, awayTeam: { gameProjection: 35.8 } }))
      .toEqual({ homePct: 64.2, awayPct: 35.8 });
  });

  it("derives the other side when only one is quoted", () => {
    expect(parseWinProbability({ homeTeam: { gameProjection: 70 } })).toEqual({ homePct: 70, awayPct: 30 });
  });

  it("is null when there is no projection", () => {
    expect(parseWinProbability({})).toBeNull();
  });
});

describe("a whole game", () => {
  it("reads both teams, the right way round", () => {
    const d = h2h(summary());
    expect(d.home.name).toBe("Denver Nuggets");
    expect(d.away.name).toBe("Phoenix Suns");
    expect(d.home.record).toBe("7-2");
    expect(d.home.logo).toBe("https://x/den.png");
  });

  it("attaches each team's own lineup, injuries and form", () => {
    const d = h2h(summary());
    expect(d.home.lineup?.map(p => p.name)).toEqual(["Nikola Vance", "Bench Guy"]);
    expect(d.away.lineup?.map(p => p.name)).toEqual(["Devin Cross"]);
    expect(d.home.injuries?.[0]).toMatchObject({ name: "Hurt Player", status: "Out" });
    expect(d.home.form).toEqual(["W", "L", "W"]);
    // The away side has none of those in this payload, and gets null — not
    // the home team's by accident, and not an empty list.
    expect(d.away.injuries).toBeNull();
    expect(d.away.form).toBeNull();
  });

  it("reads the venue, officials, broadcast, attendance and odds", () => {
    const d = h2h(summary());
    expect(d.venue).toMatchObject({ name: "Ball Arena", city: "Denver", capacity: 19520, indoor: true });
    expect(d.officials?.[0].name).toBe("Kane Fitzgerald");
    expect(d.broadcasts).toEqual(["ESPN", "ABC"]);
    expect(d.attendance).toBe(19104);
    expect(d.odds?.spread).toBe("DEN -4.5");
    expect(d.espnWinProbability?.homePct).toBe(64.2);
  });

  it("reports nothing unreadable for a payload it understood", () => {
    expect(h2h(summary()).unreadable).toEqual([]);
  });

  it("promotes a probable pitcher to the front of the lineup", () => {
    const d = h2h(summary({
      rosters: [], probables: [{ team: { id: "10" }, athlete: athlete({ id: "99", displayName: "Ace Pitcher", position: { abbreviation: "SP" } }) }],
    }));
    expect(d.home.lineup?.[0]).toMatchObject({ name: "Ace Pitcher", starter: true });
  });

  it("flags a lineup it could not read, instead of calling it unpublished", () => {
    // The block exists and holds entries, but none of them parse. That is a
    // bug in this file, and it must not read the same as "not out yet".
    const d = h2h(summary({
      rosters: [{ team: { id: "10" }, roster: [{ nonsense: true }, { also: "junk" }] }],
    }));
    expect(d.home.lineup).toBeNull();
    expect(d.unreadable).toContain("home lineup");
  });

  it("leaves unreadable empty when a lineup is simply absent", () => {
    const d = h2h(summary({ rosters: [] }));
    expect(d.home.lineup).toBeNull();
    expect(d.unreadable).toEqual([]);
  });

  it("returns null when there is no recognisable game, rather than a blank one", () => {
    // The caller turns this into "we couldn't read it". An empty GameDetail
    // would render as a real page about a game between two nameless teams.
    expect(parseGameSummary(null, ctx)).toBeNull();
    expect(parseGameSummary({}, ctx)).toBeNull();
    expect(parseGameSummary({ header: { competitions: [{ competitors: [] }] } }, ctx)).toBeNull();
    expect(parseGameSummary("<html>404</html>", ctx)).toBeNull();
  });

  it("returns null when only one side is present", () => {
    const one = summary();
    (one.header.competitions[0] as { competitors: unknown[] }).competitors = [{ homeAway: "home", team: { id: "10", displayName: "Only Team" } }];
    expect(parseGameSummary(one, ctx)).toBeNull();
  });

  it("falls back to list order only when homeAway is missing entirely", () => {
    // ESPN lists away first. Guessing is a last resort, so it is tested as one.
    const noSide = summary();
    (noSide.header.competitions[0] as { competitors: Array<Record<string, unknown>> }).competitors.forEach(c => { delete c.homeAway; });
    const d = h2h(noSide);
    expect(d.away.name).toBe("Phoenix Suns");
    expect(d.home.name).toBe("Denver Nuggets");
  });

  it("survives a game with nothing but two teams", () => {
    const bare = { header: { competitions: [{ competitors: [
      { homeAway: "away", team: { id: "2", displayName: "Away United" } },
      { homeAway: "home", team: { id: "1", displayName: "Home City" } },
    ] }] } };
    const d = h2h(bare);
    expect(d.home.name).toBe("Home City");
    for (const k of ["venue", "odds", "weather", "officials", "broadcasts", "espnWinProbability"] as const) {
      expect(d[k]).toBeNull();
    }
    expect(d.unreadable).toEqual([]);
  });
});

// ── Sports that are not two sides ────────────────────────────────────────────
//
// A golf tournament, an F1 weekend and a UFC night went through the matchup
// parser and came out as a game between the first two names in the list. These
// cover the three shapes being told apart, which is decided from the payload
// rather than from the sport's name — tennis is a field at tournament level and
// two players at match level, served by the same endpoint.

const fieldEvent = (over: Record<string, unknown> = {}) => ({
  header: {
    league: { name: "PGA Tour" },
    competitions: [{
      date: "2026-11-05T12:00Z",
      status: { type: { state: "pre", detail: "Round 1" } },
      competitors: [
        { order: 1, athlete: { id: "1", displayName: "Rory Vance", flag: { alt: "Northern Ireland" }, headshot: { href: "https://a.espncdn.com/h/1.png" } }, score: "-7" },
        { order: 2, athlete: { id: "2", displayName: "Scottie Fields", flag: { alt: "USA" } }, score: "-5" },
        { order: 3, athlete: { id: "3", displayName: "Jon Ramos", flag: { alt: "Spain" } }, score: "-4" },
      ],
    }],
  },
  gameInfo: { venue: { fullName: "Augusta National", address: { city: "Augusta", state: "GA" } } },
  ...over,
});

const fightCard = () => ({
  header: {
    league: { name: "UFC" },
    competitions: [
      { id: "1", type: { text: "Heavyweight" }, status: { type: { detail: "Main Event" } }, competitors: [
        { winner: false, athlete: { id: "1", displayName: "Jon Stone" }, records: [{ summary: "20-1-0" }] },
        { winner: false, athlete: { id: "2", displayName: "Tom Ash" }, records: [{ summary: "14-3-0" }] },
      ] },
      { id: "2", type: { text: "Lightweight" }, competitors: [
        { winner: true, athlete: { id: "3", displayName: "Islam Reed" } },
        { winner: false, athlete: { id: "4", displayName: "Dustin Pryor" } },
      ] },
    ],
  },
});

describe("a field of competitors", () => {
  it("reads a leaderboard in order, with scores and flags", () => {
    const f = parseField(fieldEvent().header.competitions[0].competitors)!;
    expect(f).toHaveLength(3);
    expect(f[0]).toMatchObject({ name: "Rory Vance", detail: "-7", country: "Northern Ireland", position: "1" });
  });

  it("is null when no field is published", () => {
    expect(parseField([])).toBeNull();
    expect(parseField(null)).toBeNull();
  });

  it("accepts a team entry, for a sport's team events", () => {
    expect(parseField([{ team: { displayName: "Team Europe", location: "Europe" }, score: "14" }])?.[0])
      .toMatchObject({ name: "Team Europe", detail: "14" });
  });

  it("comes out of the whole parser as a field, not a matchup", () => {
    const d = parseGameSummary(fieldEvent(), { eventId: "9", sport: "golf", league: "pga" })!;
    expect(d.kind).toBe("field");
    // The union guarantees this: a field has no home side to misread.
    expect(d.home).toBeNull();
    expect(d.away).toBeNull();
    if (d.kind !== "field") throw new Error("expected a field");
    expect(d.field?.map(e => e.name)).toEqual(["Rory Vance", "Scottie Fields", "Jon Ramos"]);
    expect(d.venue?.name).toBe("Augusta National");
    expect(d.unreadable).toEqual([]);
  });
});

describe("a fight card", () => {
  it("reads every bout, not just the first", () => {
    const b = parseBouts(fightCard().header.competitions)!;
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ name: "Heavyweight", status: "Main Event" });
    expect(b[0].fighters.map(f => f.name)).toEqual(["Jon Stone", "Tom Ash"]);
    expect(b[0].fighters[0].record).toBe("20-1-0");
  });

  it("marks the winner where one is given", () => {
    const b = parseBouts(fightCard().header.competitions)!;
    expect(b[1].fighters.find(f => f.winner)?.name).toBe("Islam Reed");
  });

  it("skips a bout with only one named fighter rather than showing half of it", () => {
    expect(parseBouts([{ competitors: [{ athlete: { displayName: "Only One" } }, { nothing: true }] }])).toBeNull();
  });

  it("comes out of the whole parser as a card", () => {
    const d = parseGameSummary(fightCard(), { eventId: "9", sport: "mma", league: "ufc" })!;
    expect(d.kind).toBe("card");
    expect(d.home).toBeNull();
    if (d.kind !== "card") throw new Error("expected a card");
    expect(d.bouts).toHaveLength(2);
  });
});

describe("telling the three shapes apart", () => {
  it("treats two sides with homeAway as a matchup even when there are extra competitions", () => {
    // A doubleheader payload has more than one competition, but each side is
    // still marked home or away, so it must not be read as a fight card.
    expect(h2h(summary()).kind).toBe("head_to_head");
  });

  it("treats three competitors without homeAway as a field", () => {
    const d = parseGameSummary(fieldEvent(), ctx)!;
    expect(d.kind).toBe("field");
  });

  it("does not call a two-horse field a matchup by accident", () => {
    // Two competitors and no homeAway falls back to list order, which is the
    // documented last resort — it stays a matchup rather than silently
    // becoming a field of two.
    const d = parseGameSummary({ header: { competitions: [{ competitors: [
      { athlete: { displayName: "First" } }, { athlete: { displayName: "Second" } },
    ] }] } }, ctx);
    expect(d?.kind).toBe("head_to_head");
  });

  it("flags a card it could not read instead of calling it empty", () => {
    const d = parseGameSummary({ header: { competitions: [
      { competitors: [{ junk: 1 }, { junk: 2 }] },
      { competitors: [{ junk: 3 }, { junk: 4 }] },
    ] } }, ctx);
    expect(d?.kind).toBe("card");
    expect(d?.unreadable).toContain("the card");
  });
});

describe("a side that is one person, not a team", () => {
  it("reads a tennis match between two players", () => {
    // These used to fail the team-name check and take the whole game down —
    // a real match came back as a payload we could not understand.
    const d = parseGameSummary({ header: { competitions: [{
      status: { type: { state: "pre", detail: "Round of 16" } },
      competitors: [
        { homeAway: "away", athlete: { id: "1", displayName: "Carlos Vega" }, score: "1" },
        { homeAway: "home", athlete: { id: "2", displayName: "Jannik Frost", headshot: { href: "https://a.espncdn.com/h/2.png" } }, score: "2" },
      ],
    }] } }, { eventId: "5", sport: "tennis", league: "atp" })!;
    expect(d.kind).toBe("head_to_head");
    if (d.kind !== "head_to_head") throw new Error("expected a matchup");
    expect(d.home.name).toBe("Jannik Frost");
    expect(d.away.name).toBe("Carlos Vega");
    expect(d.home.score).toBe(2);
    // With no club badge, the player's own photo stands in for it.
    expect(d.home.logo).toContain("espncdn");
  });
});

describe("players from the box score, where no line-up is published", () => {
  // The NBA, NFL and NHL publish no line-up before a game; their players only
  // appear inside boxscore.players once it is under way. Reading only
  // `rosters` meant every one of those games said "not named yet" forever.
  const boxscore = [{
    team: { id: "10" },
    statistics: [
      { name: "starters", athletes: [{ athlete: athlete({ id: "11", displayName: "Nikola Vance" }) }, { athlete: athlete({ id: "12", displayName: "Jamal Porter" }) }] },
      { name: "bench", athletes: [{ athlete: athlete({ id: "11", displayName: "Nikola Vance" }) }, { athlete: athlete({ id: "13", displayName: "Aaron Reed" }) }] },
    ],
  }];

  it("reads the players for the right team", () => {
    const p = parseBoxscorePlayers(boxscore, "10")!;
    expect(p.map(x => x.name)).toEqual(["Nikola Vance", "Jamal Porter", "Aaron Reed"]);
  });

  it("does not repeat a player who appears in several stat groups", () => {
    expect(parseBoxscorePlayers(boxscore, "10")!.filter(p => p.name === "Nikola Vance")).toHaveLength(1);
  });

  it("is null for a team that is not in the box score", () => {
    expect(parseBoxscorePlayers(boxscore, "99")).toBeNull();
    expect(parseBoxscorePlayers(null, "10")).toBeNull();
    expect(parseBoxscorePlayers(boxscore, null)).toBeNull();
  });

  it("marks nobody a starter unless the payload said so", () => {
    // A list of appearances is not a starting five, and claiming one would be
    // inventing information.
    expect(parseBoxscorePlayers(boxscore, "10")!.every(p => p.starter === false)).toBe(true);
  });

  it("fills the lineup through the whole parser, labelled as appearances", () => {
    const d = h2h(summary({ rosters: [], boxscore: { players: boxscore } }));
    expect(d.home.lineup?.map(p => p.name)).toEqual(["Nikola Vance", "Jamal Porter", "Aaron Reed"]);
    expect(d.home.lineupKind).toBe("appeared");
    // The away team is not in this box score, and gets nothing rather than
    // the home team's players.
    expect(d.away.lineup).toBeNull();
    expect(d.away.lineupKind).toBeNull();
  });

  it("prefers a published roster over the box score", () => {
    const d = h2h(summary({ boxscore: { players: boxscore } }));
    expect(d.home.lineupKind).toBe("named");
    expect(d.home.lineup?.[0].starter).toBe(true);
  });
});

describe("the odds, wherever the endpoint puts them", () => {
  it("reads pickcenter, which is what the summary endpoint uses", () => {
    // Reading only `odds` is a likely reason no line ever showed: that is the
    // scoreboard's key, not the summary's.
    const d = h2h(summary({ odds: undefined, pickcenter: [{ provider: { name: "ESPN BET" }, details: "DEN -4.5", overUnder: 228.5 }] }));
    expect(d.odds?.spread).toBe("DEN -4.5");
    expect(d.odds?.overUnder).toBe(228.5);
  });

  it("still reads `odds` where that is what arrives", () => {
    expect(h2h(summary()).odds?.spread).toBe("DEN -4.5");
  });
});

// ── Checked against ESPN's documented schema, not against my assumptions ─────
//
// The game page shipped showing almost nothing, because the parsers were
// written from memory of ESPN's shape while this environment blocks the host.
// pseudo-r/Public-ESPN-API documents the summary response and its per-sport
// quirks; these cover the four places where what it documents and what the
// code looked for were different things.

describe("the box score, where the documented schema puts it", () => {
  // The documented NBA shape nests players under boxscore.teams[].players[],
  // not a flat boxscore.players[]. Reading only the flat form is why every
  // NBA and NFL game reported that nobody had played.
  const nested = {
    teams: [{
      team: { id: "10" },
      players: [{
        team: { id: "10" },
        position: { displayName: "Guard" },
        statistics: [{
          names: ["MIN", "PTS"],
          athletes: [
            { athlete: { id: "11", displayName: "Stephen Vance" }, didNotPlay: false, stats: ["36", "32"] },
            { athlete: { id: "12", displayName: "Sat Out" }, didNotPlay: true, stats: [] },
          ],
        }],
      }],
    }],
  };

  it("reads players nested under boxscore.teams[]", () => {
    const d = h2h(summary({ rosters: [], boxscore: nested }));
    expect(d.home.lineup?.map(p => p.name)).toEqual(["Stephen Vance"]);
    expect(d.home.lineupKind).toBe("appeared");
  });

  it("leaves out anyone who did not play", () => {
    const d = h2h(summary({ rosters: [], boxscore: nested }));
    expect(d.home.lineup?.some(p => p.name === "Sat Out")).toBe(false);
  });
});

describe("leaders, the only player list that exists before a game", () => {
  const leaders = [
    { name: "points", displayName: "Points", leaders: [{ displayValue: "28.4", team: { id: "10" }, athlete: { id: "11", displayName: "Nikola Vance", headshot: { href: "https://a.espncdn.com/h/11.png" } } }] },
    { name: "assists", displayName: "Assists", leaders: [{ displayValue: "9.1", team: { id: "20" }, athlete: { id: "21", displayName: "Devin Cross" } }] },
  ];

  it("gives each team only its own leaders", () => {
    const d = h2h(summary({ leaders }));
    expect(d.home.leaders?.map(l => l.name)).toEqual(["Nikola Vance"]);
    expect(d.away.leaders?.map(l => l.name)).toEqual(["Devin Cross"]);
  });

  it("carries the category and the number", () => {
    const d = h2h(summary({ leaders }));
    expect(d.home.leaders?.[0]).toMatchObject({ category: "Points", value: "28.4" });
    expect(d.home.leaders?.[0].headshot).toContain("espncdn");
  });

  it("is null when none are published", () => {
    expect(h2h(summary({ leaders: [] })).home.leaders).toBeNull();
    expect(h2h(summary()).home.leaders).toBeNull();
  });
});

describe("broadcasts, which the summary endpoint puts at the top level", () => {
  it("reads a top-level broadcasts array", () => {
    // The code looked only under the competition, which is the scoreboard's
    // placement — so no broadcaster ever showed on a game page.
    const s = summary();
    delete (s.header.competitions[0] as Record<string, unknown>).broadcasts;
    const d = h2h({ ...s, broadcasts: [{ market: "national", names: ["ESPN"] }] });
    expect(d.broadcasts).toEqual(["ESPN"]);
  });
});

describe("the summary URL per sport", () => {
  it("uses the plain site endpoint for ordinary sports", async () => {
    const { summaryUrl } = await import("../sportsDetail");
    expect(summaryUrl("basketball", "nba", "401"))
      .toBe("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401");
  });

  it("uses cricket's own host and parameters", async () => {
    // Cricket is served from the web host, by numeric series id, and needs
    // lang/region/contentorigin — without them the match does not come back.
    const { summaryUrl } = await import("../sportsDetail");
    const u = summaryUrl("cricket", "23694", "1490237");
    expect(u).toContain("site.web.api.espn.com");
    expect(u).toContain("/sports/cricket/23694/summary");
    expect(u).toContain("event=1490237");
    expect(u).toContain("lang=en");
    expect(u).toContain("region=in");
    expect(u).toContain("contentorigin=espn");
  });

  it("escapes anything unexpected in the identifiers", async () => {
    const { summaryUrl } = await import("../sportsDetail");
    expect(summaryUrl("a/b", "c?d", "1")).not.toContain("a/b");
    expect(summaryUrl("a/b", "c?d", "1")).toContain("a%2Fb");
  });
});

// ── Against the real payloads, finally ───────────────────────────────────────
//
// A workflow asked ESPN directly from a GitHub runner, which can reach it, and
// printed the structure of real games. These are built from what it found, not
// from what I expected to find. The shapes below are the ones that were
// actually wrong.

describe("leaders, as ESPN really sends them before a game", () => {
  // The probe on Atlanta Hawks at New Orleans Pelicans:
  //   leaders[0] keys = ["leaders", "team"], displayName = null
  //   leaders[0].leaders[0] keys = ["displayName", "leaders", "name"]
  // Categories are wrapped in a per-team object, so reading displayName at the
  // top gave null and the section reported no leaders on every upcoming game —
  // which is the only kind the list offers.
  const wrapped = [
    {
      team: { id: "10" },
      leaders: [
        { name: "points", displayName: "Points", leaders: [{ displayValue: "28.4", athlete: { id: "11", displayName: "Nikola Vance", headshot: { href: "https://a.espncdn.com/h/11.png" } } }] },
        { name: "rebounds", displayName: "Rebounds", leaders: [{ displayValue: "12.1", athlete: { id: "12", displayName: "Aaron Reed" } }] },
      ],
    },
    {
      team: { id: "20" },
      leaders: [
        { name: "points", displayName: "Points", leaders: [{ displayValue: "24.8", athlete: { id: "21", displayName: "Devin Cross" } }] },
      ],
    },
  ];

  it("reads the per-team wrapped shape", () => {
    const d = h2h(summary({ leaders: wrapped }));
    expect(d.home.leaders?.map(l => `${l.category}: ${l.name} ${l.value}`))
      .toEqual(["Points: Nikola Vance 28.4", "Rebounds: Aaron Reed 12.1"]);
  });

  it("gives each team only its own block", () => {
    const d = h2h(summary({ leaders: wrapped }));
    expect(d.away.leaders?.map(l => l.name)).toEqual(["Devin Cross"]);
  });

  it("still reads the flat shape, where the category is the top level", () => {
    const d = h2h(summary({ leaders: [
      { name: "points", displayName: "Points", leaders: [{ displayValue: "31", team: { id: "10" }, athlete: { displayName: "Flat Form" } }] },
    ] }));
    expect(d.home.leaders?.[0]).toMatchObject({ category: "Points", name: "Flat Form", value: "31" });
    expect(d.away.leaders).toBeNull();
  });

  it("keeps the headshot where there is one", () => {
    expect(h2h(summary({ leaders: wrapped })).home.leaders?.[0].headshot).toContain("espncdn");
  });
});

describe("the quoted line, as ESPN really sends it", () => {
  // The probe's pickcenter[0]: provider "Draft Kings", details "ATL -4.5",
  // overUnder 239.5, homeTeamOdds.moneyLine 164, awayTeamOdds.moneyLine -198.
  it("reads a real pickcenter entry", () => {
    const d = h2h(summary({
      odds: undefined,
      pickcenter: [{
        provider: { name: "Draft Kings" }, details: "ATL -4.5", overUnder: 239.5,
        homeTeamOdds: { moneyLine: 164 }, awayTeamOdds: { moneyLine: -198 },
      }],
    }));
    expect(d.odds).toEqual({
      provider: "Draft Kings", spread: "ATL -4.5", overUnder: 239.5,
      homeMoneyline: 164, awayMoneyline: -198,
    });
  });
});

describe("a team's season record, in each spelling ESPN uses", () => {
  const withRecord = (record: unknown) => {
    const s = summary();
    const comps = s.header.competitions[0] as { competitors: Array<Record<string, unknown>> };
    const home = comps.competitors.find(c => c.homeAway === "home")!;
    delete home.records;
    home.record = record;
    return h2h(s);
  };

  it("reads `record` as an array, which a summary's competitor sends", () => {
    expect(withRecord([{ summary: "7-2" }]).home.record).toBe("7-2");
  });

  it("reads `record` as a single object", () => {
    expect(withRecord({ summary: "7-2" }).home.record).toBe("7-2");
  });

  it("reads `records` as an array, which the scoreboard sends", () => {
    expect(h2h(summary()).home.record).toBe("7-2");
  });
});

// ── Box score numbers ────────────────────────────────────────────────────────
//
// A live game showed who was on court and nothing about how it was going,
// while a search engine showed the same game's score, shooting percentages and
// every player's points. The numbers were in the payload the whole time; the
// parser read the athletes and dropped the stats beside them.

describe("the numbers beside each player", () => {
  const players = [{
    team: { id: "10" },
    statistics: [{
      names: ["MIN", "FG", "REB", "AST", "PTS"],
      athletes: [
        { athlete: { id: "11", displayName: "Zion Williamson" }, didNotPlay: false, stats: ["28", "4-9", "3", "1", "10"] },
        { athlete: { id: "12", displayName: "Saddiq Bey" }, didNotPlay: false, stats: ["24", "5-8", "5", "0", "13"] },
      ],
    }],
  }];

  it("pairs each number with its label", () => {
    const d = h2h(summary({ rosters: [], boxscore: { players } }));
    const zion = d.home.lineup?.find(p => p.name === "Zion Williamson");
    expect(zion?.stats).toEqual([
      { label: "MIN", value: "28" }, { label: "FG", value: "4-9" },
      { label: "REB", value: "3" }, { label: "AST", value: "1" }, { label: "PTS", value: "10" },
    ]);
  });

  it("refuses to pair a row that does not match its header", () => {
    // A shifted box score reads as confidently wrong numbers — the wrong
    // player credited with the wrong total — so a mismatch yields none.
    const d = h2h(summary({ rosters: [], boxscore: { players: [{
      team: { id: "10" },
      statistics: [{ names: ["MIN", "PTS"], athletes: [{ athlete: { displayName: "Short Row" }, stats: ["28"] }] }],
    }] } }));
    expect(d.home.lineup?.[0].stats).toBeNull();
  });

  it("merges the categories a player appears in, rather than keeping the first", () => {
    // Football lists the same player under passing and rushing.
    const d = h2h(summary({ rosters: [], boxscore: { players: [{
      team: { id: "10" },
      statistics: [
        { names: ["YDS", "TD"], athletes: [{ athlete: { id: "9", displayName: "Two Ways" }, stats: ["244", "2"] }] },
        { names: ["CAR", "LONG"], athletes: [{ athlete: { id: "9", displayName: "Two Ways" }, stats: ["7", "18"] }] },
      ],
    }] } }));
    expect(d.home.lineup?.[0].stats?.map(x => x.label)).toEqual(["YDS", "TD", "CAR", "LONG"]);
  });

  it("leaves stats null before a game", () => {
    expect(h2h(summary()).home.lineup?.[0].stats).toBeNull();
  });
});

describe("a team's totals", () => {
  const teams = [
    { team: { id: "10" }, statistics: [
      { name: "fieldGoalPct", label: "FG%", displayValue: "53.8" },
      { name: "rebounds", label: "Total Rebounds", displayValue: "25" },
    ] },
    { team: { id: "20" }, statistics: [
      { name: "fieldGoalPct", label: "FG%", displayValue: "40.9" },
      { name: "rebounds", label: "Total Rebounds", displayValue: "17" },
    ] },
  ];

  it("reads each side's own totals", async () => {
    const { parseTeamStats } = await import("../sportsDetail");
    expect(parseTeamStats(teams, "10")).toEqual([
      { label: "FG%", value: "53.8" }, { label: "Total Rebounds", value: "25" },
    ]);
    expect(parseTeamStats(teams, "20")?.[0].value).toBe("40.9");
  });

  it("comes through the whole parser onto both sides", () => {
    const d = h2h(summary({ boxscore: { teams } }));
    expect(d.home.stats?.find(s => s.label === "FG%")?.value).toBe("53.8");
    expect(d.away.stats?.find(s => s.label === "FG%")?.value).toBe("40.9");
  });

  it("is null for a team not in the box score, and before a game", async () => {
    const { parseTeamStats } = await import("../sportsDetail");
    expect(parseTeamStats(teams, "99")).toBeNull();
    expect(parseTeamStats(null, "10")).toBeNull();
    expect(h2h(summary()).home.stats).toBeNull();
  });
});
