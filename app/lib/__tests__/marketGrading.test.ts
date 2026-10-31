import { describe, it, expect } from "vitest";
import {
  impliedProbability, devig, homeSpread, favouredSide, winner,
  gradeSpread, gradeTotal, marketRecord, ourRecord, versusMarket, calibration,
  MIN_GRADED, MIN_PER_BAND, type GradedGame,
} from "../marketGrading";

// Grading the market, not betting on it. The thing these tests are mostly
// defending is restraint: no verdict on a single game, no rate from a handful
// of them, and no credit taken for the bookmaker's own margin.

describe("what a moneyline implies", () => {
  it("prices a favourite above even", () => {
    expect(impliedProbability(-150)).toBeCloseTo(0.6, 4);
    expect(impliedProbability(-198)).toBeCloseTo(0.6644, 3);
  });

  it("prices an underdog below even", () => {
    expect(impliedProbability(+130)).toBeCloseTo(0.4348, 3);
    expect(impliedProbability(164)).toBeCloseTo(0.3788, 3);
  });

  it("prices a true even-money line at a half", () => {
    expect(impliedProbability(100)).toBeCloseTo(0.5, 4);
    expect(impliedProbability(-100)).toBeCloseTo(0.5, 4);
  });

  it("is null for a number that is not a line", () => {
    expect(impliedProbability(0)).toBeNull();
    expect(impliedProbability(NaN)).toBeNull();
    expect(impliedProbability(Infinity)).toBeNull();
  });
});

describe("taking the book's margin out", () => {
  it("makes the two sides sum to one", () => {
    const d = devig(164, -198)!;
    expect(d.home + d.away).toBeCloseTo(1, 10);
  });

  it("reports the overround it removed", () => {
    // -150/+130 implies 60% and 43.5%: the book is holding about 3.5%.
    expect(devig(-150, 130)!.overround).toBeCloseTo(0.0348, 3);
  });

  it("keeps the favourite the favourite", () => {
    const d = devig(164, -198)!;
    expect(d.away).toBeGreaterThan(d.home);
  });

  it("matters, because the raw number overstates the favourite", () => {
    // Comparing a raw implied probability against how often that side won
    // would mark the book down for its own margin every time and call it a
    // forecasting error.
    const raw = impliedProbability(-198)!;
    expect(devig(164, -198)!.away).toBeLessThan(raw);
  });

  it("is null when either side is missing", () => {
    expect(devig(null, -198)).toBeNull();
    expect(devig(164, null)).toBeNull();
  });
});

describe("reading the spread off the book's wording", () => {
  it("keeps the sign when the home team is named", () => {
    expect(homeSpread("DEN -4.5", "DEN", "PHX")).toBe(-4.5);
  });

  it("flips the sign when the away team is named", () => {
    // The probe's real example: "ATL -4.5" on Atlanta Hawks AT New Orleans.
    // Atlanta are away and favoured, so the home line is +4.5. Getting this
    // backwards is the difference between a cover and a loss.
    expect(homeSpread("ATL -4.5", "NO", "ATL")).toBe(4.5);
  });

  it("reads a pick-em as zero", () => {
    expect(homeSpread("EVEN", "DEN", "PHX")).toBe(0);
    expect(homeSpread("PK", "DEN", "PHX")).toBe(0);
  });

  it("refuses a spread whose side it cannot identify", () => {
    // Guessing which team it belongs to would be wrong half the time, with
    // full confidence.
    expect(homeSpread("XYZ -4.5", "DEN", "PHX")).toBeNull();
  });

  it("is null for no line at all, not zero", () => {
    expect(homeSpread(null, "DEN", "PHX")).toBeNull();
    expect(homeSpread("", "DEN", "PHX")).toBeNull();
    expect(homeSpread("no idea", "DEN", "PHX")).toBeNull();
  });
});

describe("mechanical outcomes", () => {
  it("names the favoured side", () => {
    expect(favouredSide(-198, 164)).toBe("home");
    expect(favouredSide(164, -198)).toBe("away");
  });

  it("has no favourite at a true pick-em", () => {
    expect(favouredSide(-110, -110)).toBeNull();
    expect(favouredSide(null, 164)).toBeNull();
  });

  it("names the winner, and a draw as a draw", () => {
    expect(winner(110, 104)).toBe("home");
    expect(winner(104, 110)).toBe("away");
    expect(winner(1, 1)).toBe("push");
  });

  it("grades a cover", () => {
    // Home favoured by 4.5 and winning by 6: covered.
    expect(gradeSpread(-4.5, 110, 104)).toBe("home");
    // Winning by 3 is not enough.
    expect(gradeSpread(-4.5, 107, 104)).toBe("away");
  });

  it("grades a push as a push, not a win", () => {
    // Home getting 3 and losing by exactly 3. Folding this either way would
    // quietly move a hit rate, and whole-number spreads produce a lot of them.
    expect(gradeSpread(3, 101, 104)).toBe("push");
  });

  it("grades a total, including the exact landing", () => {
    expect(gradeTotal(239.5, 120, 121)).toBe("over");
    expect(gradeTotal(239.5, 118, 121)).toBe("under");
    expect(gradeTotal(240, 120, 120)).toBe("push");
  });

  it("declines to grade what it was not given", () => {
    expect(gradeSpread(null, 110, 104)).toBeNull();
    expect(gradeTotal(null, 110, 104)).toBeNull();
  });
});

