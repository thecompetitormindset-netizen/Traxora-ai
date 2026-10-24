import { describe, expect, it } from "vitest";
import { buildRow, scoreOf, type StockData } from "../scanScoring";

// scan ranked on inputs that all came from Yahoo, which answers about one
// request in nine from the deployment. A missing volume ratio defaulted to 1,
// so an unknown symbol scored as though it had exactly average volume — three
// fabricated points in a ranking people act on. These pin the two things that
// has to get right: a missing input contributes nothing, and a row is only
// called enriched when the ranking inputs are genuinely there.

const base = { price: 100, previousClose: 100, changePercent: 0, open: null, high: null, low: null };

const enrichment = {
  name: "Apple Inc.",
  price: 100,
  previousClose: 98,
  volume: 2_000_000,
  avgVolume: 1_000_000,
  high52w: 120,
  low52w: 80,
  marketCap: null,
  history5d: [96, 97, 98, 99, 100],
  open: 99,
  high: 101,
  low: 98,
};

describe("scoreOf", () => {
  it("contributes nothing for an unknown volume ratio", () => {
    // The old default of 1 scored 3 points for data nobody had.
    expect(scoreOf({ volumeRatio: null, changePercent: 0, yearRangePct: null })).toBe(0);
  });

  it("scores a known average volume above an unknown one", () => {
    const known = scoreOf({ volumeRatio: 1, changePercent: 0, yearRangePct: null });
    const unknown = scoreOf({ volumeRatio: null, changePercent: 0, yearRangePct: null });
    expect(known).toBeGreaterThan(unknown);
  });

  it("caps the volume surge so one wild print cannot dominate", () => {
    const tenX = scoreOf({ volumeRatio: 10, changePercent: 0, yearRangePct: null });
    const hundredX = scoreOf({ volumeRatio: 100, changePercent: 0, yearRangePct: null });
    expect(hundredX).toBe(tenX);
  });

  it("counts a move in either direction", () => {
    const up = scoreOf({ volumeRatio: null, changePercent: 5, yearRangePct: null });
    const down = scoreOf({ volumeRatio: null, changePercent: -5, yearRangePct: null });
    expect(up).toBe(down);
    expect(up).toBe(10);
  });

  it("adds the 52-week bonus only near an extreme", () => {
    const mid = scoreOf({ volumeRatio: null, changePercent: 0, yearRangePct: 50 });
    const low = scoreOf({ volumeRatio: null, changePercent: 0, yearRangePct: 10 });
    const high = scoreOf({ volumeRatio: null, changePercent: 0, yearRangePct: 90 });
    expect(mid).toBe(0);
    expect(low).toBe(4);
    expect(high).toBe(4);
  });

  it("lets a big move on an unenriched row outrank a quiet enriched one", () => {
    // The point of keeping unenriched rows in the list at all: a 9% move is
    // more interesting than 1.2x volume, and should be ranked as such.
    const bigMoveNoVolume = scoreOf({ volumeRatio: null, changePercent: 9, yearRangePct: null });
    const quietWithVolume = scoreOf({ volumeRatio: 1.2, changePercent: 0.1, yearRangePct: 50 });
    expect(bigMoveNoVolume).toBeGreaterThan(quietWithVolume);
  });
});

describe("buildRow", () => {
  it("builds a fully enriched row when both halves arrive", () => {
    const row = buildRow("AAPL", base, enrichment)!;
    expect(row.enriched).toBe(true);
    expect(row.name).toBe("Apple Inc.");
    expect(row.volumeRatio).toBe(2);
    expect(row.yearRangePct).toBe(50);
    expect(row.score).toBeGreaterThan(0);
  });

  it("builds a usable row from Finnhub alone, marked unenriched", () => {
    // The whole point: the list populates even when Yahoo gives nothing.
    const row = buildRow("AAPL", { ...base, price: 110, previousClose: 100, changePercent: 10 }, null)!;
    expect(row.enriched).toBe(false);
    expect(row.price).toBe(110);
    expect(row.changePercent).toBe(10);
    expect(row.volumeRatio).toBeNull();
    expect(row.volume).toBeNull();
    expect(row.name).toBe("AAPL");       // no name without the enrichment
    expect(row.score).toBe(20);          // momentum only
  });

  it("falls back to Yahoo's price when Finnhub had none", () => {
    const row = buildRow("BTC-USD", null, enrichment)!;
    expect(row.price).toBe(100);
    expect(row.previousClose).toBe(98);
    expect(row.enriched).toBe(true);
  });

  it("returns null only when neither source had a price", () => {
    expect(buildRow("NOPE", null, null)).toBeNull();
  });

  it("is not enriched when Yahoo answered but carried no volume history", () => {
    // A response missing the ranking inputs ranks no better than no response,
    // so it must not be labelled as though it were complete.
    const noVolume = { ...enrichment, volume: null, avgVolume: null };
    const row = buildRow("AAPL", base, noVolume)!;
    expect(row.enriched).toBe(false);
    expect(row.volumeRatio).toBeNull();
    // The 52-week bonus still applies; that input did arrive.
    expect(row.yearRangePct).toBe(50);
  });

  it("does not invent a ratio from a zero average volume", () => {
    const zeroAvg = { ...enrichment, volume: 1_000_000, avgVolume: 0 };
    const row = buildRow("AAPL", base, zeroAvg)!;
    expect(row.volumeRatio).toBeNull();
    expect(row.enriched).toBe(false);
  });

  it("prefers Finnhub's price over Yahoo's when both arrive", () => {
    // Finnhub is the reliable leg; Yahoo's copy may be older.
    const row = buildRow("AAPL", { ...base, price: 105 }, enrichment)!;
    expect(row.price).toBe(105);
  });

  it("ranks enriched and unenriched rows in one order", () => {
    const rows = [
      buildRow("QUIET", { ...base, changePercent: 0.2 }, enrichment),
      buildRow("MOVER", { ...base, price: 112, previousClose: 100, changePercent: 12 }, null),
    ].filter((r): r is StockData => r !== null);

    rows.sort((a, b) => b.score - a.score);
    expect(rows[0].symbol).toBe("MOVER");
    expect(rows[0].enriched).toBe(false);
  });
});
