import { describe, expect, it } from "vitest";
import { fifoRealizedPL, fifoEntryForSell, type TradeRecord } from "../pl";

// Helper — builds a trade with a stable time string so findIndex falls back works.
function buy(sym: string, qty: number, price: number, time: string): TradeRecord {
  return { symbol: sym, side: "BUY",  price, quantity: qty, time };
}
function sell(sym: string, qty: number, price: number, time: string): TradeRecord {
  return { symbol: sym, side: "SELL", price, quantity: qty, time };
}

describe("fifoRealizedPL === sum of fifoEntryForSell.pl", () => {
  it("single buy then sell", () => {
    // newest-first order
    const trades: TradeRecord[] = [
      sell("AAPL", 10, 130, "t3"),
      buy("AAPL",  10, 100, "t1"),
    ];
    const total = fifoRealizedPL(trades);
    expect(total).toBeCloseTo(300); // (130 - 100) * 10

    const { pl, entryPrice } = fifoEntryForSell(trades[0], trades);
    expect(pl).toBeCloseTo(300);
    expect(entryPrice).toBeCloseTo(100);
    expect(pl).toBeCloseTo(total);
  });

  it("two buys at different prices, FIFO applies (not average cost)", () => {
    const trades: TradeRecord[] = [
      sell("AAPL", 10, 130, "t3"),
      buy("AAPL",  10, 120, "t2"),
      buy("AAPL",  10, 100, "t1"),
    ];
    const total = fifoRealizedPL(trades);
    // FIFO uses the $100 lot first → P&L = (130-100)*10 = 300
    // Average cost would give: avg=(100+120)/2=110 → P&L = (130-110)*10 = 200
    expect(total).toBeCloseTo(300);

    const { pl } = fifoEntryForSell(trades[0], trades);
    expect(pl).toBeCloseTo(300);
    expect(pl).toBeCloseTo(total); // must match fifoRealizedPL
  });

  it("multiple sells sum to the same total as fifoRealizedPL", () => {
    const trades: TradeRecord[] = [
      sell("AAPL", 10, 140, "t5"),
      sell("AAPL", 10, 130, "t4"),
      buy("AAPL",  10, 120, "t2"),
      buy("AAPL",  10, 100, "t1"),
    ];
    const total = fifoRealizedPL(trades);
    // sell@130 uses buy@100 → +300
    // sell@140 uses buy@120 → +200
    expect(total).toBeCloseTo(500);

    const perSellSum = trades
      .filter(t => t.side === "SELL")
      .map(t => fifoEntryForSell(t, trades).pl ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(perSellSum).toBeCloseTo(total);
  });

  it("mixed symbols are tracked independently", () => {
    const trades: TradeRecord[] = [
      sell("MSFT", 5,  310, "t4"),
      sell("AAPL", 10, 130, "t3"),
      buy("MSFT",  5,  300, "t2"),
      buy("AAPL",  10, 100, "t1"),
    ];
    const total = fifoRealizedPL(trades);
    // AAPL: (130-100)*10 = 300; MSFT: (310-300)*5 = 50 → 350
    expect(total).toBeCloseTo(350);

    const perSellSum = trades
      .filter(t => t.side === "SELL")
      .map(t => fifoEntryForSell(t, trades).pl ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(perSellSum).toBeCloseTo(total);
  });
});
