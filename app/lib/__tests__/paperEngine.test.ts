import { describe, expect, it } from "vitest";
import {
  catchUp, closeNow, isMarketOpen, marketKind, placeOrder, summarize, tick, SLIPPAGE, type PaperOrder,
} from "../paperEngine";

// Wed 2026-10-07 11:00 ET (15:00 UTC) — market open; Sat 2026-10-10 noon ET — closed.
const OPEN = Date.UTC(2026, 9, 7, 15, 0);
const CLOSED = Date.UTC(2026, 9, 10, 16, 0);
const q = (price: number, time = OPEN) => ({ price, time });

describe("market hours", () => {
  it("knows stock, crypto and futures hours", () => {
    expect(isMarketOpen("AAPL", OPEN)).toBe(true);
    expect(isMarketOpen("AAPL", CLOSED)).toBe(false);
    expect(isMarketOpen("AAPL", Date.UTC(2026, 9, 7, 13, 0))).toBe(false); // 9:00 ET, before open
    expect(isMarketOpen("BTC-USD", CLOSED)).toBe(true);
    expect(marketKind("CL.COMM")).toBe("futures");
    expect(isMarketOpen("CL.COMM", Date.UTC(2026, 9, 7, 21, 30))).toBe(false); // 5:30 pm ET daily break
  });
});

describe("placing orders", () => {
  it("fills a market buy now, with slippage, sized by dollars", () => {
    const r = placeOrder({ symbol: "aapl", side: "BUY", type: "market", dollars: 1000 }, q(200), 100_000, OPEN);
    expect(r.ok && r.filled).toBe(true);
    if (!r.ok) return;
    expect(r.order.symbol).toBe("AAPL");
    expect(r.order.status).toBe("OPEN");
    expect(r.order.entry).toBeCloseTo(200 * (1 + SLIPPAGE), 4);
    expect(r.order.entry * r.order.shares).toBeCloseTo(1000, 1);
  });

  it("waits for the open when the market is closed", () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", dollars: 1000 }, q(200, CLOSED), 100_000, CLOSED);
    expect(r.ok && !r.filled).toBe(true);
    if (!r.ok) return;
    expect(r.order.status).toBe("PENDING");
    const t = tick([r.order], { AAPL: q(205) }, OPEN);
    expect(t.orders[0].status).toBe("OPEN");
    expect(t.orders[0].entry).toBeCloseTo(205 * (1 + SLIPPAGE), 4);
    expect(t.orders[0].entry * t.orders[0].shares).toBeCloseTo(1000, 1); // still the $1,000 asked for
  });

  it("won't fill on a stale quote", () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", shares: 1 }, q(200, OPEN - 60 * 60_000), 100_000, OPEN);
    expect(r.ok && !r.filled).toBe(true);
  });

  it("refuses to spend more cash than you have", () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", dollars: 5000 }, q(200), 1000, OPEN);
    expect(r.ok).toBe(false);
  });

  it("checks safety level and goal are on the right side", () => {
    expect(placeOrder({ symbol: "AAPL", side: "BUY", type: "market", shares: 1, stop: 210 }, q(200), 1e5, OPEN).ok).toBe(false);
    expect(placeOrder({ symbol: "AAPL", side: "BUY", type: "market", shares: 1, target: 190 }, q(200), 1e5, OPEN).ok).toBe(false);
    expect(placeOrder({ symbol: "AAPL", side: "SELL", type: "market", shares: 1, stop: 210, target: 190 }, q(200), 1e5, OPEN).ok).toBe(true);
  });

  it("fills a limit buy only when the price comes down, at the limit or better", () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "limit", limitPrice: 190, shares: 10 }, q(200), 1e5, OPEN);
    if (!r.ok) throw new Error(r.error);
    expect(r.filled).toBe(false);
    expect(tick([r.order], { AAPL: q(195) }, OPEN).orders[0].status).toBe("PENDING");
    const t = tick([r.order], { AAPL: q(188) }, OPEN);
    expect(t.orders[0].status).toBe("OPEN");
    expect(t.orders[0].entry).toBe(188);
  });
});

