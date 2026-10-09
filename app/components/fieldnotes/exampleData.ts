// A fictional example in the user-supplied data format. The symbol, prices and
// quotes are invented; times are generated relative to now so the example
// exercises the same freshness checks real data does. Every screen that shows
// its result labels it as fictional (ResearchView, EXAMPLE_SYMBOL).

import { EXAMPLE_SYMBOL } from "./format";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextFridayAfter(days: number, from: Date): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return isoDay(d);
}

export function fictionalExample(now: Date = new Date()): string {
  // 60 weekday bars ending yesterday, drifting from 88 to 99.
  const bars: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  const d = new Date(now.getTime() - 86_400_000);
  while (bars.length < 60) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) bars.unshift({ date: isoDay(d), open: 0, high: 0, low: 0, close: 0, volume: 1_000_000 });
    d.setUTCDate(d.getUTCDate() - 1);
  }
  bars.forEach((b, i) => {
    const close = +(88 + (11 * i) / 59 + Math.sin(i / 3) * 0.4).toFixed(2);
    const open = +(close - 0.3).toFixed(2);
    b.open = open; b.close = close;
    b.high = +(Math.max(open, close) + 0.6).toFixed(2);
    b.low = +(Math.min(open, close) - 0.6).toFixed(2);
  });

  const expiry = nextFridayAfter(28, now);
  const quoteTime = new Date(now.getTime() - 60_000).toISOString();
  const rows: [type: "CALL" | "PUT", strike: number, bid: number, ask: number, delta: number][] = [
    ["CALL", 95, 6.40, 6.60, 0.72], ["CALL", 100, 3.00, 3.10, 0.52], ["CALL", 105, 1.50, 1.58, 0.33],
    ["CALL", 110, 0.80, 0.86, 0.18], ["CALL", 115, 0.40, 0.43, 0.09],
    ["PUT", 85, 0.40, 0.43, -0.08], ["PUT", 90, 0.75, 0.80, -0.15], ["PUT", 95, 1.40, 1.48, -0.29],
    ["PUT", 100, 2.90, 3.00, -0.48], ["PUT", 105, 5.60, 5.80, -0.68],
  ];
  const yymmdd = expiry.slice(2).replace(/-/g, "");

  return JSON.stringify({
    symbol: EXAMPLE_SYMBOL,
    underlying: { price: 100, price_time: new Date(now.getTime() - 120_000).toISOString(), price_time_kind: "QUOTE" },
    bars,
    levels: { support: [95, 92], resistance: [108, 112] },
    contracts: rows.map(([type, strike, bid, ask, delta]) => ({
      contract_id: `${EXAMPLE_SYMBOL}${yymmdd}${type[0]}${String(strike * 1000).padStart(8, "0")}`,
      type, strike, expiry, bid, ask, quote_time: quoteTime, iv: 0.3, delta,
      open_interest: 1500, volume: 200, multiplier: 100, exercise_style: "AMERICAN", settlement: "PHYSICAL",
    })),
    events: { covered_through: isoDay(new Date(now.getTime() + 60 * 86_400_000)), earnings_dates: [] },
  }, null, 2);
}
