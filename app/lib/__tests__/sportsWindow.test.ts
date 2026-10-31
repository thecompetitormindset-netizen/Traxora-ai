import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Two fetches over the same data, deliberately different.
//
// The page shows upcoming, live and finished games, because showing only
// upcoming ones meant a line-up or a box score could never be reached: the US
// leagues publish no line-up before a game, so every game anyone could open
// had nothing to show.
//
// The cron must keep seeing ONLY upcoming games. It snapshots predictions
// before games start, and if it ever logged one already under way it would be
// recording a prediction it did not make beforehand — which would make the
// whole track record worthless. That invariant is what most of this file is
// defending.

const NBA = "basketball/nba";

const competitor = (id: string, side: "home" | "away", name: string, score?: string) => ({
  id, homeAway: side, team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() },
  ...(score === undefined ? {} : { score }),
});

const event = (
  id: string,
  state: "pre" | "in" | "post",
  offsetDays: number,
  scores?: [string, string],
) => ({
  id,
  date: new Date(Date.now() + offsetDays * 86_400_000).toISOString(),
  competitions: [{
    competitors: [
      competitor("20", "away", "Phoenix Suns", scores?.[0]),
      competitor("10", "home", "Denver Nuggets", scores?.[1]),
    ],
    status: { type: { state, completed: state === "post", detail: state === "post" ? "Final" : state === "in" ? "Q3 4:12" : "7:30 PM ET" } },
  }],
});

const standings = {
  standings: {
    entries: [
      { team: { id: "10" }, stats: [{ name: "wins", value: 20 }, { name: "losses", value: 10 }, { name: "gamesPlayed", value: 30 }] },
      { team: { id: "20" }, stats: [{ name: "wins", value: 12 }, { name: "losses", value: 18 }, { name: "gamesPlayed", value: 30 }] },
    ],
  },
};

/** Serve one league's scoreboard and standings; everything else is empty. */
function mockEspn(events: unknown[]) {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.includes("/standings")) return ok(url.includes(NBA) ? standings : { standings: { entries: [] } });
    if (url.includes(`${NBA}/scoreboard`)) {
      // Every day asked for returns the same events; the code de-duplicates by
      // id, which is part of what is being checked.
      return ok({ events });
    }
    return ok({ events: [] });
  });
}

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; vi.restoreAllMocks(); });
beforeEach(() => { vi.resetModules(); });

describe("what the cron is allowed to see", () => {
  it("returns only unstarted games, whatever else is on the scoreboard", async () => {
    globalThis.fetch = mockEspn([
      event("1", "pre", 1),
      event("2", "in", 0, ["58", "61"]),
      event("3", "post", -1, ["104", "110"]),
    ]) as unknown as typeof fetch;

    const { fetchAllUpcoming } = await import("../sportsPredictions");
    const games = await fetchAllUpcoming();
    expect(games.map(g => g.id)).toEqual(["1"]);
    expect(games[0].state).toBe("pre");
  });

  it("gives an unstarted game a prediction", async () => {
    globalThis.fetch = mockEspn([event("1", "pre", 1)]) as unknown as typeof fetch;
    const { fetchAllUpcoming } = await import("../sportsPredictions");
    const [g] = await fetchAllUpcoming();
    // Denver are 20-10 against Phoenix's 12-18, so they are favoured.
    expect(g.predictedWinner).toBe("Denver Nuggets");
    expect(g.winnerConfidence).toBeGreaterThan(50);
  });
});

