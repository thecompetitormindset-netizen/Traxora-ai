import { describe, expect, it } from "vitest";
import { isTradingDay, tradingDaysElapsed } from "../tradingDays";

// A pick is graded after a fixed number of SESSIONS. Counting calendar days and
// labelling them sessions would put every pick's progress ahead of where it is
// and show it as overdue days before it was.

describe("isTradingDay", () => {
  it("accepts an ordinary weekday", () => {
    expect(isTradingDay("2026-10-29")).toBe(true); // Thursday
  });

  it("rejects weekends", () => {
    expect(isTradingDay("2026-10-31")).toBe(false); // Saturday
    expect(isTradingDay("2026-11-01")).toBe(false); // Sunday
  });

  it("rejects an exchange holiday", () => {
    // Christmas Day 2026 is a Friday, so the weekend check alone would pass it.
    expect(isTradingDay("2026-12-25")).toBe(false);
  });

  it("rejects something that is not a date", () => {
    expect(isTradingDay("not-a-date")).toBe(false);
    expect(isTradingDay("")).toBe(false);
  });
});

describe("tradingDaysElapsed", () => {
  it("does not count the entry day itself", () => {
    // A pick taken at Monday's close has had no session yet; its first is
    // Tuesday. Counting the entry day would report every pick a day further on
    // than the grader does.
    expect(tradingDaysElapsed("2026-10-26", "2026-10-26")).toBe(0);
    expect(tradingDaysElapsed("2026-10-26", "2026-10-27")).toBe(1);
  });

  it("skips the weekend", () => {
    // Friday to the following Monday is one session, not three.
    expect(tradingDaysElapsed("2026-10-30", "2026-11-02")).toBe(1);
  });

  it("skips a holiday inside the range", () => {
    // Thanksgiving 2026 falls on Thursday 26 November. Wednesday to Friday is
    // one session, not two.
    expect(tradingDaysElapsed("2026-11-25", "2026-11-27")).toBe(1);
  });

  it("counts a fortnight the way the grader does", () => {
    // Fourteen sessions from 1 October 2026 reaches 21 October — nearly three
    // weeks of calendar time, which is the whole reason for this function.
    expect(tradingDaysElapsed("2026-10-01", "2026-10-21")).toBe(14);
    expect(tradingDaysElapsed("2026-10-01", "2026-10-15")).toBeLessThan(14);
  });

  it("returns null rather than zero for a range running backwards", () => {
    // "0 of 14 sessions" about a pick entered weeks ago states something false.
    // Null can be left off the screen.
    expect(tradingDaysElapsed("2026-10-29", "2026-10-01")).toBeNull();
  });

  it("returns null for dates it cannot read", () => {
    expect(tradingDaysElapsed("yesterday", "2026-10-29")).toBeNull();
    expect(tradingDaysElapsed("2026-10-29", "")).toBeNull();
  });

  it("refuses an implausibly long range instead of scanning it", () => {
    expect(tradingDaysElapsed("1990-01-01", "2026-10-29")).toBeNull();
  });
});
