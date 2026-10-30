import { afterEach, describe, expect, it, vi } from "vitest";

// The crypto board reads from two sources now. CoinGecko carries the price and
// the day's move, in one keyless request, because the coins are not on
// Finnhub's free tier and Yahoo rate-limits this deployment. Yahoo carries the
// year of daily OHLC the indicators and backtest need.
//
// What has to hold: the prices survive Yahoo being unavailable, the analysis
// fields go absent rather than neutral when it is, and a total failure is
// reported as one instead of arriving as an empty board.

// The route gates on a viewer, which drags in next-auth and its Next server
// imports. Who is asking is not what these tests are about.
vi.mock("@/app/lib/viewer", () => ({
  viewer: async () => ({ user: { email: "test@example.test", anonymous: true } }),
}));

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.resetModules(); vi.restoreAllMocks(); });

const GECKO_ROW = (id: string, price: number, change: number) => ({
  id, symbol: id.slice(0, 3), current_price: price,
  price_change_percentage_24h: change, total_volume: 1e9,
  sparkline_in_7d: { price: [price * 0.98, price * 0.99, price] },
});

/** A year of daily bars that rises steadily, enough for every indicator. */
function yahooChart(last: number) {
  const n = 400;
  const closes = Array.from({ length: n }, (_, i) => last * (0.6 + (0.4 * i) / n));
  const ts = Array.from({ length: n }, (_, i) => Math.floor(Date.now() / 1000) - (n - i) * 86_400);
  return {
    chart: { result: [{
      timestamp: ts,
      indicators: {
        quote: [{
          open: closes, high: closes.map(c => c * 1.01),
          low: closes.map(c => c * 0.99), close: closes,
          volume: closes.map(() => 1_000_000),
        }],
      },
    }] },
  };
}

/** Routes each URL to the right stub, so either source can be made to fail. */
function stub({ gecko, yahoo }: { gecko?: unknown | "fail"; yahoo?: boolean }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("coingecko")) {
      if (gecko === "fail" || gecko === undefined) return new Response("no", { status: 503 });
      return new Response(JSON.stringify(gecko), { headers: { "content-type": "application/json" } });
    }
    if (url.includes("yahoo")) {
      if (!yahoo) return new Response("no", { status: 503 });
      return new Response(JSON.stringify(yahooChart(68_000)), { headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

const load = async () => (await import("../../api/market/crypto-movers/route")).GET;

describe("crypto board", () => {
  it("shows prices from CoinGecko even when Yahoo will not answer", async () => {
    // The symptom that started this: a wall of dashes where prices belong,
    // because every coin fell through to the throttled source.
    stub({ gecko: [GECKO_ROW("bitcoin", 68_500, -1.8), GECKO_ROW("ethereum", 3_200, 2.4)], yahoo: false });

    const res = await (await load())();
    expect(res.status).toBe(200);
    const body = await res.json();

    const btc = body.coins.find((c: { ticker: string }) => c.ticker === "BTC");
    expect(btc.price).toBe(68_500);
    expect(btc.changePct).toBe(-1.8);
    expect(body.priceSource).toBe("coingecko");
  });

  it("reports the analysis as absent rather than neutral when Yahoo is down", async () => {
    // A null signal means "we could not work it out". A HOLD would mean "we
    // worked it out and it is balanced" — a different claim entirely.
    stub({ gecko: [GECKO_ROW("bitcoin", 68_500, -1.8)], yahoo: false });

    const body = await (await (await load())()).json();
    const btc = body.coins.find((c: { ticker: string }) => c.ticker === "BTC");

    expect(btc.signal).toBeNull();
    expect(btc.rsi14).toBeNull();
    expect(btc.backtest).toBeNull();
    expect(body.analysisAvailable).toBe(false);
  });

  it("still flags a big move from the price source alone", async () => {
    stub({ gecko: [GECKO_ROW("bitcoin", 68_500, -7.2)], yahoo: false });

    const body = await (await (await load())()).json();
    expect(body.coins.find((c: { ticker: string }) => c.ticker === "BTC").bigMove).toBe(true);
  });

  it("prefers the fresher price when both sources answer", async () => {
    // Yahoo's last close can be hours stale for something that never closes.
    stub({ gecko: [GECKO_ROW("bitcoin", 70_123, 1.1)], yahoo: true });

    const body = await (await (await load())()).json();
    const btc = body.coins.find((c: { ticker: string }) => c.ticker === "BTC");

    expect(btc.price).toBe(70_123);
    expect(body.analysisAvailable).toBe(true);   // the deeper read survived too
  });

  it("reports a failure when neither source answers, rather than an empty board", async () => {
    stub({ gecko: "fail", yahoo: false });

    const res = await (await load())();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.coins).toEqual([]);
    expect(body.hint).toMatch(/answered|rate-limiting/);
  });

  it("names a CoinGecko rate limit as one, because it clears on its own", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).includes("coingecko")
        ? new Response("{}", { status: 429 })
        : new Response("no", { status: 503 })) as typeof fetch;

    const body = await (await (await load())()).json();
    expect(body.error).toBe("rate_limited");
  });
});
