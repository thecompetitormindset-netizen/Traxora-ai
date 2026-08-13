import { describe, expect, it } from "vitest";
import {
  DEGRADED_OPTION_RR,
  computeOptionRR,
  holdingDaysFor,
  spreadCostFor,
  thetaPerDayFor,
} from "../optionsRR";

// Bug 3 — the card showed the STOCK leg's ratio next to an options contract.
// OXY: entry 58.35, stop 58.20, target 58.85, $59 call at 23 DTE, delta 0.49,
// premium $159, IV 29.3% (≈ $1.08 expected daily move on a $58.35 underlying).
const OXY = {
  entry: 58.35,
  stop: 58.20,
  target: 58.85,
  delta: 0.49,
  dte: 23,
  premiumPerContract: 159,
  bid: 1.57,
  ask: 1.61,
  expectedDailyMove: 1.08,
};

describe("thetaPerDayFor", () => {
  it("prefers the chain's theta, scaled to a contract", () => {
    expect(thetaPerDayFor(-0.035, 159, 23)).toBeCloseTo(3.5, 2);
  });

  it("falls back to the ATM approximation of premium over 2x DTE", () => {
    // ~$3.46/day, matching the observed $3-4/contract/day at 29.3% IV and 23 DTE.
    expect(thetaPerDayFor(null, 159, 23)).toBeCloseTo(3.46, 2);
  });

  it("is zero when there is no premium basis and no expiry", () => {
    expect(thetaPerDayFor(null, 159, 0)).toBe(0);
  });
});

describe("spreadCostFor", () => {
  it("charges the full spread once — entered at the ask, exited at the bid", () => {
    expect(spreadCostFor(1.57, 1.61, 159)).toBeCloseTo(4, 2);
  });

  it("assumes a spread when no market is quoted", () => {
    expect(spreadCostFor(null, null, 159)).toBeCloseTo(3.18, 2);
  });
});

describe("holdingDaysFor", () => {
  it("derives the hold from how long the underlying needs to reach target", () => {
    // 0.50 of travel at ~1.08/day is under one session.
    expect(holdingDaysFor(0.5, 1.08, 23)).toBe(1);
    expect(holdingDaysFor(3.2, 1.08, 23)).toBe(3);
  });

  it("never exceeds expiry", () => {
    expect(holdingDaysFor(50, 1.08, 5)).toBe(5);
  });
});

describe("computeOptionRR", () => {
  const rr = computeOptionRR(OXY)!;

  it("computes the stock leg at the ratio the card used to display", () => {
    expect(rr.equityRisk).toBeCloseTo(15, 2);    // 0.15 × 100
    expect(rr.equityReward).toBeCloseTo(50, 2);  // 0.50 × 100
    expect(rr.equityRR).toBeCloseTo(3.33, 2);
  });

  it("computes the contract's own ratio, which is materially worse", () => {
    // Delta capture: risk 0.49 × 0.15 × 100 = $7.35, reward 0.49 × 0.50 × 100 = $24.50.
    // Friction: ~$3.46 theta for a one-day hold plus $4.00 spread.
    expect(rr.thetaCost).toBeCloseTo(3.46, 1);
    expect(rr.spreadCost).toBeCloseTo(4, 2);
    expect(rr.optionRisk).toBeCloseTo(14.81, 1);
    expect(rr.optionReward).toBeCloseTo(17.04, 1);
    expect(rr.optionRR).toBeCloseTo(1.15, 1);

    // The headline defect: the contract's ratio is nothing like the stock's.
    expect(rr.optionRR).toBeLessThan(rr.equityRR / 2);
  });

  it("recommends the shares when friction has eaten the option's edge", () => {
    expect(rr.optionRR).toBeLessThan(DEGRADED_OPTION_RR);
    expect(rr.equityRR).toBeGreaterThanOrEqual(DEGRADED_OPTION_RR);
    expect(rr.degraded).toBe(true);
    expect(rr.recommendShares).toBe(true);
  });

  it("leaves a genuinely good contract alone", () => {
    // A wider target with a longer-dated, tighter-spread contract.
    const good = computeOptionRR({
      ...OXY, target: 62.0, dte: 60, delta: 0.55, bid: 2.50, ask: 2.55, premiumPerContract: 252,
    })!;
    expect(good.optionRR).toBeGreaterThan(DEGRADED_OPTION_RR);
    expect(good.degraded).toBe(false);
    expect(good.recommendShares).toBe(false);
  });

  it("does not recommend shares when the stock leg is no better", () => {
    // Target barely beyond the stop — both legs are poor.
    const bad = computeOptionRR({ ...OXY, target: 58.45 })!;
    expect(bad.degraded).toBe(true);
    expect(bad.equityRR).toBeLessThan(DEGRADED_OPTION_RR);
    expect(bad.recommendShares).toBe(false);
  });

  it("charges friction on both sides — it lowers reward and raises risk", () => {
    const frictionless = computeOptionRR({ ...OXY, bid: null, ask: null, theta: 0, premiumPerContract: 159 })!;
    expect(rr.optionReward).toBeLessThan(0.49 * 0.5 * 100);
    expect(rr.optionRisk).toBeGreaterThan(0.49 * 0.15 * 100);
    expect(rr.optionRR).toBeLessThan(frictionless.equityRR);
  });

  it("caps risk at the premium — a long option cannot lose more than it cost", () => {
    const wide = computeOptionRR({ ...OXY, stop: 40 })!;
    expect(wide.optionRisk).toBe(159);
  });

  it("floors reward at zero when friction exceeds the delta capture", () => {
    const doomed = computeOptionRR({ ...OXY, target: 58.36, dte: 2, bid: 0.10, ask: 0.60 })!;
    expect(doomed.optionReward).toBe(0);
    expect(doomed.optionRR).toBe(0);
  });

  it("returns null on malformed setups", () => {
    expect(computeOptionRR({ ...OXY, stop: OXY.entry })).toBeNull();
    expect(computeOptionRR({ ...OXY, delta: 0 })).toBeNull();
    expect(computeOptionRR({ ...OXY, premiumPerContract: 0 })).toBeNull();
  });
});
