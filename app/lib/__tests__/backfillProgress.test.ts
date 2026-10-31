import { describe, it, expect } from "vitest";
import { refusalMeans, datesRemaining } from "../backfillProgress";

describe("what a 403 on one date means", () => {
  it("is about the date once the key has served anything at all", () => {
    // The real case: 49 dates written, then the clock passed midnight UTC.
    expect(refusalMeans({ storedDates: 196, writtenThisRun: 36 })).toBe("this_date");
  });

  it("is about the date on the evidence of stored history alone", () => {
    // A fresh run that has written nothing yet still inherits the proof that
    // earlier runs were served.
    expect(refusalMeans({ storedDates: 160, writtenThisRun: 0 })).toBe("this_date");
  });

  it("is about the date on the evidence of this run alone", () => {
    // An empty table at the start of the run, but one success since.
    expect(refusalMeans({ storedDates: 0, writtenThisRun: 1 })).toBe("this_date");
  });

  it("may be the plan only when nothing has ever come back", () => {
    expect(refusalMeans({ storedDates: 0, writtenThisRun: 0 })).toBe("possibly_the_plan");
  });

  it("never reads a single refusal as proof about the plan", () => {
    // The distinction that matters: with any evidence of service, the one
    // conclusion that cannot be drawn is the one the old code drew.
    for (const stored of [1, 10, 196]) {
      expect(refusalMeans({ storedDates: stored, writtenThisRun: 0 })).not.toBe("possibly_the_plan");
    }
  });
});

describe("how much work is left", () => {
  it("counts dates that are missing and fetchable", () => {
    expect(datesRemaining({ missing: 116, written: 4, unavailable: 0 })).toBe(112);
  });

  it("does not count a date the provider will not serve", () => {
    // Otherwise a finished backfill reports itself unfinished forever and the
    // operator keeps re-running for a date that will never arrive this way.
    expect(datesRemaining({ missing: 1, written: 0, unavailable: 1 })).toBe(0);
  });

  it("reaches zero when the only thing left is unavailable", () => {
    expect(datesRemaining({ missing: 3, written: 2, unavailable: 1 })).toBe(0);
  });

  it("never goes negative, whatever the inputs", () => {
    // The symptom that started all of this was a count that moved the wrong
    // way; a negative here would read as nonsense in the log.
    expect(datesRemaining({ missing: 0, written: 4, unavailable: 2 })).toBe(0);
    expect(datesRemaining({ missing: 2, written: 10, unavailable: 0 })).toBe(0);
  });

  it("is unchanged by unavailable dates when real work remains", () => {
    expect(datesRemaining({ missing: 80, written: 3, unavailable: 1 })).toBe(76);
  });
});
