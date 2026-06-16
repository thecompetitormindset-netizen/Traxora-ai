import { describe, expect, it } from "vitest";
import { detectFVG, detectOrderBlocks, smartMoneyScore, type SmBaseInput } from "./smartMoney";

function baseInput(overrides: Partial<SmBaseInput> = {}): SmBaseInput {
  return {
    price: 100,
    previousClose: 99,
    open: 99.5,
    high: 101,
    low: 98,
    volume: 1_000_000,
    avgVolume: 1_000_000,
    high52w: 120,
    low52w: 80,
    changePercent: 1.0,
    ...overrides,
  };
}

describe("smartMoneyScore", () => {
  it("produces a strong BUY when trend, day move, volume and EMA all align bullish", () => {
    const result = smartMoneyScore(baseInput({ changePercent: 2.5 }), {
      trend5dPct: 9,
      emaAlignment: "bullish",
    });
    expect(result.signal).toBe("BUY");
    expect(result.confidence).toBe("High");
  });

  it("produces a strong SELL when trend, day move and EMA all align bearish", () => {
    const result = smartMoneyScore(baseInput({ changePercent: -2.5 }), {
      trend5dPct: -9,
      emaAlignment: "bearish",
    });
    expect(result.signal).toBe("SELL");
    expect(result.confidence).toBe("High");
  });

  it("vetoes to HOLD-territory when the 5-day trend and today's move disagree", () => {
    const result = smartMoneyScore(baseInput({ changePercent: 3 }), {
      trend5dPct: -9,
    });
    // trend says down, today says up hard -> conflict veto clamps score to small magnitude
    expect(Math.abs(result.score)).toBeLessThanOrEqual(2);
  });

  it("defaults to HOLD/Low confidence with no extras and a flat day", () => {
    const result = smartMoneyScore(baseInput({ changePercent: 0, open: 99, high: 99, low: 99 }));
    expect(result.signal).toBe("HOLD");
    expect(result.confidence).toBe("Low");
  });

  it("computes price zone, day range and pctPos from high/low/price", () => {
    const result = smartMoneyScore(baseInput({ price: 100, high: 101, low: 98 }));
    expect(result.dayH).toBe(101);
    expect(result.dayL).toBe(98);
    expect(result.daySpan).toBeCloseTo(3);
    expect(result.pctPos).toBeCloseTo(((100 - 98) / 3) * 100);
  });

  it("falls back to price for day high/low when they are null", () => {
    const result = smartMoneyScore(baseInput({ price: 50, high: null, low: null }));
    expect(result.dayH).toBe(50);
    expect(result.dayL).toBe(50);
    expect(result.pctPos).toBe(50);
  });

  it("computes volume ratio and flags high/low volume", () => {
    const high = smartMoneyScore(baseInput({ volume: 3_000_000, avgVolume: 1_000_000 }));
    expect(high.volRatio).toBeCloseTo(3);
    expect(high.highVol).toBe(true);

    const low = smartMoneyScore(baseInput({ volume: 200_000, avgVolume: 1_000_000 }));
    expect(low.volRatio).toBeCloseTo(0.2);
    expect(low.lowVol).toBe(true);
  });

  it("returns null volRatio when avgVolume is missing or zero", () => {
    const result = smartMoneyScore(baseInput({ avgVolume: 0 }));
    expect(result.volRatio).toBeNull();
  });

  it("computes yearPct from the 52-week range", () => {
    const result = smartMoneyScore(baseInput({ price: 100, high52w: 120, low52w: 80 }));
    expect(result.yearPct).toBeCloseTo(50);
  });

  it("passes through pre-computed order block and FVG labels without inventing its own", () => {
    const result = smartMoneyScore(baseInput(), {
      orderBlockLabel: "Bullish OB: $98.00–$99.00",
      fvgLabel: "Bullish FVG: $99.50–$100.50",
    });
    expect(result.orderBlock).toBe("Bullish OB: $98.00–$99.00");
    expect(result.fairValueGap).toBe("Bullish FVG: $99.50–$100.50");
  });

  it("generates a long OTE zone for a BUY signal and a short OTE zone for a SELL signal", () => {
    const buy = smartMoneyScore(baseInput({ changePercent: 2.5, high: 110, low: 90 }), {
      trend5dPct: 9,
    });
    expect(buy.signal).toBe("BUY");
    expect(buy.ote).toContain("Long OTE");

    const sell = smartMoneyScore(baseInput({ changePercent: -2.5, high: 110, low: 90 }), {
      trend5dPct: -9,
    });
    expect(sell.signal).toBe("SELL");
    expect(sell.ote).toContain("Short OTE");
  });
});

describe("detectOrderBlocks", () => {
  it("returns nulls when there are fewer than 4 bars", () => {
    const result = detectOrderBlocks([{ open: 1, high: 2, low: 0.5, close: 1.5 }]);
    expect(result.bullish).toBeNull();
    expect(result.bearish).toBeNull();
  });

  it("finds a bullish order block before an upside displacement", () => {
    const bars = [
      { open: 10, high: 10.5, low: 9.5, close: 10.2 },
      { open: 10.2, high: 10.3, low: 9.0, close: 9.2 }, // down-close candle (the OB)
      { open: 9.2, high: 10.6, low: 9.1, close: 10.5 }, // closes above OB high -> displacement
      { open: 10.5, high: 11, low: 10.4, close: 10.9 },
    ];
    const result = detectOrderBlocks(bars);
    expect(result.bullish).toContain("Bullish OB");
  });

  it("finds a bearish order block before a downside displacement", () => {
    const bars = [
      { open: 10, high: 10.5, low: 9.5, close: 9.7 },
      { open: 9.7, high: 10.8, low: 9.6, close: 10.6 }, // up-close candle (the OB)
      { open: 10.6, high: 10.7, low: 9.4, close: 9.5 }, // closes below OB low -> displacement
      { open: 9.5, high: 9.6, low: 9.0, close: 9.1 },
    ];
    const result = detectOrderBlocks(bars);
    expect(result.bearish).toContain("Bearish OB");
  });
});

describe("detectFVG", () => {
  it("returns null when there are fewer than 3 bars", () => {
    expect(detectFVG([{ high: 1, low: 0.5 }], 0.7)).toBeNull();
  });

  it("detects an unmitigated bullish FVG when price is outside the gap", () => {
    const bars = [
      { high: 10, low: 9 },
      { high: 10.5, low: 10.1 },
      { high: 12, low: 11 }, // gap: 10 (b0.high) -> 11 (b2.low)
    ];
    const result = detectFVG(bars, 13); // price above the gap
    expect(result).toContain("Bullish FVG");
  });

  it("detects an unmitigated bearish FVG when price is outside the gap", () => {
    const bars = [
      { high: 10, low: 9 },
      { high: 8.9, low: 8.5 },
      { high: 8, low: 7 }, // gap: 7 (b2.high) -> 9 (b0.low)... wait check direction
    ];
    const result = detectFVG(bars, 6); // price below the gap
    expect(result).toContain("Bearish FVG");
  });

  it("returns null when price has already traded into the only gap", () => {
    const bars = [
      { high: 10, low: 9 },
      { high: 10.5, low: 10.1 },
      { high: 12, low: 11 },
    ];
    const result = detectFVG(bars, 10.5); // price inside the 10-11 gap
    expect(result).toBeNull();
  });
});