// ── Aggregates ───────────────────────────────────────────────────────────────

const game = (over: Partial<GradedGame> = {}): GradedGame => ({
  marketProbability: 0.62, marketPick: "home", ourPick: "home",
  ourProbability: 0.64, result: "home", ...over,
});

const many = (n: number, over: Partial<GradedGame> = {}) =>
  Array.from({ length: n }, () => game(over));

describe("the market's record", () => {
  it("counts how often its favourite won", () => {
    const games = [...many(20), ...many(10, { result: "away" })];
    const r = marketRecord(games);
    expect(r.graded).toBe(30);
    expect(r.correct).toBe(20);
    expect(r.hitRate).toBeCloseTo(2 / 3, 4);
  });

  it("refuses a rate below the floor, and says why", () => {
    const r = marketRecord(many(5));
    expect(r.hitRate).toBeNull();
    expect(r.graded).toBe(5);
    expect(r.note).toContain(`${MIN_GRADED} needed`);
  });

  it("leaves pushes out of the denominator", () => {
    const r = marketRecord([...many(MIN_GRADED), ...many(10, { result: "push" })]);
    expect(r.graded).toBe(MIN_GRADED);
  });

  it("leaves out games with no line", () => {
    const r = marketRecord([...many(MIN_GRADED), ...many(10, { marketPick: null })]);
    expect(r.graded).toBe(MIN_GRADED);
  });
});

describe("our record over the same games", () => {
  it("is counted the same way, so the two are comparable", () => {
    const games = [...many(MIN_GRADED, { ourPick: "home", result: "home" }), ...many(5, { ourPick: "away", result: "home" })];
    const r = ourRecord(games);
    expect(r.graded).toBe(MIN_GRADED + 5);
    expect(r.correct).toBe(MIN_GRADED);
  });
});

describe("whether we beat the closing line", () => {
  it("ignores the games where we agreed with it", () => {
    // Agreeing proves nothing: being right just says the favourite won.
    const r = versusMarket(many(50, { ourPick: "home", marketPick: "home" }));
    expect(r.disagreements).toBe(0);
    expect(r.ourShare).toBeNull();
  });

  it("counts only the games where we took the other side", () => {
    const games = [
      ...many(30, { ourPick: "home", marketPick: "home", result: "home" }),
      ...many(MIN_GRADED, { ourPick: "away", marketPick: "home", result: "away" }),
      ...many(MIN_GRADED, { ourPick: "away", marketPick: "home", result: "home" }),
    ];
    const r = versusMarket(games);
    expect(r.disagreements).toBe(MIN_GRADED * 2);
    expect(r.weWere).toBe(MIN_GRADED);
    expect(r.ourShare).toBeCloseTo(0.5, 4);
  });

  it("says nothing until there are enough disagreements", () => {
    const r = versusMarket(many(3, { ourPick: "away", marketPick: "home" }));
    expect(r.ourShare).toBeNull();
    expect(r.note).toContain("disagreed");
  });
});

describe("calibration", () => {
  it("puts a game in the band its implied chance falls in", () => {
    const bands = calibration(many(MIN_PER_BAND, { marketProbability: 0.62 }));
    const band = bands.find(b => b.low === 0.60)!;
    expect(band.games).toBe(MIN_PER_BAND);
    expect(band.implied).toBeCloseTo(0.62, 4);
  });

  it("reports the actual rate once a band has enough games", () => {
    const games = [
      ...many(MIN_PER_BAND, { marketProbability: 0.62, result: "home", marketPick: "home" }),
      ...many(MIN_PER_BAND, { marketProbability: 0.62, result: "away", marketPick: "home" }),
    ];
    const band = calibration(games).find(b => b.low === 0.60)!;
    expect(band.games).toBe(MIN_PER_BAND * 2);
    expect(band.actual).toBeCloseTo(0.5, 4);
  });

  it("leaves a thin band's rate null rather than printing noise", () => {
    const band = calibration(many(2, { marketProbability: 0.62 })).find(b => b.low === 0.60)!;
    expect(band.games).toBe(2);
    expect(band.actual).toBeNull();
    // The implied average is still honest to show — it is what was quoted,
    // not a claim about outcomes.
    expect(band.implied).toBeCloseTo(0.62, 4);
  });

  it("covers every band without overlapping", () => {
    const bands = calibration([]);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].low).toBe(bands[i - 1].high);
    }
    expect(bands[0].low).toBe(0.5);
    expect(bands[bands.length - 1].high).toBeGreaterThan(1);
  });

  it("holds no games when there is nothing settled", () => {
    expect(calibration([]).every(b => b.games === 0 && b.actual === null)).toBe(true);
  });
});
