import { describe, expect, it } from "vitest";
import {
  MIN_BACKTEST_SAMPLE,
  crowdingPenalty,
  edgeOver,
  gradePick,
  scoreCandidate,
  selectPicks,
  sliceForDate,
  trackRecord,
  type Candidate,
} from "../dailyPicks";

// The brief these encode: a few names a day, chosen for certainty rather than
// noise, favouring setups the crowd has not arrived at, and never padded out
// to fill a quota.

const stats = (over: Partial<{ count: number; hitRate: number; avgReturn: number; baselineAvgReturn: number }> = {}) => ({
  count: 60,
  hitRate: 68,
  avgReturn: 4.2,
  baselineAvgReturn: 1.1,
  ...over,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  symbol: "AAPL",
  direction: "BUY",
  price: 100,
  backtest: stats(),
  volumeRatio: 1.1,
  trending: false,
  confidence: "High",
  ...over,
});

describe("edgeOver", () => {
  it("measures the signal against simply holding", () => {
    // A hit rate alone says nothing: if the stock rose in 60% of all windows,
    // a 60% hit rate is the market, not a signal.
    expect(edgeOver(stats({ avgReturn: 4.2, baselineAvgReturn: 1.1 }))).toBeCloseTo(3.1, 5);
  });

  it("is null without a baseline to compare to", () => {
    expect(edgeOver(stats({ baselineAvgReturn: null as unknown as number }))).toBeNull();
  });
});

