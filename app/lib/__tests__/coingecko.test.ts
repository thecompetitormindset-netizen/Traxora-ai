import { describe, expect, it } from "vitest";
import {
  coinGeckoId, coinGeckoMarkets, coinGeckoSymbols, isCoinGeckoSymbol, parseMarkets,
} from "../coingecko";

// Crypto quoted through the stock path fell to Yahoo, which rate-limits this
// deployment's address, so the page showed dashes where prices belong.
// CoinGecko answers every coin in one keyless request.
//
// The live call cannot be exercised from here — outbound network is blocked —
// so the parser is tested hard instead, because the parser is what breaks when
// a provider reshapes its payload.

const row = (over: Record<string, unknown> = {}) => ({
  id: "bitcoin",
  symbol: "btc",
  current_price: 68_500.25,
  price_change_percentage_24h: -1.84,
  total_volume: 31_000_000_000,
  sparkline_in_7d: { price: [67_000, 67_500, 68_000, 68_500] },
  ...over,
});

describe("symbol mapping", () => {
  it("maps the app's symbols to CoinGecko's own ids", () => {
    expect(coinGeckoId("BTC-USD")).toBe("bitcoin");
    expect(coinGeckoId("AVAX-USD")).toBe("avalanche-2");   // not "avalanche"
    expect(coinGeckoId("UNI7083-USD")).toBe("uniswap");    // Yahoo's odd ticker
  });

  it("is case-insensitive and says no to anything it does not cover", () => {
    expect(coinGeckoId("btc-usd")).toBe("bitcoin");
    expect(coinGeckoId("AAPL")).toBeNull();
    expect(isCoinGeckoSymbol("AAPL")).toBe(false);
    expect(isCoinGeckoSymbol("ETH-USD")).toBe(true);
  });

  it("covers every coin the board shows", () => {
    expect(coinGeckoSymbols()).toHaveLength(12);
  });
});

describe("parseMarkets", () => {
  it("reads price, the day's move, volume and the sparkline", () => {
    const out = parseMarkets([row()])!;
    expect(out.get("BTC-USD")).toEqual({
      symbol: "BTC-USD",
      price: 68_500.25,
      changePct: -1.84,
      sparkline: [67_000, 67_500, 68_000, 68_500],
      volume: 31_000_000_000,
    });
  });

  it("returns null for a body that is not the expected shape", () => {
    // Null, never an empty map: an empty map would claim CoinGecko knows of no
    // coins, which is a statement about the market. Null says we did not get an
    // answer we understood.
    expect(parseMarkets(null)).toBeNull();
    expect(parseMarkets({ error: "rate limited" })).toBeNull();
    expect(parseMarkets("nope")).toBeNull();
  });

  it("returns null when the array mentions none of our coins", () => {
    expect(parseMarkets([row({ id: "some-other-token" })])).toBeNull();
  });

  it("keeps the coins it understands and skips the rest", () => {
    const out = parseMarkets([row(), row({ id: "unknown-coin" }), row({ id: "ethereum" })])!;
    expect([...out.keys()].sort()).toEqual(["BTC-USD", "ETH-USD"]);
  });

  it("treats a missing or non-numeric field as unknown, not as zero", () => {
    // A coin priced at zero and a coin whose price did not arrive are
    // different facts, and only one of them is a price.
    const out = parseMarkets([row({ current_price: null, price_change_percentage_24h: "x", total_volume: undefined })])!;
    const btc = out.get("BTC-USD")!;
    expect(btc.price).toBeNull();
    expect(btc.changePct).toBeNull();
    expect(btc.volume).toBeNull();
  });

  it("survives a malformed sparkline rather than throwing", () => {
    expect(parseMarkets([row({ sparkline_in_7d: null })])!.get("BTC-USD")!.sparkline).toEqual([]);
    expect(parseMarkets([row({ sparkline_in_7d: { price: "nope" } })])!.get("BTC-USD")!.sparkline).toEqual([]);
    expect(parseMarkets([row({ sparkline_in_7d: { price: [1, null, 2, NaN] } })])!.get("BTC-USD")!.sparkline).toEqual([1, 2]);
  });

  it("keeps the most recent points when the sparkline is long", () => {
    const long = Array.from({ length: 200 }, (_, i) => i);
    const spark = parseMarkets([row({ sparkline_in_7d: { price: long } })])!.get("BTC-USD")!.sparkline;
    expect(spark).toHaveLength(30);
    expect(spark.at(-1)).toBe(199);
  });

  it("ignores rows that are not objects", () => {
    expect(parseMarkets([null, "x", 5, row()])!.size).toBe(1);
  });
});

const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })) as typeof fetch;

describe("coinGeckoMarkets", () => {
  it("returns the quotes on a good response", async () => {
    const r = await coinGeckoMarkets(["BTC-USD"], { fetchImpl: fakeFetch(200, [row()]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quotes.get("BTC-USD")?.price).toBe(68_500.25);
  });

  it("names a rate limit separately, because it clears on its own", async () => {
    const r = await coinGeckoMarkets(["BTC-USD"], { fetchImpl: fakeFetch(429, {}) });
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("reports an unusable response rather than an empty board", async () => {
    expect(await coinGeckoMarkets(["BTC-USD"], { fetchImpl: fakeFetch(503, {}) }))
      .toEqual({ ok: false, reason: "unavailable" });
    expect(await coinGeckoMarkets(["BTC-USD"], { fetchImpl: fakeFetch(200, { error: "x" }) }))
      .toEqual({ ok: false, reason: "unexpected_shape" });
  });

  it("reports a thrown request rather than swallowing it", async () => {
    const boom = (() => Promise.reject(new Error("network down"))) as typeof fetch;
    expect(await coinGeckoMarkets(["BTC-USD"], { fetchImpl: boom }))
      .toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks for nothing when no requested symbol is a known coin", async () => {
    let called = false;
    const spy = (async () => { called = true; return new Response("[]"); }) as typeof fetch;
    const r = await coinGeckoMarkets(["AAPL", "MSFT"], { fetchImpl: spy });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("asks for every coin in one request", async () => {
    // The reason to use this provider at all: one call for the whole board
    // instead of one per symbol.
    const urls: string[] = [];
    const spy = (async (u: RequestInfo | URL) => {
      urls.push(String(u));
      return new Response(JSON.stringify([row()]), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await coinGeckoMarkets(["BTC-USD", "ETH-USD", "SOL-USD"], { fetchImpl: spy });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("bitcoin,ethereum,solana");
  });

  it("does not repeat an id that was asked for twice", async () => {
    const urls: string[] = [];
    const spy = (async (u: RequestInfo | URL) => {
      urls.push(String(u));
      return new Response(JSON.stringify([row()]), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await coinGeckoMarkets(["BTC-USD", "btc-usd"], { fetchImpl: spy });
    expect(urls[0].match(/bitcoin/g)).toHaveLength(1);
  });
});
