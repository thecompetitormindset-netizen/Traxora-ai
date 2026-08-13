import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_DAILY_PCT,
  checkQuoteSanity,
  computeChangePct,
  resolvePreviousClose,
} from "../quoteSanity";

// Bug 1 — the OXY incident of 2026-08-12.
// The scan requests range=1y, so Yahoo's meta.chartPreviousClose is the close
// preceding the start of that year-long window (~$44.15), not the previous
// session ($58.33). The old `previousClose ?? chartPreviousClose ?? price`
// chain fell through to it whenever previousClose was absent, rendering a
// year-to-date move as a one-day move.
const OXY_PRICE            = 58.55;
const OXY_PREV_SESSION     = 58.33;
const OXY_CHART_PREV_1Y_AGO = 44.15;

describe("resolvePreviousClose", () => {
  it("uses the previous session close, not the year-ago chart close (the OXY bug)", () => {
    const closes = [44.15, 51.2, 55.8, OXY_PREV_SESSION, OXY_PRICE];
    // meta.previousClose absent — exactly the case that used to fall through
    // to chartPreviousClose.
    const meta = { chartPreviousClose: OXY_CHART_PREV_1Y_AGO };

    const prev = resolvePreviousClose(meta, closes);

    expect(prev).toBe(OXY_PREV_SESSION);
    expect(prev).not.toBe(OXY_CHART_PREV_1Y_AGO);

    const pct = computeChangePct(OXY_PRICE, prev)!;
    expect(pct).toBeCloseTo(0.38, 1);
    // The regression this test exists to catch.
    expect(pct).toBeLessThan(1);
  });

  it("the old fallback chain would have produced the +32.62% render", () => {
    // Documents the defect: this is what the removed code computed.
    const bogus = computeChangePct(OXY_PRICE, OXY_CHART_PREV_1Y_AGO)!;
    expect(bogus).toBeCloseTo(32.62, 1);
    expect(bogus).toBeGreaterThan(MAX_PLAUSIBLE_DAILY_PCT);
  });

  it("prefers meta.previousClose when it agrees with the series", () => {
    expect(resolvePreviousClose({ previousClose: 58.34 }, [57.9, OXY_PREV_SESSION, OXY_PRICE])).toBe(58.34);
  });

  it("falls back to the series when meta is on a different basis (split mismatch)", () => {
    // Unadjusted pre-split close against an adjusted series.
    expect(resolvePreviousClose({ previousClose: 233.32 }, [57.9, OXY_PREV_SESSION, OXY_PRICE]))
      .toBe(OXY_PREV_SESSION);
  });

  it("ignores non-positive and missing values", () => {
    expect(resolvePreviousClose({ previousClose: 0 }, [10, 20])).toBe(10);
    expect(resolvePreviousClose(null, [])).toBeNull();
    expect(resolvePreviousClose({ chartPreviousClose: 44 }, [])).toBeNull();
  });
});

describe("checkQuoteSanity", () => {
  it("accepts the corrected OXY quote", () => {
    const r = checkQuoteSanity({ symbol: "OXY", price: 58.64, previousClose: 58.33 });
    expect(r.ok).toBe(true);
    expect(r.changePct).toBeCloseTo(0.53, 1);
  });

  it("rejects and explains the implausible move so it never reaches a card", () => {
    const r = checkQuoteSanity({ symbol: "OXY", price: OXY_PRICE, previousClose: OXY_CHART_PREV_1Y_AGO });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/implausible/i);
    expect(r.reason).toMatch(/OXY/);
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

  it("allows a move right at the gate but not past it", () => {
    expect(checkQuoteSanity({ symbol: "X", price: 120, previousClose: 100 }).ok).toBe(true);
    expect(checkQuoteSanity({ symbol: "X", price: 120.5, previousClose: 100 }).ok).toBe(false);
    expect(checkQuoteSanity({ symbol: "X", price: 79, previousClose: 100 }).ok).toBe(false);
  });
});