describe("automatic sells", () => {
  const open = (over: Partial<PaperOrder> = {}): PaperOrder => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", shares: 10, stop: 190, target: 220 }, q(200), 1e5, OPEN, "t1");
    if (!r.ok) throw new Error(r.error);
    return { ...r.order, ...over };
  };

  it("sells at the safety level, filling at the quote even through a gap", () => {
    const t = tick([open()], { AAPL: q(185) }, OPEN);
    expect(t.orders[0].status).toBe("LOSS");
    expect(t.orders[0].exitReason).toBe("stop");
    expect(t.orders[0].closePrice).toBeLessThan(190);
    expect(t.events[0].text).toMatch(/safety level/);
  });

  it("sells at the goal", () => {
    const t = tick([open()], { AAPL: q(221) }, OPEN);
    expect(t.orders[0].status).toBe("WIN");
    expect(t.orders[0].exitReason).toBe("target");
  });

  it("does nothing while the market is closed", () => {
    const t = tick([open()], { AAPL: q(150, CLOSED) }, CLOSED);
    expect(t.changed).toBe(false);
  });

  it("queues a sell while closed and runs it at the open", () => {
    const queued = closeNow(open(), q(200, CLOSED), CLOSED);
    expect(queued.closeQueued).toBe(true);
    expect(queued.status).toBe("OPEN");
    const t = tick([queued], { AAPL: q(205) }, OPEN);
    expect(t.orders[0].status).toBe("WIN");
  });
});

describe("account summary", () => {
  it("ties up cash in open trades and waiting orders", () => {
    const a = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", dollars: 10_000 }, q(200), 1e5, OPEN, "a");
    const b = placeOrder({ symbol: "MSFT", side: "BUY", type: "limit", limitPrice: 100, shares: 50 }, q(110), 1e5, OPEN, "b");
    if (!a.ok || !b.ok) throw new Error("setup");
    const s = summarize([a.order, b.order], 100_000, { AAPL: 210 });
    expect(s.openCount).toBe(1);
    expect(s.waitingCount).toBe(1);
    expect(s.cash).toBeCloseTo(100_000 - 10_000 - 5000 * (1 + SLIPPAGE), 0);
    expect(s.gain).toBeGreaterThan(0); // AAPL went up
  });

  it("still reads older records without the new fields", () => {
    const legacy = { id: "x", symbol: "TSLA", signal: "BUY", entry: 100, shares: 10, stop: 90, target: 120, riskDollar: 100, potential: 200, time: 0, note: "", status: "WIN", closePrice: 110 } as PaperOrder;
    expect(summarize([legacy], 100_000, {}).realized).toBe(100);
  });
});

describe("catch-up while away", () => {
  const sec = (ms: number) => Math.floor(ms / 1000);
  const bar = (ms: number, o: number, h: number, l: number, c: number) => ({ time: sec(ms), open: o, high: h, low: l, close: c });
  const base = () => {
    const r = placeOrder({ symbol: "AAPL", side: "BUY", type: "market", shares: 10, stop: 190, target: 220 }, q(200), 1e5, OPEN, "c1");
    if (!r.ok) throw new Error(r.error);
    return r.order;
  };

  it("sells at the safety level when a later bar dips through it", () => {
    const r = catchUp([base()], "AAPL", [bar(OPEN + 3600_000, 199, 200, 188, 189)], OPEN + 86400_000);
    expect(r.orders[0].status).toBe("LOSS");
    expect(r.orders[0].closePrice).toBe(190);
  });

  it("fills at the open when the price gaps past the safety level", () => {
    const r = catchUp([base()], "AAPL", [bar(OPEN + 86400_000, 180, 182, 178, 181)], OPEN + 2 * 86400_000);
    expect(r.orders[0].closePrice).toBe(180);
  });

  it("assumes the safety level first when one bar touches both", () => {
    const r = catchUp([base()], "AAPL", [bar(OPEN + 3600_000, 200, 225, 185, 210)], OPEN + 86400_000);
    expect(r.orders[0].exitReason).toBe("stop");
  });

  it("fills a waiting limit order from history", () => {
    const p = placeOrder({ symbol: "AAPL", side: "BUY", type: "limit", limitPrice: 190, shares: 5 }, q(200), 1e5, OPEN, "c2");
    if (!p.ok) throw new Error(p.error);
    const r = catchUp([p.order], "AAPL", [bar(OPEN + 3600_000, 195, 196, 189, 191)], OPEN + 86400_000);
    expect(r.orders[0].status).toBe("OPEN");
    expect(r.orders[0].entry).toBe(190);
  });

  it("ignores bars from before the trade", () => {
    const r = catchUp([base()], "AAPL", [bar(OPEN - 3600_000, 150, 150, 150, 150)], OPEN + 86400_000);
    expect(r.changed).toBe(false);
  });
});
