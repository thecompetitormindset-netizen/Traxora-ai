import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_DAILY_PCT,
  changePctOrZero,
  checkQuoteSanity,
  computeChangePct,
  resolvePreviousClose,
} from "../quoteSanity";

// The OXY incident. The options scan requests range=1y, so Yahoo's
// meta.chartPreviousClose is the close preceding the start of that year-long
// window (~$44.15) rather than the previous session ($58.33). The old
// `previousClose ?? chartPreviousClose ?? price` chain fell through to it
// whenever previousClose was absent, rendering a year's move as one day's.
const OXY_PRICE             = 58.55;
const OXY_PREV_SESSION      = 58.33;
const OXY_CHART_PREV_1Y_AGO = 44.15;

describe("resolvePreviousClose", () => {
  it("uses the previous session close, not the year-ago chart close", () => {
    const closes = [44.15, 51.2, 55.8, OXY_PREV_SESSION, OXY_PRICE];
    // meta.previousClose absent — the exact case that fell through before.
    const prev = resolvePreviousClose({ chartPreviousClose: OXY_CHART_PREV_1Y_AGO }, closes);

    expect(prev).toBe(OXY_PREV_SESSION);
    expect(prev).not.toBe(OXY_CHART_PREV_1Y_AGO);
    expect(computeChangePct(OXY_PRICE, prev)!).toBeLessThan(1);
  });

  it("documents what the old fallback chain produced", () => {
    const bogus = computeChangePct(OXY_PRICE, OXY_CHART_PREV_1Y_AGO)!;
    expect(bogus).toBeCloseTo(32.62, 1);
    expect(bogus).toBeGreaterThan(MAX_PLAUSIBLE_DAILY_PCT);
  });

  it("prefers meta.previousClose when it agrees with the series", () => {
    expect(resolvePreviousClose({ previousClose: 58.34 }, [57.9, OXY_PREV_SESSION, OXY_PRICE]))
      .toBe(58.34);
  });

  it("falls back to the series when meta is on a different basis (split mismatch)", () => {
    // An unadjusted pre-split close against an adjusted series.
    expect(resolvePreviousClose({ previousClose: 233.32 }, [57.9, OXY_PREV_SESSION, OXY_PRICE]))
      .toBe(OXY_PREV_SESSION);
  });

  it("ignores nulls in the series, as untraded bars arrive null", () => {
    expect(resolvePreviousClose(null, [10, null, 20, null, 30])).toBe(20);
    expect(resolvePreviousClose(null, [null, undefined, 42, 43])).toBe(42);
  });

  it("ignores non-positive and missing values", () => {
    expect(resolvePreviousClose({ previousClose: 0 }, [10, 20])).toBe(10);
    expect(resolvePreviousClose({ previousClose: -5 }, [10, 20])).toBe(10);
    expect(resolvePreviousClose(null, [])).toBeNull();
    expect(resolvePreviousClose(null, [42])).toBeNull();
    // chartPreviousClose is never a source, even as the only field present.
    expect(resolvePreviousClose({ chartPreviousClose: 44 }, [])).toBeNull();
  });

  it("defaults the series argument so meta-only callers still work", () => {
    expect(resolvePreviousClose({ previousClose: 58.33 })).toBe(58.33);
  });
});

describe("computeChangePct / changePctOrZero", () => {
  it("computes the corrected OXY move", () => {
    expect(computeChangePct(58.64, 58.33)!).toBeCloseTo(0.53, 1);
  });

  it("returns null on unusable input, and zero from the display variant", () => {
    expect(computeChangePct(58.64, null)).toBeNull();
    expect(computeChangePct(0, 58.33)).toBeNull();
    expect(computeChangePct(58.64, 0)).toBeNull();
    expect(changePctOrZero(58.64, null)).toBe(0);
    expect(changePctOrZero(58.64, 58.33)).toBeCloseTo(0.53, 1);
  });
});

describe("checkQuoteSanity", () => {
  it("accepts the corrected OXY quote", () => {
    const r = checkQuoteSanity({ symbol: "OXY", price: 58.64, previousClose: 58.33 });
    expect(r.ok).toBe(true);
    expect(r.changePct).toBeCloseTo(0.53, 1);
  });

  it("rejects and explains the implausible move so it never reaches a ranking", () => {
    const r = checkQuoteSanity({ symbol: "OXY", price: OXY_PRICE, previousClose: OXY_CHART_PREV_1Y_AGO });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/implausible/i);
    expect(r.reason).toMatch(/OXY/);
    expect(r.reason).toMatch(/previous close/i);
  });

  it("does not gate small caps on magnitude", () => {
    expect(checkQuoteSanity({ symbol: "TINY", price: 3, previousClose: 2, isLargeCap: false }).ok).toBe(true);
    expect(checkQuoteSanity({ symbol: "TINY", price: 3, previousClose: 2, isLargeCap: true }).ok).toBe(false);
  });

  it("rejects unusable inputs", () => {
    expect(checkQuoteSanity({ symbol: "X", price: 10, previousClose: null }).ok).toBe(false);
    expect(checkQuoteSanity({ symbol: "X", price: 0, previousClose: 10 }).ok).toBe(false);
    expect(checkQuoteSanity({ symbol: "X", price: NaN, previousClose: 10 }).ok).toBe(false);
  });

  it("allows a move at the gate but not past it, in both directions", () => {
    expect(checkQuoteSanity({ symbol: "X", price: 120, previousClose: 100 }).ok).toBe(true);
    expect(checkQuoteSanity({ symbol: "X", price: 120.5, previousClose: 100 }).ok).toBe(false);
    expect(checkQuoteSanity({ symbol: "X", price: 80, previousClose: 100 }).ok).toBe(true);
    expect(checkQuoteSanity({ symbol: "X", price: 79, previousClose: 100 }).ok).toBe(false);
  });
});

// Each fixed route requested a different range, so the size of the error it was
// exposed to differed. The resolver's contract is the same in every case:
// never return the window-start price.
describe("range-independence across the fixed routes", () => {
  const cases: { route: string; range: string; series: number[]; windowStart: number }[] = [
    { route: "market/options-scan",  range: "1y",  series: [44.15, 55.0, 58.33, 58.55], windowStart: 44.15 },
    { route: "ai/position-insight",  range: "30d", series: [52.10, 57.0, 58.33, 58.55], windowStart: 52.10 },
    { route: "market/scan",          range: "10d", series: [56.80, 57.9, 58.33, 58.55], windowStart: 56.80 },
    { route: "ai/briefing",          range: "10d", series: [56.80, 57.9, 58.33, 58.55], windowStart: 56.80 },
    { route: "sentiment",            range: "6d",  series: [57.20, 58.0, 58.33, 58.55], windowStart: 57.20 },
    { route: "market/value-scan",    range: "2d",  series: [58.01, 58.33, 58.55],       windowStart: 58.01 },
  ];

  for (const { route, range, series, windowStart } of cases) {
    it(`${route} (range=${range}) resolves the prior session, not the window start`, () => {
      const prev = resolvePreviousClose({ chartPreviousClose: windowStart }, series);
      expect(prev).toBe(OXY_PREV_SESSION);
      expect(prev).not.toBe(windowStart);
    });
  }
});
