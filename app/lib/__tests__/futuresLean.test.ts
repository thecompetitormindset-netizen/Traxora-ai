import { describe, expect, it } from "vitest";
import { INSTRUMENT_BAR, leanFromScore, leanWords, strengthLabel } from "../futuresLean";

// Every futures market read "no call" every day. The scorer's HOLD band runs
// from -3 to +3 and was calibrated on individual stocks; a broad fund moves far
// less and lives inside it. The signal was not absent, it was being rounded
// away — so the lean is now always reported, with its strength beside it.

describe("leanFromScore", () => {
  it("takes the direction from the sign, however slight", () => {
    // The whole point: 0.4 still points somewhere, and a reader can act on
    // "mildly up" where they cannot act on silence.
    expect(leanFromScore(0.4).direction).toBe("BUY");
    expect(leanFromScore(-0.4).direction).toBe("SELL");
  });

  it("points nowhere only when the score is exactly flat", () => {
    // Not nudged one way to avoid an awkward blank.
    expect(leanFromScore(0).direction).toBeNull();
    expect(leanWords(leanFromScore(0))).toBe("No tilt either way");
  });

  it("reports strength so a weak lean cannot read as a call", () => {
    expect(leanFromScore(0.4).label).toBe("very weak");
    expect(leanFromScore(2.1).label).toBe("mild");
    expect(leanFromScore(-4).label).toBe("moderate");
    expect(leanFromScore(8).label).toBe("strong");
  });

  it("caps strength at the scale it is presented on", () => {
    // The card says "of 10", so nothing may come back as 14 of 10.
    expect(leanFromScore(14).strength).toBe(10);
    expect(leanFromScore(-99).strength).toBe(10);
  });

  it("holds a fund to a lower bar than a stock, because it moves less", () => {
    // The threshold tracks the instrument's volatility, which is what it was
    // always meant to do — the standard did not slip.
    expect(INSTRUMENT_BAR.fund).toBeLessThan(INSTRUMENT_BAR.stock);
    expect(leanFromScore(2, "fund").clearsBar).toBe(true);
    expect(leanFromScore(2, "stock").clearsBar).toBe(false);
  });

  it("still refuses to call a genuinely tiny lean, on either instrument", () => {
    expect(leanFromScore(0.4, "fund").clearsBar).toBe(false);
    expect(leanFromScore(-0.9, "fund").clearsBar).toBe(false);
  });

  it("words the direction the way the card reads it", () => {
    expect(leanWords(leanFromScore(3))).toBe("Leaning up");
    expect(leanWords(leanFromScore(-3))).toBe("Leaning down");
  });

  it("labels the boundaries the same way whichever side they come from", () => {
    expect(strengthLabel(1.5)).toBe("mild");
    expect(strengthLabel(3)).toBe("moderate");
    expect(strengthLabel(5)).toBe("strong");
    expect(leanFromScore(-3).label).toBe(leanFromScore(3).label);
  });
});
