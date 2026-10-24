import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isFinnhubEligible, newFinnhubStats, parseFinnhubQuote } from "../finnhubFetch";
import { marketQuote } from "../marketQuote";

// Yahoo rate limits the deployment's address roughly two calls in three, so
// these routes now ask Finnhub first. What matters is that every way Finnhub
// can fail still ends up with a Yahoo answer rather than a blank cell — the
// fallback is the entire safety argument for the swap.

const realFetch = globalThis.fetch;
const realKey = process.env.FINNHUB_API_KEY;

type Routed = { finnhub: number; yahoo: number };

/** Serves a scripted response per provider and counts who was asked. */
function mockProviders(opts: {
  finnhub?: () => Response;
  yahoo?: () => Response;
}): Routed {
  const seen: Routed = { finnhub: 0, yahoo: 0 };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("finnhub.io")) {
      seen.finnhub++;
      if (!opts.finnhub) throw new Error("unexpected finnhub call");
      return opts.finnhub();
    }
    if (url.includes("finance.yahoo.com")) {
      seen.yahoo++;
      if (!opts.yahoo) throw new Error("unexpected yahoo call");
      return opts.yahoo();
    }
    throw new Error(`unrouted url: ${url}`);
  }) as typeof fetch;

  return seen;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Finnhub /quote: current 110 against a previous close of 100 — a clean +10%. */
const finnhubOk = () => json({ c: 110, pc: 100, o: 101, h: 112, l: 99 });

/** The body Finnhub returns for a symbol it does not carry: everything zeroed. */
const finnhubZeroed = () => json({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 });

/** Yahoo chart: last close 100 against a previous session of 95 — about +5.26%. */
const yahooOk = () =>
  json({
    chart: {
      result: [{
        meta: { regularMarketPrice: 100, previousClose: 95 },
        indicators: { quote: [{ close: [90, 95, 100] }] },
      }],
    },
  });

beforeEach(() => { process.env.FINNHUB_API_KEY = "test-key"; });

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = realKey;
});

describe("parseFinnhubQuote", () => {
  it("reads a real quote", () => {
    expect(parseFinnhubQuote({ c: 110, pc: 100, o: 101, h: 112, l: 99 }))
      .toEqual({ price: 110, previousClose: 100, open: 101, high: 112, low: 99 });
  });

  it("rejects the zeroed body Finnhub sends for an unknown symbol", () => {
    // A 200 with c:0 is the single most dangerous response here — zero reaching
    // a chart as a real price is worse than the missing data this replaces.
    expect(parseFinnhubQuote({ c: 0, pc: 0, o: 0, h: 0, l: 0 })).toBeNull();
  });

  it("rejects a price with no previous close, since no change can be computed", () => {
    expect(parseFinnhubQuote({ c: 110, pc: 0 })).toBeNull();
    expect(parseFinnhubQuote({ c: 110 })).toBeNull();
  });

  it("keeps the quote when only the optional fields are missing", () => {
    expect(parseFinnhubQuote({ c: 110, pc: 100 }))
      .toEqual({ price: 110, previousClose: 100, open: null, high: null, low: null });
  });

  it("rejects anything that is not an object", () => {
    expect(parseFinnhubQuote(null)).toBeNull();
    expect(parseFinnhubQuote("c=110")).toBeNull();
  });
});

describe("isFinnhubEligible", () => {
  it("accepts US equities and ETFs", () => {
    expect(isFinnhubEligible("SPY")).toBe(true);
    expect(isFinnhubEligible("AAPL")).toBe(true);
  });

  it("rejects crypto pairs, which live on a different endpoint", () => {
    expect(isFinnhubEligible("BTC-USD")).toBe(false);
    expect(isFinnhubEligible("ETH-USD")).toBe(false);
  });

  it("rejects futures and index symbols", () => {
    expect(isFinnhubEligible("CL=F")).toBe(false);
    expect(isFinnhubEligible("^GSPC")).toBe(false);
  });
});

describe("marketQuote provider order", () => {
  it("takes Finnhub's answer and never asks Yahoo", async () => {
    const seen = mockProviders({ finnhub: finnhubOk });
    const q = await marketQuote("SPY");

    expect(q).toEqual({ symbol: "SPY", price: 110, change: 10, source: "finnhub" });
    expect(seen).toEqual({ finnhub: 1, yahoo: 0 });
  });

  it("falls back to Yahoo when Finnhub returns a zeroed body", async () => {
    const seen = mockProviders({ finnhub: finnhubZeroed, yahoo: yahooOk });
    const q = await marketQuote("SPY");

    expect(q.source).toBe("yahoo");
    expect(q.price).toBe(100);
    expect(q.change).toBe(5.26);
    expect(seen).toEqual({ finnhub: 1, yahoo: 1 });
  });

  it("falls back to Yahoo on a Finnhub 429 without retrying it", async () => {
    // The free tier is a per-minute budget, so a retry only spends the next
    // minute. One attempt, then Yahoo.
    const seen = mockProviders({ finnhub: () => new Response("limit", { status: 429 }), yahoo: yahooOk });
    const q = await marketQuote("SPY");

    expect(q.source).toBe("yahoo");
    expect(seen.finnhub).toBe(1);
  });

  it("skips Finnhub entirely for crypto", async () => {
    const seen = mockProviders({ yahoo: yahooOk });
    const q = await marketQuote("BTC-USD");

    expect(q.source).toBe("yahoo");
    expect(seen).toEqual({ finnhub: 0, yahoo: 1 });
  });

  it("skips Finnhub when no key is configured", async () => {
    delete process.env.FINNHUB_API_KEY;
    const seen = mockProviders({ yahoo: yahooOk });
    const q = await marketQuote("SPY");

    expect(q.source).toBe("yahoo");
    expect(seen.finnhub).toBe(0);
  });

  it("returns nulls, not a throw, when both providers fail", async () => {
    const seen = mockProviders({
      finnhub: () => new Response("boom", { status: 500 }),
      yahoo:   () => new Response("boom", { status: 500 }),
    });
    const q = await marketQuote("SPY");

    expect(q).toEqual({ symbol: "SPY", price: null, change: null, source: null });
    expect(seen).toEqual({ finnhub: 1, yahoo: 1 });
  });

  it("counts the outcome so a route can report which source served it", async () => {
    const stats = newFinnhubStats();
    mockProviders({ finnhub: finnhubOk });
    await marketQuote("SPY", { finnhubStats: stats });

    expect(stats.ok).toBe(1);
    expect(stats.miss).toBe(0);
  });

  it("counts a zeroed body as a miss rather than a success", async () => {
    const stats = newFinnhubStats();
    mockProviders({ finnhub: finnhubZeroed, yahoo: yahooOk });
    await marketQuote("SPY", { finnhubStats: stats });

    expect(stats.ok).toBe(0);
    expect(stats.miss).toBe(1);
  });
});
