import { describe, expect, it } from "vitest";
import { mergeFullQuote } from "../marketQuote";

// The routes that feed smartMoneyScore were substituting values for fields the
// scorer is written to receive as null:
//
//   avgVolume ?? volume      → a volume ratio of exactly 1.0
//   fiftyTwoWeekHigh ?? price → the 52-week range collapsed onto the price
//   regularMarketDayHigh ?? price → a day range of zero
//
// Each reads downstream as a real, unremarkable measurement. These pin that a
// field nobody supplied stays absent.

type Chart = Parameters<typeof mergeFullQuote>[2];

const chart = (
  meta: Record<string, number | string> = {},
  quote: { close?: (number | null)[]; volume?: (number | null)[]; open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[] } = {},
): Chart => ({ meta, indicators: { quote: [quote] } }) as Chart;

const fh = { price: 110, previousClose: 100, open: 101, high: 112, low: 99 };

describe("mergeFullQuote — absent stays absent", () => {
  it("leaves avgVolume null rather than reusing today's volume", () => {
    // The old `avgVolume ?? volume` produced a ratio of exactly 1.0, which
    // reads as "perfectly average volume" rather than "unknown".
    const q = mergeFullQuote("AAPL", fh, chart({ regularMarketVolume: 5_000_000 }, {}))!;
    expect(q.volume).toBe(5_000_000);
    expect(q.avgVolume).toBeNull();
    expect(q.enriched).toBe(false);
  });

  it("leaves the 52-week bounds null rather than collapsing them onto the price", () => {
    const q = mergeFullQuote("AAPL", fh, chart({}, {}))!;
    expect(q.high52w).toBeNull();
    expect(q.low52w).toBeNull();
  });

  it("leaves the day range null rather than flattening it to the price", () => {
    const q = mergeFullQuote("AAPL", null, chart({ regularMarketPrice: 100 }, {}))!;
    expect(q.high).toBeNull();
    expect(q.low).toBeNull();
  });

  it("treats a zero or negative field as absent", () => {
    const q = mergeFullQuote("AAPL", fh, chart({ fiftyTwoWeekHigh: 0, regularMarketVolume: 0 }, {}))!;
    expect(q.high52w).toBeNull();
    expect(q.volume).toBeNull();
  });
});

describe("mergeFullQuote — averaging", () => {
  it("computes an average only from enough history", () => {
    const volumes = [1_000_000, 1_200_000, 900_000, 1_100_000, 1_300_000];
    const q = mergeFullQuote("AAPL", fh, chart({}, { volume: volumes }))!;
    expect(q.avgVolume).toBe(1_100_000);
    expect(q.volume).toBe(1_300_000);
    expect(q.enriched).toBe(true);
  });

  it("refuses to average four bars, and does not fall back to today's volume", () => {
    const q = mergeFullQuote("AAPL", fh, chart({}, { volume: [1_000_000, 1_200_000, 900_000, 1_100_000] }))!;
    expect(q.avgVolume).toBeNull();
    expect(q.enriched).toBe(false);
  });

  it("accepts Yahoo's own average when the history is too short", () => {
    const q = mergeFullQuote("AAPL", fh, chart({ averageDailyVolume10Day: 2_000_000, regularMarketVolume: 3_000_000 }, {}))!;
    expect(q.avgVolume).toBe(2_000_000);
    expect(q.enriched).toBe(true);
  });

  it("ignores null bars when averaging", () => {
    const volumes = [1_000_000, null, 1_000_000, null, 1_000_000, 1_000_000, 1_000_000];
    const q = mergeFullQuote("AAPL", fh, chart({}, { volume: volumes }))!;
    expect(q.avgVolume).toBe(1_000_000);
  });
});

describe("mergeFullQuote — sources", () => {
  it("prefers Finnhub's price over Yahoo's older print", () => {
    const q = mergeFullQuote("AAPL", fh, chart({ regularMarketPrice: 108 }, {}))!;
    expect(q.price).toBe(110);
    expect(q.previousClose).toBe(100);
    expect(q.source).toBe("mixed");
  });

  it("works from Finnhub alone", () => {
    const q = mergeFullQuote("AAPL", fh, null)!;
    expect(q.price).toBe(110);
    expect(q.changePercent).toBeCloseTo(10, 5);
    expect(q.source).toBe("finnhub");
    expect(q.closes).toEqual([]);
    expect(q.enriched).toBe(false);
  });

  it("works from Yahoo alone", () => {
    const q = mergeFullQuote("SPY", null, chart({ regularMarketPrice: 500, previousClose: 495 }, { close: [490, 495, 500] }))!;
    expect(q.price).toBe(500);
    expect(q.previousClose).toBe(495);
    expect(q.source).toBe("yahoo");
  });

  it("returns null when neither source had a price", () => {
    expect(mergeFullQuote("NOPE", null, chart({}, {}))).toBeNull();
    expect(mergeFullQuote("NOPE", null, null)).toBeNull();
  });

  it("falls back to the last close when Yahoo omits the live price", () => {
    const q = mergeFullQuote("SPY", null, chart({}, { close: [490, 495, 500] }))!;
    expect(q.price).toBe(500);
  });

  it("returns the close series for callers that need a trend", () => {
    const q = mergeFullQuote("SPY", fh, chart({}, { close: [96, 97, 98, 99, 100] }))!;
    expect(q.closes).toEqual([96, 97, 98, 99, 100]);
  });
});
