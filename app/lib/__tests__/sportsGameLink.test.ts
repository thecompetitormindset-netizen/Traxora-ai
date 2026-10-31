import { describe, it, expect } from "vitest";
import { splitSportKey, gameHref } from "../sportsGameLink";

describe("splitting a sportKey", () => {
  it("splits an ordinary one", () => {
    expect(splitSportKey("basketball_nba")).toEqual({ sport: "basketball", league: "nba" });
  });

  it("keeps a hyphenated league whole", () => {
    // Splitting on every underscore is fine here, but splitting on every
    // separator would leave "college" as the league.
    expect(splitSportKey("football_college-football"))
      .toEqual({ sport: "football", league: "college-football" });
    expect(splitSportKey("basketball_mens-college-basketball"))
      .toEqual({ sport: "basketball", league: "mens-college-basketball" });
  });

  it("keeps a dotted soccer league whole", () => {
    expect(splitSportKey("soccer_eng.1")).toEqual({ sport: "soccer", league: "eng.1" });
    expect(splitSportKey("soccer_uefa.champions")).toEqual({ sport: "soccer", league: "uefa.champions" });
  });

  it("splits on the first underscore only", () => {
    expect(splitSportKey("a_b_c")).toEqual({ sport: "a", league: "b_c" });
  });

  it("is null for anything that is not a key", () => {
    expect(splitSportKey("nba")).toBeNull();
    expect(splitSportKey("_nba")).toBeNull();
    expect(splitSportKey("basketball_")).toBeNull();
    expect(splitSportKey("")).toBeNull();
  });
});

describe("the link on a game card", () => {
  it("points at the game page with everything the route needs", () => {
    expect(gameHref("basketball_nba", "401584692"))
      .toBe("/sports/game?sport=basketball&league=nba&event=401584692");
  });

  it("encodes a dotted league rather than emitting it raw", () => {
    const href = gameHref("soccer_eng.1", "700123")!;
    const q = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(q.get("sport")).toBe("soccer");
    expect(q.get("league")).toBe("eng.1");
    expect(q.get("event")).toBe("700123");
  });

  it("is null when the id is not an event id", () => {
    // A card that cannot be linked stays un-clickable, rather than offering a
    // tap that lands on an error.
    expect(gameHref("basketball_nba", "")).toBeNull();
    expect(gameHref("basketball_nba", "abc")).toBeNull();
    expect(gameHref("basketball_nba", "401/../../etc")).toBeNull();
    expect(gameHref("basketball_nba", "401 584")).toBeNull();
  });

  it("is null when the key cannot be split", () => {
    expect(gameHref("nba", "401")).toBeNull();
  });

  it("round-trips every league the app covers", async () => {
    const { LEAGUES } = await import("../sportsPredictions");
    for (const l of LEAGUES) {
      const href = gameHref(`${l.sport}_${l.league}`, "401");
      expect(href, `${l.label} should be linkable`).not.toBeNull();
      const q = new URLSearchParams(href!.slice(href!.indexOf("?") + 1));
      expect(q.get("sport")).toBe(l.sport);
      expect(q.get("league")).toBe(l.league);
    }
  });
});

describe("the link on a more-sports event card", () => {
  it("links a rugby match from its competition path", async () => {
    const { eventHref } = await import("../sportsGameLink");
    expect(eventHref("rugby", "164205", "600123"))
      .toBe("/sports/game?sport=rugby&league=164205&event=600123");
  });

  it("links a golf tournament", async () => {
    const { eventHref } = await import("../sportsGameLink");
    expect(eventHref("golf", "pga", "401580")).toBe("/sports/game?sport=golf&league=pga&event=401580");
  });

  it("offers no link when ESPN does not serve the event", async () => {
    const { eventHref } = await import("../sportsGameLink");
    // Chess comes from Lichess and already links there; a cricket match whose
    // competition the feed did not name cannot be asked for.
    expect(eventHref(null, null, "123")).toBeNull();
    expect(eventHref("cricket", null, "123")).toBeNull();
    expect(eventHref(null, "pga", "123")).toBeNull();
  });

  it("offers no link for a non-numeric event id", async () => {
    const { eventHref } = await import("../sportsGameLink");
    expect(eventHref("chess", "broadcast", "abc-tour")).toBeNull();
  });

  it("covers every competition on the more-sports schedule", async () => {
    const { eventHref } = await import("../sportsGameLink");
    const { MATCH_COMPS, EVENT_COMPS, splitCompPath } = await import("../sportsEvents");
    for (const c of [...MATCH_COMPS, ...EVENT_COMPS]) {
      const p = splitCompPath(c.path);
      expect(p, `${c.path} should split`).not.toBeNull();
      expect(eventHref(p!.sport, p!.league, "401"), `${c.sport} should be linkable`).not.toBeNull();
    }
  });
});