describe("crowdingPenalty", () => {
  it("charges nothing for ordinary volume", () => {
    expect(crowdingPenalty(1.0, false)).toBe(0);
    expect(crowdingPenalty(2.0, false)).toBe(0);
  });

  it("charges more the more the crowd has arrived", () => {
    const mild = crowdingPenalty(3, false);
    const heavy = crowdingPenalty(6, false);
    expect(heavy).toBeGreaterThan(mild);
  });

  it("caps the volume term so one wild print cannot dominate", () => {
    expect(crowdingPenalty(50, false)).toBe(crowdingPenalty(10, false));
  });

  it("charges for being in a public trending list", () => {
    expect(crowdingPenalty(1.0, true)).toBeGreaterThan(crowdingPenalty(1.0, false));
  });

  it("charges nothing for unknown volume", () => {
    // Absence of evidence is not evidence of obscurity. Penalising a missing
    // field would quietly favour symbols whose data failed to arrive.
    expect(crowdingPenalty(null, false)).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("rejects a hit rate drawn from too few signals", () => {
    // 100% of three occurrences is noise wearing a percentage.
    const c = scoreCandidate(candidate({ backtest: stats({ count: 3, hitRate: 100 }) }));
    expect(c.rejected).toMatch(/historical signals/);
    expect(c.conviction).toBe(0);
  });

  it("accepts a sample exactly at the floor", () => {
    const c = scoreCandidate(candidate({ backtest: stats({ count: MIN_BACKTEST_SAMPLE }) }));
    expect(c.rejected).toBeNull();
  });

  it("rejects a signal with no edge over holding", () => {
    const c = scoreCandidate(candidate({ backtest: stats({ avgReturn: 1.0, baselineAvgReturn: 1.4 }) }));
    expect(c.rejected).toMatch(/no edge/);
  });

  it("ranks a quiet setup above an identical crowded one", () => {
    // The whole "overlooked" premise, in one assertion.
    const quiet = scoreCandidate(candidate({ volumeRatio: 1.0, trending: false }));
    const crowded = scoreCandidate(candidate({ volumeRatio: 8, trending: true }));
    expect(quiet.conviction).toBeGreaterThan(crowded.conviction);
  });

  it("explains itself", () => {
    const c = scoreCandidate(candidate());
    expect(c.why.join(" ")).toMatch(/68% of 60 past signals/);
    expect(c.why.join(" ")).toMatch(/vs 1.1% for holding/);
    expect(c.why.join(" ")).toMatch(/crowd has not arrived/);
  });

  it("does not let a sub-coin-flip hit rate score negative", () => {
    const c = scoreCandidate(candidate({ backtest: stats({ hitRate: 20 }) }));
    expect(c.conviction).toBeGreaterThanOrEqual(0);
  });
});

describe("selectPicks", () => {
  it("returns the best first, capped at three", () => {
    const picks = selectPicks([
      candidate({ symbol: "A", backtest: stats({ hitRate: 55 }) }),
      candidate({ symbol: "B", backtest: stats({ hitRate: 75 }) }),
      candidate({ symbol: "C", backtest: stats({ hitRate: 65 }) }),
      candidate({ symbol: "D", backtest: stats({ hitRate: 60 }) }),
    ]);
    expect(picks).toHaveLength(3);
    expect(picks[0].symbol).toBe("B");
  });

  it("returns fewer rather than padding the list", () => {
    // Three is a ceiling, not a quota. A day with one trustworthy setup should
    // show one — filling the rest with rejects defeats the point.
    const picks = selectPicks([
      candidate({ symbol: "GOOD" }),
      candidate({ symbol: "THIN", backtest: stats({ count: 4 }) }),
      candidate({ symbol: "NOEDGE", backtest: stats({ avgReturn: 0.5, baselineAvgReturn: 2.0 }) }),
    ]);
    expect(picks).toHaveLength(1);
    expect(picks[0].symbol).toBe("GOOD");
  });

  it("returns none when nothing clears the bar", () => {
    const picks = selectPicks([candidate({ backtest: stats({ count: 2 }) })]);
    expect(picks).toEqual([]);
  });
});

describe("gradePick", () => {
  it("counts a rise as right for a call and wrong for a put", () => {
    expect(gradePick("BUY", 100, 110)).toEqual({ returnPct: 10, correct: true });
    expect(gradePick("SELL", 100, 110)).toEqual({ returnPct: 10, correct: false });
  });

  it("counts a fall as right for a put", () => {
    // A put profits from a fall, so the sign that counts is inverted.
    expect(gradePick("SELL", 100, 90)).toEqual({ returnPct: -10, correct: true });
    expect(gradePick("BUY", 100, 90)).toEqual({ returnPct: -10, correct: false });
  });

  it("treats dead flat as not correct, in either direction", () => {
    expect(gradePick("BUY", 100, 100)!.correct).toBe(false);
    expect(gradePick("SELL", 100, 100)!.correct).toBe(false);
  });

  it("refuses to grade against a missing or nonsensical price", () => {
    expect(gradePick("BUY", 0, 110)).toBeNull();
    expect(gradePick("BUY", 100, 0)).toBeNull();
  });
});

describe("trackRecord", () => {
  it("reports the realised hit rate and average", () => {
    const r = trackRecord([
      { returnPct: 10, correct: true },
      { returnPct: -4, correct: false },
      { returnPct: 6, correct: true },
      { returnPct: 2, correct: true },
    ]);
    expect(r.count).toBe(4);
    expect(r.hitRate).toBe(75);
    expect(r.avgReturn).toBe(3.5);
  });

  it("reports nulls rather than a flattering zero when nothing is graded yet", () => {
    expect(trackRecord([])).toEqual({ count: 0, hitRate: null, avgReturn: null });
  });
});

describe("sliceForDate", () => {
  const universe = ["A", "B", "C", "D", "E", "F", "G"];

  it("is deterministic for a given date", () => {
    // A re-run on the same date must reconsider the same names, so it cannot
    // quietly produce a different answer than the morning's run.
    expect(sliceForDate(universe, "2026-10-27", 3)).toEqual(sliceForDate(universe, "2026-10-27", 3));
  });

  it("moves on to different names the next day", () => {
    const mon = sliceForDate(universe, "2026-10-26", 3);
    const tue = sliceForDate(universe, "2026-10-27", 3);
    expect(tue).not.toEqual(mon);
  });

  it("wraps around rather than running off the end", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      const date = `2026-11-${String(d).padStart(2, "0")}`;
      for (const s of sliceForDate(universe, date, 3)) seen.add(s);
    }
    // Every name gets looked at over a cycle — the point of rotating at all,
    // since a fixed slice would guarantee most of the universe was never once
    // examined.
    expect(seen.size).toBe(universe.length);
  });

  it("never asks for more than the universe holds", () => {
    expect(sliceForDate(["A", "B"], "2026-10-27", 5)).toHaveLength(2);
    expect(sliceForDate([], "2026-10-27", 5)).toEqual([]);
  });
});
