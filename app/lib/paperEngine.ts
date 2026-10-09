// Practice-trading engine for the /paper page. Pure functions, no storage or
// network, so the rules are easy to test (see __tests__/paperEngine.test.ts).
//
// What makes it realistic:
// - Orders only fill while the market is open, using a recent quote. An order
//   placed while the market is closed waits for the open, like a real broker.
// - Market orders pay a small slippage (they rarely fill at exactly the price
//   you saw). Limit orders fill at the limit or better.
// - Automatic sells (safety level / goal) trigger on their own when a quote
//   crosses them, and fill at the quote — so a price gap can fill worse than
//   the safety level, exactly as it can in a real account.
// - You can't spend more cash than you have; open trades and waiting buy
//   orders tie up cash. No commissions (most US brokers charge none).
//
// Stored records stay compatible with the older planner format
// (traxora_taken_trades): status PENDING/OPEN/WIN/LOSS, entry, shares,
// closePrice, closedAt — the dashboard and stats pages read those fields.

export type Side = "BUY" | "SELL"; // SELL = sell short (bet the price falls)
export type OrderType = "market" | "limit";
export type ExitReason = "stop" | "target" | "manual";

export type PaperOrder = {
  id: string;
  symbol: string;
  signal: Side;
  /** Fill price once open; the limit (or the price seen when placing) while waiting. */
  entry: number;
  shares: number;
  stop: number | null;
  target: number | null;
  riskDollar: number;
  potential: number;
  time: number;          // when placed (ms)
  note: string;
  status?: "PENDING" | "OPEN" | "WIN" | "LOSS";
  closePrice?: number;
  closedAt?: number;
  // Added by this engine (optional so older records still load)
  orderType?: OrderType;
  limitPrice?: number | null;
  /** Dollar amount the user asked to invest, for market orders sized by dollars. */
  amount?: number | null;
  filledAt?: number;
  exitReason?: ExitReason;
  closeQueued?: boolean;
};

export type Quote = { price: number; time: number | null }; // time: ms of the quote, if known

export const SLIPPAGE = 0.0005;          // 0.05% against you on market orders
export const MAX_QUOTE_AGE_MS = 30 * 60_000;
export const DEFAULT_START = 100_000;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

// ── Market hours ────────────────────────────────────────────────────────────

export type MarketKind = "stock" | "crypto" | "futures";

export function marketKind(symbol: string): MarketKind {
  const s = symbol.toUpperCase();
  if (/-USD$|USDT$|-USDT$/.test(s)) return "crypto";
  if (s.endsWith(".COMM") || s.endsWith("=F")) return "futures";
  return "stock";
}

function etParts(now: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date(now));
  const get = (t: string) => f.find(p => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return { day, mins };
}

