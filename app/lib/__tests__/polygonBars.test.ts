import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearPolygonCache,
  __resetPolygonBudget,
  parsePolygonBars,
  polygonBars,
  polygonBudgetRemaining,
  toSeries,
  withLiveBar,
  type DailyBar,
} from "../polygonBars";

// Polygon is the only free source that reliably answers with daily bars: 84 in
// 62ms from the deployment, against Yahoo's 2 successes in 15 attempts taking
// 3.3-6.5 seconds to fail. These pin the parts that are easy to get wrong —
// the per-minute budget, and the provisional bar that keeps an end-of-day
// series current during a session without inventing a volume for it.

const realFetch = globalThis.fetch;
const realKey = process.env.POLYGON_API_KEY;

/** One Polygon aggregate row. `t` is epoch ms. */
const row = (date: string, close: number, volume = 1_000_000) => ({
  t: Date.parse(`${date}T20:00:00Z`),   // 4pm ET, inside the session
  o: close - 1, h: close + 1, l: close - 2, c: close, v: volume,
});

const okBody = (rows: unknown[]) => ({ ticker: "AAPL", resultsCount: rows.length, status: "OK", results: rows });

function mockFetch(handler: () => Response) {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return handler(); }) as typeof fetch;
  return () => calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  process.env.POLYGON_API_KEY = "test-key";
  __clearPolygonCache();
  __resetPolygonBudget();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  if (realKey === undefined) delete process.env.POLYGON_API_KEY;
  else process.env.POLYGON_API_KEY = realKey;
});

describe("parsePolygonBars", () => {
  it("reads a well-formed series in ascending order", () => {
    const bars = parsePolygonBars(okBody([row("2026-10-20", 100), row("2026-10-21", 101)]));
    expect(bars).toHaveLength(2);
    expect(bars[0].close).toBe(100);
    expect(bars[1].close).toBe(101);
    expect(bars[0].date < bars[1].date).toBe(true);
  });

  it("rounds the adjusted volume, which arrives fractional", () => {
    // Observed live: vol 42743575.651348 — split-adjusted, hence the fraction.
    const bars = parsePolygonBars(okBody([{ ...row("2026-10-20", 100), v: 42743575.651348 }]));
    expect(bars[0].volume).toBe(42743576);
    expect(Number.isInteger(bars[0].volume)).toBe(true);
  });

  it("drops a row missing any part of the OHLC", () => {
    // A partial row cannot give a high/low range or an EMA, and passing one
    // through would put a zero into a technical.
    const bars = parsePolygonBars(okBody([
      row("2026-10-20", 100),
      { t: Date.parse("2026-10-21T20:00:00Z"), o: 5, c: 6 },   // no high/low
      { ...row("2026-10-22", 102), c: 0 },                      // zero close
    ]));
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(100);
  });

  it("returns an empty series rather than throwing on junk", () => {
    expect(parsePolygonBars(null)).toEqual([]);
    expect(parsePolygonBars({})).toEqual([]);
    expect(parsePolygonBars({ results: "nope" })).toEqual([]);
    expect(parsePolygonBars("results")).toEqual([]);
  });
});

