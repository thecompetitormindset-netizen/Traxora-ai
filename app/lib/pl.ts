export type TradeRecord = {
  symbol:   string;
  side:     string;
  price:    number;
  quantity: number;
  time?:    string;
};

/**
 * FIFO realized P&L across the full trade history.
 * `trades` must be newest-first (as stored in the portfolio).
 */
export function fifoRealizedPL(trades: TradeRecord[]): number {
  const oldestFirst = [...trades].reverse();
  const queues: Record<string, { price: number; qty: number }[]> = {};
  let total = 0;
  for (const t of oldestFirst) {
    if (t.side === "BUY") {
      if (!queues[t.symbol]) queues[t.symbol] = [];
      queues[t.symbol].push({ price: t.price, qty: t.quantity });
    } else {
      let rem = t.quantity;
      while (rem > 0 && queues[t.symbol]?.length > 0) {
        const buy     = queues[t.symbol][0];
        const matched = Math.min(rem, buy.qty);
        total  += (t.price - buy.price) * matched;
        buy.qty -= matched;
        rem     -= matched;
        if (buy.qty === 0) queues[t.symbol].shift();
      }
    }
  }
  return total;
}

/**
 * FIFO cost basis for a single SELL trade.
 * Returns the average entry price and realized P&L figures that match
 * the running total produced by fifoRealizedPL.
 *
 * `sell`      — the trade object to evaluate (must have side === "SELL")
 * `allTrades` — full trade history, newest-first (as stored in the portfolio)
 */
export function fifoEntryForSell(
  sell: TradeRecord,
  allTrades: TradeRecord[],
): { entryPrice: number | undefined; pl: number | undefined; plPct: number | undefined } {
  if (sell.side !== "SELL") {
    return { entryPrice: undefined, pl: undefined, plPct: undefined };
  }

  // Locate this sell in the array (reference match first, then field match).
  let idx = allTrades.indexOf(sell);
  if (idx === -1) {
    idx = allTrades.findIndex(
      t => t.symbol === sell.symbol && t.side === "SELL" && t.time === sell.time,
    );
  }
  if (idx === -1) return { entryPrice: undefined, pl: undefined, plPct: undefined };

  // Only look at trades at this position or older (higher index = older in newest-first array).
  const oldestFirst = [...allTrades.slice(idx)].reverse();

  const queues: Record<string, { price: number; qty: number }[]> = {};

  for (const t of oldestFirst) {
    const isTarget = t === sell ||
      (t.symbol === sell.symbol && t.side === "SELL" && t.time === sell.time);

    if (t.side === "BUY") {
      if (!queues[t.symbol]) queues[t.symbol] = [];
      queues[t.symbol].push({ price: t.price, qty: t.quantity });
    } else if (isTarget) {
      let rem       = t.quantity;
      let matched   = 0;
      let costBasis = 0;
      while (rem > 0 && queues[t.symbol]?.length > 0) {
        const buy = queues[t.symbol][0];
        const m   = Math.min(rem, buy.qty);
        costBasis += buy.price * m;
        matched   += m;
        buy.qty   -= m;
        rem       -= m;
        if (buy.qty === 0) queues[t.symbol].shift();
      }
      if (matched === 0) return { entryPrice: undefined, pl: undefined, plPct: undefined };
      const avgEntry = costBasis / matched;
      return {
        entryPrice: avgEntry,
        pl:         (t.price - avgEntry) * t.quantity,
        plPct:      ((t.price - avgEntry) / avgEntry) * 100,
      };
    } else {
      // Another sell — consume from queue to maintain correct FIFO state.
      let rem = t.quantity;
      while (rem > 0 && queues[t.symbol]?.length > 0) {
        const buy = queues[t.symbol][0];
        const m   = Math.min(rem, buy.qty);
        buy.qty   -= m;
        rem       -= m;
        if (buy.qty === 0) queues[t.symbol].shift();
      }
    }
  }

  return { entryPrice: undefined, pl: undefined, plPct: undefined };
}