/** Regular hours: stocks 9:30–4:00 ET weekdays; futures Sun 6pm–Fri 5pm ET with a daily 5–6pm break; crypto always. */
export function isMarketOpen(symbol: string, now: number): boolean {
  const kind = marketKind(symbol);
  if (kind === "crypto") return true;
  const { day, mins } = etParts(now);
  if (kind === "futures") {
    if (day === 6) return false;
    if (day === 0) return mins >= 18 * 60;
    if (day === 5) return mins < 17 * 60;
    return mins < 17 * 60 || mins >= 18 * 60;
  }
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export function marketStatusText(symbol: string, now: number): string {
  const kind = marketKind(symbol);
  if (kind === "crypto") return "Crypto trades all day, every day";
  if (isMarketOpen(symbol, now)) return kind === "futures" ? "Futures market is open" : "Market is open until 4:00 PM ET";
  return kind === "futures" ? "Futures market is closed — orders wait until it opens" : "Market is closed — orders wait until 9:30 AM ET on the next trading day";
}

/** A quote is usable for a fill only while the market is open and the quote is recent. */
export function canFill(symbol: string, q: Quote | undefined, now: number): q is Quote {
  if (!q || !(q.price > 0)) return false;
  if (!isMarketOpen(symbol, now)) return false;
  if (q.time != null && now - q.time > MAX_QUOTE_AGE_MS) return false;
  return true;
}

// ── Money ───────────────────────────────────────────────────────────────────

export function marketFillPrice(side: Side, quote: number): number {
  return r4(side === "BUY" ? quote * (1 + SLIPPAGE) : quote * (1 - SLIPPAGE));
}

export function profit(o: Pick<PaperOrder, "signal" | "entry" | "shares">, price: number): number {
  return (o.signal === "BUY" ? price - o.entry : o.entry - price) * o.shares;
}

export function profitPct(o: Pick<PaperOrder, "signal" | "entry">, price: number): number {
  return ((o.signal === "BUY" ? price - o.entry : o.entry - price) / o.entry) * 100;
}

function withRisk(o: PaperOrder): PaperOrder {
  return {
    ...o,
    riskDollar: o.stop != null ? r2(Math.abs(o.entry - o.stop) * o.shares) : 0,
    potential: o.target != null ? r2(Math.abs(o.target - o.entry) * o.shares) : 0,
  };
}

/** Cash held back by an order that hasn't filled yet. */
function reserved(o: PaperOrder): number {
  if (o.amount != null && o.orderType !== "limit") return o.amount;
  return (o.limitPrice ?? o.entry) * o.shares * (1 + SLIPPAGE);
}

export type Summary = {
  start: number;
  cash: number;            // free to spend
  invested: number;        // current value of open trades
  total: number;           // cash + invested + cash held by waiting orders
  gain: number;            // total − start
  gainPct: number;
  realized: number;
  unrealized: number;
  openCount: number;
  waitingCount: number;
  closedCount: number;
  wins: number;
};

export function summarize(orders: PaperOrder[], start: number, prices: Record<string, number>): Summary {
  let realized = 0, unrealized = 0, costOpen = 0, valueOpen = 0, held = 0, wins = 0;
  let openCount = 0, waitingCount = 0, closedCount = 0;
  for (const o of orders) {
    const st = o.status ?? "OPEN";
    if (st === "WIN" || st === "LOSS") {
      closedCount++;
      const p = o.closePrice != null ? profit(o, o.closePrice) : st === "WIN" ? o.potential : -o.riskDollar;
      realized += p;
      if (p > 0) wins++;
    } else if (st === "PENDING") {
      waitingCount++;
      held += reserved(o);
    } else {
      openCount++;
      const cost = o.entry * o.shares;
      const p = prices[o.symbol] != null ? profit(o, prices[o.symbol]) : 0;
      costOpen += cost;
      unrealized += p;
      valueOpen += cost + p;
    }
  }
  const cash = start + realized - costOpen - held;
  const total = cash + held + valueOpen;
  return {
    start, cash: r2(cash), invested: r2(valueOpen), total: r2(total),
    gain: r2(total - start), gainPct: start > 0 ? ((total - start) / start) * 100 : 0,
    realized: r2(realized), unrealized: r2(unrealized),
    openCount, waitingCount, closedCount, wins,
  };
}

// ── Placing orders ──────────────────────────────────────────────────────────

export type Ticket = {
  symbol: string;
  side: Side;
  type: OrderType;
  /** Either dollars or shares; the other is worked out from the price. */
  dollars?: number | null;
  shares?: number | null;
  limitPrice?: number | null;
  stop?: number | null;
  target?: number | null;
  note?: string;
};

export type Placed = { ok: true; order: PaperOrder; filled: boolean } | { ok: false; error: string };

/**
 * Validates a ticket against the account and either fills it straight away
 * (market order, market open, fresh quote) or stores it as waiting.
 */
export function placeOrder(t: Ticket, quote: Quote | undefined, cash: number, now: number, id = String(now)): Placed {
  const symbol = t.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: "Choose a stock first." };
  const ref = t.type === "limit" ? t.limitPrice ?? null : quote?.price ?? null;
  if (!ref || !(ref > 0)) return { ok: false, error: t.type === "limit" ? "Enter the price you want to pay." : "We couldn't get a price for this stock right now." };

  let shares = t.shares && t.shares > 0 ? t.shares : null;
  let amount: number | null = null;
  if (!shares && t.dollars && t.dollars > 0) { amount = r2(t.dollars); shares = r4(t.dollars / (ref * (t.type === "market" ? 1 + SLIPPAGE : 1))); }
  if (!shares || !(shares > 0)) return { ok: false, error: "Enter how much you want to invest." };
  shares = r4(shares);

  const cost = amount ?? shares * ref * (t.type === "market" ? 1 + SLIPPAGE : 1);
  if (cost > cash + 0.005) return { ok: false, error: `You only have $${cash.toLocaleString("en-US", { maximumFractionDigits: 2 })} of practice cash available.` };

  const long = t.side === "BUY";
  if (t.stop != null && (long ? t.stop >= ref : t.stop <= ref)) {
    return { ok: false, error: long ? "Your safety level must be below the buy price." : "Your safety level must be above the price." };
  }
  if (t.target != null && (long ? t.target <= ref : t.target >= ref)) {
    return { ok: false, error: long ? "Your goal price must be above the buy price." : "Your goal price must be below the price." };
  }

  let order: PaperOrder = withRisk({
    id, symbol, signal: t.side, entry: r4(ref), shares,
    stop: t.stop ?? null, target: t.target ?? null, riskDollar: 0, potential: 0,
    time: now, note: t.note?.trim() ?? "", status: "PENDING",
    orderType: t.type, limitPrice: t.type === "limit" ? r4(ref) : null, amount,
  });

  if (t.type === "market" && canFill(symbol, quote, now)) {
    order = fill(order, quote.price, now);
    return { ok: true, order, filled: true };
  }
  return { ok: true, order, filled: false };
}