describe("the per-minute budget", () => {
  it("allows five calls then refuses, rather than queueing", async () => {
    // The free tier's limit is per minute, not per burst. Holding a request
    // open waiting for the window to roll would be worse than saying no.
    const calls = mockFetch(() => json(okBody([row("2026-10-20", 100)])));

    for (let i = 0; i < 5; i++) {
      const r = await polygonBars(`SYM${i}`);
      expect(r.outcome).toBe("ok");
    }
    expect(polygonBudgetRemaining()).toBe(0);

    const refused = await polygonBars("SYM_OVERFLOW");
    expect(refused.outcome).toBe("budget");
    expect(refused.bars).toEqual([]);
    expect(calls()).toBe(5);        // the sixth was never sent
  });

  it("serves cached bars rather than spending a slot", async () => {
    const calls = mockFetch(() => json(okBody([row("2026-10-20", 100)])));

    const first = await polygonBars("AAPL");
    expect(first.outcome).toBe("ok");

    const second = await polygonBars("AAPL");
    expect(second.outcome).toBe("cached");
    expect(second.bars).toHaveLength(1);
    expect(calls()).toBe(1);
    expect(polygonBudgetRemaining()).toBe(4);
  });

  it("falls back to stale bars when the budget is gone", async () => {
    // Yesterday's bars beat none at all.
    mockFetch(() => json(okBody([row("2026-10-20", 100)])));
    await polygonBars("AAPL");

    __resetPolygonBudget();
    for (let i = 0; i < 5; i++) await polygonBars(`FILL${i}`);

    const r = await polygonBars("AAPL", { force: true });
    expect(r.outcome).toBe("cached");
    expect(r.bars).toHaveLength(1);
  });

  it("reports no_key without spending a slot", async () => {
    delete process.env.POLYGON_API_KEY;
    const calls = mockFetch(() => json(okBody([])));
    const r = await polygonBars("AAPL");

    expect(r.outcome).toBe("no_key");
    expect(calls()).toBe(0);
    expect(polygonBudgetRemaining()).toBe(5);
  });

  it("reports failed on an error status, and does not cache it", async () => {
    mockFetch(() => new Response("nope", { status: 403 }));
    const r = await polygonBars("AAPL");
    expect(r.outcome).toBe("failed");
    expect(r.bars).toEqual([]);
  });
});

describe("withLiveBar", () => {
  const bars: DailyBar[] = [
    { date: "2026-10-22", open: 98, high: 101, low: 97, close: 100, volume: 1_000_000 },
    { date: "2026-10-23", open: 100, high: 103, low: 99, close: 102, volume: 1_200_000 },
  ];

  /** A Monday inside the regular session. */
  const duringSession = new Date("2026-10-26T18:00:00Z");
  /** A Saturday. */
  const marketClosed = new Date("2026-10-24T18:00:00Z");

  it("appends today's price during a session, so technicals are not a day behind", () => {
    const out = withLiveBar(bars, 105, duringSession);
    expect(out).toHaveLength(3);
    expect(out[2].close).toBe(105);
    expect(out[2].provisional).toBe(true);
  });

  it("gives the provisional bar no volume", () => {
    // Today's volume is not known from either source. A real-looking figure
    // here would feed a volume surge that never happened.
    const out = withLiveBar(bars, 105, duringSession);
    expect(out[2].volume).toBe(0);
  });

  it("adds nothing when the market is closed", () => {
    // The last close already is the market's latest state.
    expect(withLiveBar(bars, 105, marketClosed)).toHaveLength(2);
  });

  it("does not overwrite a real bar for today", () => {
    // Replacing it would discard a genuine high, low and volume.
    const withToday = [...bars, { date: "2026-10-26", open: 102, high: 107, low: 101, close: 106, volume: 900_000 }];
    const out = withLiveBar(withToday, 105, duringSession);
    expect(out).toHaveLength(3);
    expect(out[2].close).toBe(106);
    expect(out[2].provisional).toBeUndefined();
  });

  it("ignores a missing or nonsensical live price", () => {
    expect(withLiveBar(bars, null, duringSession)).toHaveLength(2);
    expect(withLiveBar(bars, 0, duringSession)).toHaveLength(2);
    expect(withLiveBar([], 105, duringSession)).toHaveLength(0);
  });
});

describe("toSeries", () => {
  it("excludes a provisional bar from the volume series", () => {
    // Its zero would drag a 20-day average down as though the session had
    // traded nothing.
    const out = toSeries([
      { date: "2026-10-23", open: 100, high: 103, low: 99, close: 102, volume: 1_200_000 },
      { date: "2026-10-26", open: 105, high: 105, low: 105, close: 105, volume: 0, provisional: true },
    ]);

    expect(out.closes).toEqual([102, 105]);   // price series keeps today
    expect(out.volumes).toEqual([1_200_000]); // volume series does not
  });
});
