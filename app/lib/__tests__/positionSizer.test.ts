import { describe, expect, it } from "vitest";
import { describeSize, riskPerUnitFor, sizePosition } from "../positionSizer";

// Bug 2 — the sizer compared full option premium against the risk budget.
// The OXY card: delta 0.49, entry 58.35, stop 58.20, premium $159/contract.
const OXY = {
  instrument: "option" as const,
  entry: 58.35,
  stop: 58.20,
  delta: 0.49,
  premiumPerContract: 159,
};

describe("riskPerUnitFor", () => {
  it("uses delta-adjusted stop distance for options, not the premium", () => {
    // 0.49 × 0.15 × 100 = 7.35 — not the $159 premium.
    expect(riskPerUnitFor({ ...OXY, accountSize: 1000, riskPct: 1 })).toBeCloseTo(7.35, 2);
  });

  it("uses the stop distance itself for equities", () => {
    expect(riskPerUnitFor({ instrument: "equity", entry: 58.35, stop: 58.20, accountSize: 5000, riskPct: 1 }))
      .toBeCloseTo(0.15, 4);
  });

  it("never exceeds the premium — a long option cannot lose more than it cost", () => {
    // A stop 10 points away would imply $490 of delta risk on a $159 contract.
    const risk = riskPerUnitFor({ ...OXY, stop: 48.35, accountSize: 10_000, riskPct: 1 });
    expect(risk).toBe(159);
  });

  it("returns null without a stop distance or a delta", () => {
    expect(riskPerUnitFor({ ...OXY, stop: 58.35, accountSize: 1000, riskPct: 1 })).toBeNull();
    expect(riskPerUnitFor({ ...OXY, delta: null, accountSize: 1000, riskPct: 1 })).toBeNull();
  });
});

describe("sizePosition — risk basis", () => {
  it("clears the risk cap for 1 contract at ~$735, not the ~$15,900 the premium basis demanded", () => {
    const at735 = sizePosition({ ...OXY, accountSize: 735, riskPct: 1 })!;
    expect(at735.riskPerUnit).toBeCloseTo(7.35, 2);
    expect(at735.riskCapUnits).toBe(1);

    // The old code compared the $159 premium against the risk budget, so it
    // demanded 159/0.01 = $15,900 to clear the risk cap for the same contract —
    // a 21.6x overstatement of what the trade actually risks.
    expect(OXY.premiumPerContract / at735.riskPerUnit).toBeCloseTo(21.6, 1);
    expect(sizePosition({ ...OXY, accountSize: 15_900, riskPct: 1 })!.riskCapUnits).toBe(21);

    const justUnder = sizePosition({ ...OXY, accountSize: 700, riskPct: 1 })!;
    expect(justUnder.riskCapUnits).toBe(0);
    expect(justUnder.minAccountForOne).toBeCloseTo(735, 0);
  });

  it("still withholds the trade at $735 because premium concentration binds", () => {
    // Risk allows one contract, but $159 of premium is 21.6% of a $735 account,
    // over the 10% default. The three caps are independent and the tightest wins.
    const at735 = sizePosition({ ...OXY, accountSize: 735, riskPct: 1 })!;
    expect(at735.units).toBe(0);
    expect(at735.binding).toBe("premium");
    // $1,590 puts the same contract inside the 10% premium limit.
    expect(at735.minAccountForOne).toBeCloseTo(1_590, 0);
    expect(sizePosition({ ...OXY, accountSize: 1_590, riskPct: 1 })!.units).toBe(1);
  });

  it("reports the account actually needed rather than declaring it untradeable", () => {
    const tiny = sizePosition({ ...OXY, accountSize: 50, riskPct: 1 })!;
    expect(tiny.units).toBe(0);
    expect(tiny.tooSmall).toBe(true);
    expect(tiny.binding).toBe("risk");
    expect(describeSize(tiny, 1).text).toMatch(/\$735/);
  });
});