function fill(o: PaperOrder, quote: number, now: number): PaperOrder {
  const isLimit = o.orderType === "limit";
  const price = isLimit
    ? (o.signal === "BUY" ? Math.min(o.limitPrice ?? quote, quote) : Math.max(o.limitPrice ?? quote, quote))
    : marketFillPrice(o.signal, quote);
  const shares = o.amount != null && !isLimit ? r4(o.amount / price) : o.shares;
  return withRisk({ ...o, entry: r4(price), shares, status: "OPEN", filledAt: now });
}

function close(o: PaperOrder, price: number, now: number, reason: ExitReason): PaperOrder {
  const p = profit(o, price);
  return { ...o, status: p > 0 ? "WIN" : "LOSS", closePrice: r4(price), closedAt: now, exitReason: reason, closeQueued: false };
}

/** User presses Sell (or Buy back, for a short). Fills now if possible, otherwise waits for the open. */
export function closeNow(o: PaperOrder, quote: Quote | undefined, now: number): PaperOrder {
  if (canFill(o.symbol, quote, now)) {
    return close(o, marketFillPrice(o.signal === "BUY" ? "SELL" : "BUY", quote.price), now, "manual");
  }
  return { ...o, closeQueued: true };
}

// ── The tick: run on every price update ─────────────────────────────────────

export type EngineEvent = { id: string; symbol: string; text: string };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Applies new quotes: fills waiting orders, triggers safety levels and goals,
 * and runs sells queued while the market was closed.
 */
export function tick(orders: PaperOrder[], quotes: Record<string, Quote>, now: number): { orders: PaperOrder[]; events: EngineEvent[]; changed: boolean } {
  const events: EngineEvent[] = [];
  let changed = false;
  const next = orders.map(o => {
    const q = quotes[o.symbol];
    if (!canFill(o.symbol, q, now)) return o;
    const st = o.status ?? "OPEN";
    const long = o.signal === "BUY";

    if (st === "PENDING") {
      const reached = o.orderType !== "limit" || o.limitPrice == null
        ? true
        : long ? q.price <= o.limitPrice : q.price >= o.limitPrice;
      if (!reached) return o;
      changed = true;
      const f = fill(o, q.price, now);
      events.push({ id: o.id, symbol: o.symbol, text: `${long ? "Bought" : "Sold short"} ${f.shares} ${o.symbol} at ${money(f.entry)}.` });
      return f;
    }

    if (st === "OPEN") {
      if (o.closeQueued) {
        changed = true;
        const c = close(o, marketFillPrice(long ? "SELL" : "BUY", q.price), now, "manual");
        events.push({ id: o.id, symbol: o.symbol, text: `${long ? "Sold" : "Bought back"} ${o.symbol} at ${money(c.closePrice!)} when the market opened.` });
        return c;
      }
      const stopHit = o.stop != null && (long ? q.price <= o.stop : q.price >= o.stop);
      const goalHit = o.target != null && (long ? q.price >= o.target : q.price <= o.target);
      if (stopHit) {
        changed = true;
        const c = close(o, marketFillPrice(long ? "SELL" : "BUY", q.price), now, "stop");
        events.push({ id: o.id, symbol: o.symbol, text: `${o.symbol} reached your safety level — sold automatically at ${money(c.closePrice!)}.` });
        return c;
      }
      if (goalHit) {
        changed = true;
        const c = close(o, q.price, now, "target");
        events.push({ id: o.id, symbol: o.symbol, text: `${o.symbol} reached your goal — sold automatically at ${money(c.closePrice!)}.` });
        return c;
      }
    }
    return o;
  });
  return { orders: next, events, changed };
}

