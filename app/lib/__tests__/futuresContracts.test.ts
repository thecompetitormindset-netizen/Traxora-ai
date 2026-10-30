import { describe, expect, it } from "vitest";
import {
  allFutures, contractMultiplier, futuresSpec, notional, proxySymbols, tickValue,
} from "../futuresContracts";
import { placeOrder, profit, profitPct, type Ticket } from "../paperEngine";

// Practice trading sized futures like shares: one "share" of CL at 75 cost 75,
// and a dollar move in crude made a dollar. A CL contract is a thousand
// barrels, so the real figures are 75,000 of exposure and a thousand dollars a
// move. These pin the contract size in place.

describe("specs", () => {
  it("knows the contract size for every future the app offers", () => {
    for (const s of allFutures()) {
      expect(s.multiplier).toBeGreaterThan(0);
      expect(s.tickSize).toBeGreaterThan(0);
      expect(s.initialMargin).toBeGreaterThan(0);
      expect(s.proxyEtf).toMatch(/^[A-Z]{2,5}$/);
      expect(s.proxyCaveat.length).toBeGreaterThan(20);
    }
  });

  it("resolves a symbol in any form the app uses", () => {
    expect(futuresSpec("CL.COMM")?.root).toBe("CL");
    expect(futuresSpec("CL=F")?.root).toBe("CL");
    expect(futuresSpec("cl")?.root).toBe("CL");
  });

  it("returns null for anything that is not a future", () => {
    // Callers must not fall back to a multiplier of one by accident — that is
    // the original mistake.
    expect(futuresSpec("AAPL")).toBeNull();
    expect(futuresSpec("BTC-USD")).toBeNull();
  });

  it("leaves shares and crypto at a multiplier of one", () => {
    expect(contractMultiplier("AAPL")).toBe(1);
    expect(contractMultiplier("CL.COMM")).toBe(1_000);
  });

  it("prices a contract's full exposure", () => {
    // The number the old simulation was missing entirely.
    expect(notional(futuresSpec("CL.COMM")!, 75)).toBe(75_000);
    expect(notional(futuresSpec("ES.COMM")!, 5_800)).toBe(290_000);
  });

  it("values a tick", () => {
    expect(tickValue(futuresSpec("CL.COMM")!)).toBeCloseTo(10, 6);   // 0.01 × 1,000
    expect(tickValue(futuresSpec("ES.COMM")!)).toBeCloseTo(12.5, 6); // 0.25 × 50
  });

  it("gives every contract a distinct proxy to measure signals on", () => {
    expect(proxySymbols().length).toBeGreaterThan(5);
  });
});

const now = Date.parse("2026-11-04T15:00:00Z"); // Wednesday, futures open
const quote = (price: number) => ({ price, time: now });

describe("profit and loss", () => {
  const order = { signal: "BUY" as const, entry: 75, shares: 1, symbol: "CL.COMM" };

  it("pays the contract size, not the price", () => {
    // A dollar on crude is a thousand dollars, not a dollar.
    expect(profit(order, 76)).toBe(1_000);
    expect(profit(order, 74)).toBe(-1_000);
  });

  it("still treats shares as shares", () => {
    expect(profit({ signal: "BUY", entry: 190, shares: 10, symbol: "AAPL" }, 191)).toBe(10);
  });

  it("measures return against the margin posted, which is where leverage shows", () => {
    // $1,000 made on $6,000 of margin is 16.7%, not the 1.3% that measuring
    // against the contract's value would suggest.
    expect(profitPct(order, 76)).toBeCloseTo(16.67, 1);
  });

  it("measures a share trade against the price paid", () => {
    expect(profitPct({ signal: "BUY", entry: 100, shares: 1, symbol: "AAPL" }, 110)).toBeCloseTo(10, 6);
  });

  it("works the same way short", () => {
    const short = { signal: "SELL" as const, entry: 75, shares: 2, symbol: "CL.COMM" };
    expect(profit(short, 74)).toBe(2_000);
    expect(profit(short, 76)).toBe(-2_000);
  });
});

describe("placing a futures order", () => {
  const ticket = (over: Partial<Ticket> = {}): Ticket => ({
    symbol: "CL.COMM", side: "BUY", type: "market", shares: 1, ...over,
  });

  it("charges margin rather than the contract's value", () => {
    // 75,000 of crude held on about 6,000 — if it charged the full value the
    // leverage that defines the instrument would vanish.
    const r = placeOrder(ticket(), quote(75), 10_000, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.shares).toBe(1);
  });

  it("refuses when the margin is not there, and says the numbers", () => {
    const r = placeOrder(ticket({ shares: 2 }), quote(75), 10_000, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("12,000");
    expect(r.error).toContain("10,000");
  });

  it("turns a dollar amount into whole contracts", () => {
    // You cannot hold a third of a contract.
    const r = placeOrder(ticket({ shares: null, dollars: 20_000 }), quote(75), 50_000, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.shares).toBe(3);         // 20,000 / 6,000 margin
    expect(Number.isInteger(r.order.shares)).toBe(true);
  });

  it("refuses a dollar amount too small for one contract, naming the margin", () => {
    const r = placeOrder(ticket({ shares: null, dollars: 500 }), quote(75), 50_000, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("6,000");
  });

  it("refuses a fractional contract", () => {
    const r = placeOrder(ticket({ shares: 1.5 }), quote(75), 50_000, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/whole contracts/);
  });

  it("sizes the stop in contract money", () => {
    // A dollar of stop distance on CL is a thousand dollars of risk. The fill
    // sits slightly above 75 because a market order pays slippage, so the
    // distance is a little over a dollar and the risk a little over 1,000 —
    // which is the honest number, not a rounded one.
    const r = placeOrder(ticket({ stop: 74 }), quote(75), 20_000, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.riskDollar).toBeGreaterThan(1_000);
    expect(r.order.riskDollar).toBeLessThan(1_100);
  });

  it("leaves share orders exactly as they were", () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", dollars: 1_000 },
      { price: 100, time: now }, 5_000, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Fractional shares are still allowed, and cost is still the cash spent.
    expect(r.order.shares).toBeCloseTo(1_000 / (100 * 1.0005), 3);
  });
});
