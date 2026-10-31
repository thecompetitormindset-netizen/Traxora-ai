import { describe, it, expect } from "vitest";
import {
  parseGameSummary, parsePerson, parseLineup, parseVenue, parseOdds,
  parseWeather, parseOfficials, parseInjuries, parseForm, parseWinProbability,
} from "../sportsDetail";

// A game page is mostly absences: lineups appear an hour before kickoff, most
// leagues carry no odds, a dome has no weather. So most of what is tested here
// is that an absence reads as an absence and never as a zero, an empty list or
// a silent success.

const ctx = { eventId: "401", sport: "basketball", league: "nba" };

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
    const d = parseGameSummary(summary(), ctx)!;
    expect(d.home.name).toBe("Denver Nuggets");
    expect(d.away.name).toBe("Phoenix Suns");
    expect(d.home.record).toBe("7-2");
    expect(d.home.logo).toBe("https://x/den.png");
  });

  it("attaches each team's own lineup, injuries and form", () => {
    const d = parseGameSummary(summary(), ctx)!;
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
    const d = parseGameSummary(summary(), ctx)!;
    expect(d.venue).toMatchObject({ name: "Ball Arena", city: "Denver", capacity: 19520, indoor: true });
    expect(d.officials?.[0].name).toBe("Kane Fitzgerald");
    expect(d.broadcasts).toEqual(["ESPN", "ABC"]);
    expect(d.attendance).toBe(19104);
    expect(d.odds?.spread).toBe("DEN -4.5");
    expect(d.espnWinProbability?.homePct).toBe(64.2);
  });

  it("reports nothing unreadable for a payload it understood", () => {
    expect(parseGameSummary(summary(), ctx)!.unreadable).toEqual([]);
  });

  it("promotes a probable pitcher to the front of the lineup", () => {
    const d = parseGameSummary(summary({
      rosters: [], probables: [{ team: { id: "10" }, athlete: athlete({ id: "99", displayName: "Ace Pitcher", position: { abbreviation: "SP" } }) }],
    }), ctx)!;
    expect(d.home.lineup?.[0]).toMatchObject({ name: "Ace Pitcher", starter: true });
  });

  it("flags a lineup it could not read, instead of calling it unpublished", () => {
    // The block exists and holds entries, but none of them parse. That is a
    // bug in this file, and it must not read the same as "not out yet".
    const d = parseGameSummary(summary({
      rosters: [{ team: { id: "10" }, roster: [{ nonsense: true }, { also: "junk" }] }],
    }), ctx)!;
    expect(d.home.lineup).toBeNull();
    expect(d.unreadable).toContain("home lineup");
  });

  it("leaves unreadable empty when a lineup is simply absent", () => {
    const d = parseGameSummary(summary({ rosters: [] }), ctx)!;
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
    const d = parseGameSummary(noSide, ctx)!;
    expect(d.away.name).toBe("Phoenix Suns");
    expect(d.home.name).toBe("Denver Nuggets");
  });

  it("survives a game with nothing but two teams", () => {
    const bare = { header: { competitions: [{ competitors: [
      { homeAway: "away", team: { id: "2", displayName: "Away United" } },
      { homeAway: "home", team: { id: "1", displayName: "Home City" } },
    ] }] } };
    const d = parseGameSummary(bare, ctx)!;
    expect(d.home.name).toBe("Home City");
    for (const k of ["venue", "odds", "weather", "officials", "broadcasts", "espnWinProbability"] as const) {
      expect(d[k]).toBeNull();
    }
    expect(d.unreadable).toEqual([]);
  });
});