// ── Catch-up: what happened while the page was closed ───────────────────────

export type Bar = { time: number; open: number; high: number; low: number; close: number }; // time in seconds

/**
 * Replays price bars (regular-hours only, oldest first) since each order was
 * placed or filled, so waiting orders and auto-sells behave as they would at a
 * real broker even when nobody had the page open. Fills are conservative: a
 * gap fills at the bar's open, and if a bar touches both the safety level and
 * the goal we assume the safety level came first.
 */
export function catchUp(orders: PaperOrder[], symbol: string, bars: Bar[], now: number): { orders: PaperOrder[]; events: EngineEvent[]; changed: boolean } {
  const events: EngineEvent[] = [];
  let changed = false;
  const sorted = [...bars].sort((a, b) => a.time - b.time);

  const next = orders.map(start => {
    if (start.symbol !== symbol) return start;
    let o = start;
    for (const b of sorted) {
      const t = b.time * 1000;
      if (t >= now) break;
      const st = o.status ?? "OPEN";
      if (st === "WIN" || st === "LOSS") break;
      const long = o.signal === "BUY";

      if (st === "PENDING") {
        if (t < o.time) continue;
        let px: number | null = null;
        if (o.orderType === "limit" && o.limitPrice != null) {
          const lim = o.limitPrice;
          if (long ? b.open <= lim : b.open >= lim) px = b.open;
          else if (long ? b.low <= lim : b.high >= lim) px = lim;
        } else {
          px = marketFillPrice(o.signal, b.open);
        }
        if (px == null) continue;
        const shares = o.amount != null && o.orderType !== "limit" ? r4(o.amount / px) : o.shares;
        o = withRisk({ ...o, entry: r4(px), shares, status: "OPEN", filledAt: t });
        events.push({ id: o.id, symbol, text: `${long ? "Bought" : "Sold short"} ${o.shares} ${symbol} at ${money(o.entry)} while you were away.` });
        changed = true;
        continue; // exits are checked from the next bar on
      }

      const since = o.filledAt ?? o.time;
      if (t < since) continue;

      if (o.closeQueued) {
        o = close(o, marketFillPrice(long ? "SELL" : "BUY", b.open), t, "manual");
        events.push({ id: o.id, symbol, text: `${long ? "Sold" : "Bought back"} ${symbol} at ${money(o.closePrice!)} when the market opened.` });
        changed = true;
        break;
      }

      const s = o.stop, g = o.target;
      let exit: { px: number; reason: ExitReason } | null = null;
      if (s != null && (long ? b.open <= s : b.open >= s)) exit = { px: b.open, reason: "stop" };
      else if (g != null && (long ? b.open >= g : b.open <= g)) exit = { px: b.open, reason: "target" };
      else if (s != null && (long ? b.low <= s : b.high >= s)) exit = { px: s, reason: "stop" };
      else if (g != null && (long ? b.high >= g : b.low <= g)) exit = { px: g, reason: "target" };
      if (exit) {
        o = close(o, exit.px, t, exit.reason);
        events.push({
          id: o.id, symbol,
          text: exit.reason === "stop"
            ? `${symbol} reached your safety level while you were away — sold at ${money(o.closePrice!)}.`
            : `${symbol} reached your goal while you were away — sold at ${money(o.closePrice!)}.`,
        });
        changed = true;
        break;
      }
    }
    return o;
  });
  return { orders: next, events, changed };
}