describe("sizePosition — minimum of the three constraints", () => {
  it("returns the risk cap when risk is tightest", () => {
    const r = sizePosition({ ...OXY, accountSize: 5_000, riskPct: 1 })!;
    // risk 50/7.35 = 6 · notional 5000/159 = 31 · premium 500/159 = 3
    expect(r.premiumCapUnits).toBe(3);
    expect(r.units).toBe(3);
    expect(r.binding).toBe("premium");
    expect(r.bindingLabel).toBe("Capped by premium limit");
  });

  it("returns the premium cap when premium concentration is tightest", () => {
    const r = sizePosition({ ...OXY, accountSize: 10_000, riskPct: 1 })!;
    expect(r.riskCapUnits).toBe(13);      // 100 / 7.35
    expect(r.notionalCapUnits).toBe(62);  // 10000 / 159
    expect(r.premiumCapUnits).toBe(6);    // 1000 / 159
    expect(r.units).toBe(6);
    expect(r.binding).toBe("premium");
  });

  it("returns the notional cap when a tight stop generates unaffordable share counts", () => {
    // The spec's example: 1% of $5,000 with a $0.15 stop is 333 shares (~$19k).
    const r = sizePosition({ instrument: "equity", accountSize: 5_000, riskPct: 1, entry: 58.35, stop: 58.20 })!;
    expect(r.riskCapUnits).toBe(333);
    expect(r.notionalCapUnits).toBe(85);  // 5000 / 58.35
    expect(r.units).toBe(85);
    expect(r.binding).toBe("notional");
    expect(r.bindingLabel).toBe("Capped by buying power");
    expect(r.totalCost).toBeLessThanOrEqual(5_000);
  });

  it("respects a buying power lower than the account size", () => {
    const r = sizePosition({
      instrument: "equity", accountSize: 5_000, riskPct: 1, entry: 58.35, stop: 58.20, buyingPower: 1_000,
    })!;
    expect(r.units).toBe(17);
    expect(r.binding).toBe("notional");
  });

  it("honours a configured premium percentage", () => {
    const loose = sizePosition({ ...OXY, accountSize: 10_000, riskPct: 1, maxPremiumPct: 25 })!;
    // premium cap 2500/159 = 15, so the risk cap of 13 now binds
    expect(loose.units).toBe(13);
    expect(loose.binding).toBe("risk");
  });

  it("never returns more units than any single cap allows", () => {
    for (const account of [500, 1_000, 7_500, 25_000, 100_000]) {
      const r = sizePosition({ ...OXY, accountSize: account, riskPct: 1 })!;
      expect(r.units).toBeLessThanOrEqual(r.riskCapUnits);
      expect(r.units).toBeLessThanOrEqual(r.notionalCapUnits);
      expect(r.units).toBeLessThanOrEqual(r.premiumCapUnits);
      expect(r.actualRiskDollars).toBeLessThanOrEqual(r.maxRiskDollars + 1e-9);
    }
  });

  it("returns null on inputs that cannot support a decision", () => {
    expect(sizePosition({ ...OXY, accountSize: 0, riskPct: 1 })).toBeNull();
    expect(sizePosition({ ...OXY, accountSize: 1_000, riskPct: 0 })).toBeNull();
    expect(sizePosition({ ...OXY, accountSize: 1_000, riskPct: 1, premiumPerContract: null })).toBeNull();
  });
});

describe("describeSize", () => {
  it("names the binding constraint instead of showing a bare warning", () => {
    const d = describeSize(sizePosition({ ...OXY, accountSize: 10_000, riskPct: 1 })!, 1);
    expect(d.tone).toBe("ok");
    expect(d.text).toMatch(/Capped by premium limit/);
    expect(d.text).toMatch(/6 contracts/);
  });

  it("explains what is needed when nothing can be sized", () => {
    const d = describeSize(sizePosition({ ...OXY, accountSize: 50, riskPct: 1 })!, 1);
    expect(d.tone).toBe("warn");
    expect(d.text).toMatch(/needs ~\$735/);
  });
});