describe("what the page sees", () => {
  it("includes live and finished games as well as upcoming", async () => {
    globalThis.fetch = mockEspn([
      event("1", "pre", 1),
      event("2", "in", 0, ["58", "61"]),
      event("3", "post", -1, ["104", "110"]),
    ]) as unknown as typeof fetch;

    const { fetchAllGames } = await import("../sportsPredictions");
    const games = await fetchAllGames();
    expect(games.map(g => g.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("puts live first, then upcoming, then finished", async () => {
    globalThis.fetch = mockEspn([
      event("3", "post", -1, ["104", "110"]),
      event("1", "pre", 1),
      event("2", "in", 0, ["58", "61"]),
    ]) as unknown as typeof fetch;

    const { fetchAllGames } = await import("../sportsPredictions");
    expect((await fetchAllGames()).map(g => g.state)).toEqual(["in", "pre", "post"]);
  });

  it("carries the score and the status for a game under way", async () => {
    globalThis.fetch = mockEspn([event("2", "in", 0, ["58", "61"])]) as unknown as typeof fetch;
    const { fetchAllGames } = await import("../sportsPredictions");
    const [g] = await fetchAllGames();
    expect(g.awayScore).toBe(58);
    expect(g.homeScore).toBe(61);
    expect(g.statusDetail).toBe("Q3 4:12");
  });

  it("gives a started game NO prediction", async () => {
    // Standings are read live and already contain a finished game's own
    // result, so a prediction computed now would be hindsight — and it would
    // flatter us. The card says "finished" and points at the track record.
    globalThis.fetch = mockEspn([
      event("2", "in", 0, ["58", "61"]),
      event("3", "post", -1, ["104", "110"]),
    ]) as unknown as typeof fetch;

    const { fetchAllGames } = await import("../sportsPredictions");
    for (const g of await fetchAllGames()) {
      expect(g.predictedWinner, `${g.id} should carry no pick`).toBeNull();
      expect(g.winnerConfidence).toBeNull();
    }
  });

  it("de-duplicates a game that appears on several days' scoreboards", async () => {
    globalThis.fetch = mockEspn([event("1", "pre", 1)]) as unknown as typeof fetch;
    const { fetchAllGames } = await import("../sportsPredictions");
    expect(await fetchAllGames()).toHaveLength(1);
  });

  it("leaves scores null before a game, rather than zero", async () => {
    globalThis.fetch = mockEspn([event("1", "pre", 1)]) as unknown as typeof fetch;
    const { fetchAllGames } = await import("../sportsPredictions");
    const [g] = await fetchAllGames();
    expect(g.homeScore).toBeNull();
    expect(g.awayScore).toBeNull();
  });
});

describe("capturing the line off the scoreboard", () => {
  it("reads a line the scoreboard carries", async () => {
    const { captureLine } = await import("../sportsPredictions");
    const ev = {
      id: "1", date: new Date().toISOString(),
      competitions: [{
        competitors: [], status: { type: { state: "pre" as const, completed: false } },
        odds: [{
          provider: { name: "Draft Kings" }, details: "ATL -4.5", overUnder: 239.5,
          homeTeamOdds: { moneyLine: 164 }, awayTeamOdds: { moneyLine: -198 },
        }],
      }],
    };
    expect(captureLine(ev)).toEqual({
      spread: "ATL -4.5", total: 239.5, homeMl: 164, awayMl: -198, book: "Draft Kings",
    });
  });

  it("is null when no book is quoted, not a pick-em at zero", async () => {
    // Most leagues here carry no line. Recording that as a line of zero would
    // be asserting a market that does not exist.
    const { captureLine } = await import("../sportsPredictions");
    const bare = (odds?: Array<Record<string, unknown>>) => ({
      id: "1", date: new Date().toISOString(),
      competitions: [{ competitors: [], status: { type: { state: "pre" as const, completed: false } }, ...(odds ? { odds } : {}) }],
    });
    expect(captureLine(bare())).toBeNull();
    expect(captureLine(bare([]))).toBeNull();
    expect(captureLine(bare([{ provider: { name: "Draft Kings" } }]))).toBeNull();
  });

  it("reads a moneyline sent as a string", async () => {
    const { captureLine } = await import("../sportsPredictions");
    const ev = {
      id: "1", date: new Date().toISOString(),
      competitions: [{
        competitors: [], status: { type: { state: "pre" as const, completed: false } },
        odds: [{ awayTeamOdds: { moneyLine: "+160" }, overUnder: "228.5" }],
      }],
    };
    const line = captureLine(ev)!;
    expect(line.awayMl).toBe(160);
    expect(line.total).toBe(228.5);
  });
});
