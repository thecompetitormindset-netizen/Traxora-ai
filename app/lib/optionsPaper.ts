// Practice trading options.
//
// The point of a paper account is to teach what the real thing feels like, so
// the places where a simulator is usually generous are the places that matter
// most here.
//
// You buy at the ASK and sell at the BID. Filling at the mid is the single
// biggest reason paper options results flatter — nobody gets the mid, and on a
// contract quoted 1.00 / 1.40 the spread alone is 29% of the trade before the
// market moves at all. A simulator that hides that teaches a strategy which
// cannot survive contact with a broker.
//
// Expiry settles at intrinsic value, which is usually nothing. Most options
// expire worthless; an account that quietly removed those positions rather
// than booking the loss would misrepresent the one lesson options teach most
// reliably.
//
// And long only — buying calls and puts. Writing options carries risk that is
// unbounded without collateral rules this app has no way to model honestly,
// and a practice account that lets someone sell naked calls with no margin
// call is not practice for anything real.

/** One contract controls a hundred shares. Everything is priced per share. */
export const CONTRACT_MULTIPLIER = 100;

/** CBOE's free feed is delayed, so a fill here is never at a live price. */
export const QUOTE_DELAY_MINUTES = 15;

/** Beyond this, a quote is too old to fill against at all. */
export const MAX_QUOTE_AGE_MS = 60 * 60_000;

export type Right = "CALL" | "PUT";

export type ContractQuote = {
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** When the quote was taken, in ms. */
  at: number;
};

export type OptionPosition = {
  id: string;
  symbol: string;
  right: Right;
  strike: number;
  /** YYYY-MM-DD. */
  expiry: string;
  contracts: number;
  /** Premium per share actually paid, i.e. the ask. */
  entryPremium: number;
  entryAt: number;
  underlyingAtEntry: number;
  status: "open" | "closed" | "expired";
  exitPremium?: number;
  exitAt?: number;
  exitReason?: "manual" | "expired";
  underlyingAtExit?: number;
};

// ── Quotes and fills ────────────────────────────────────────────────────────

/**
 * Whether a quote can be filled against at all.
 *
 * A missing side is not a zero. A contract with no bid cannot be sold, and
 * treating the absence as a price would book a profit or loss that could not
 * have happened.
 */
export function canFill(q: ContractQuote | undefined, now: number): q is ContractQuote {
  if (!q) return false;
  if (q.bid === null || q.ask === null) return false;
  if (!(q.ask > 0) || q.bid < 0) return false;
  if (q.ask < q.bid) return false;             // crossed book: bad data
  return now - q.at <= MAX_QUOTE_AGE_MS;
}

/** Buying pays the ask; selling receives the bid. Never the mid. */
export function fillPremium(side: "buy" | "sell", q: ContractQuote): number {
  return side === "buy" ? (q.ask as number) : (q.bid as number);
}

/**
 * The spread as a share of the mid, which is what the trade must overcome
 * before it is worth anything.
 *
 * Shown rather than enforced: wide spreads are normal in quiet contracts, and
 * refusing them would hide the very cost worth learning. Null when there is no
 * mid to measure against.
 */
export function spreadPct(q: ContractQuote): number | null {
  if (q.bid === null || q.ask === null) return null;
  const mid = (q.bid + q.ask) / 2;
  if (!(mid > 0)) return null;
  return ((q.ask - q.bid) / mid) * 100;
}

/** What a position costs to open, in account currency. */
export function costOf(premium: number, contracts: number): number {
  return premium * CONTRACT_MULTIPLIER * contracts;
}

// ── Valuation ───────────────────────────────────────────────────────────────

/** What the contract is worth at expiry, given where the underlying finished. */
export function intrinsic(right: Right, strike: number, underlying: number): number {
  return right === "CALL"
    ? Math.max(0, underlying - strike)
    : Math.max(0, strike - underlying);
}

/**
 * What an open position is worth right now: what selling it would RECEIVE,
 * which is the bid.
 *
 * Null rather than zero when there is no usable quote. A position shown as
 * worth nothing and a position whose worth is unknown are different facts, and
 * only one of them is a loss.
 */
export function markValue(pos: OptionPosition, q: ContractQuote | undefined, now: number): number | null {
  if (!canFill(q, now)) return null;
  return costOf(q.bid as number, pos.contracts);
}

/** Open profit, or null when the position cannot be valued. */
export function unrealised(pos: OptionPosition, q: ContractQuote | undefined, now: number): number | null {
  const value = markValue(pos, q, now);
  if (value === null) return null;
  return value - costOf(pos.entryPremium, pos.contracts);
}

/** Realised profit on a position that is closed or expired. */
export function realised(pos: OptionPosition): number | null {
  if (pos.status === "open" || pos.exitPremium === undefined) return null;
  return costOf(pos.exitPremium - pos.entryPremium, pos.contracts);
}

/** Profit as a share of what was risked. Premium paid is the whole risk. */
export function returnPct(pos: OptionPosition, profit: number | null): number | null {
  if (profit === null) return null;
  const paid = costOf(pos.entryPremium, pos.contracts);
  if (!(paid > 0)) return null;
  return (profit / paid) * 100;
}

// ── Opening and closing ─────────────────────────────────────────────────────

export type OptionTicket = {
  symbol: string;
  right: Right;
  strike: number;
  expiry: string;
  contracts: number;
};

export type Placed =
  | { ok: true; position: OptionPosition; cost: number }
  | { ok: false; error: string };

/**
 * Open a long position, or say why it cannot be opened.
 *
 * Refusing is a real outcome here. A ticket that cannot be priced must not
 * become a position at an invented premium — the account would then be
 * tracking a trade nobody could have made.
 */
export function openPosition(
  t: OptionTicket,
  q: ContractQuote | undefined,
  underlying: number | null,
  cash: number,
  now: number,
  id = String(now),
): Placed {
  if (!Number.isInteger(t.contracts) || t.contracts < 1) {
    return { ok: false, error: "Choose at least one contract." };
  }
  if (isExpired(t.expiry, now)) {
    return { ok: false, error: "That expiry has already passed." };
  }
  if (!canFill(q, now)) {
    return { ok: false, error: "No usable quote for that contract right now, so it cannot be filled." };
  }
  if (underlying === null || !(underlying > 0)) {
    return { ok: false, error: "No price for the underlying, so the trade cannot be recorded accurately." };
  }

  const premium = fillPremium("buy", q);
  const cost = costOf(premium, t.contracts);
  if (cost > cash) {
    return { ok: false, error: `That costs ${cost.toFixed(2)} and the account has ${cash.toFixed(2)}.` };
  }

  return {
    ok: true,
    cost,
    position: {
      id,
      symbol: t.symbol,
      right: t.right,
      strike: t.strike,
      expiry: t.expiry,
      contracts: t.contracts,
      entryPremium: premium,
      entryAt: now,
      underlyingAtEntry: underlying,
      status: "open",
    },
  };
}

export type Closed =
  | { ok: true; position: OptionPosition; proceeds: number }
  | { ok: false; error: string };

/** Sell a position back at the bid. */
export function closePosition(pos: OptionPosition, q: ContractQuote | undefined, now: number, underlying: number | null): Closed {
  if (pos.status !== "open") return { ok: false, error: "That position is already closed." };
  if (!canFill(q, now)) {
    return { ok: false, error: "No usable quote for that contract right now, so it cannot be sold." };
  }

  const premium = fillPremium("sell", q);
  return {
    ok: true,
    proceeds: costOf(premium, pos.contracts),
    position: {
      ...pos,
      status: "closed",
      exitPremium: premium,
      exitAt: now,
      exitReason: "manual",
      underlyingAtExit: underlying ?? undefined,
    },
  };
}

/** Whether an expiry has passed. Contracts expire at the close on their date. */
export function isExpired(expiry: string, now: number): boolean {
  const t = Date.parse(`${expiry}T20:00:00Z`);  // 4pm ET
  return Number.isFinite(t) ? now > t : false;
}

/**
 * Settle an expired position at intrinsic value.
 *
 * Usually that is zero, and booking the zero is the point: a practice account
 * that removed worthless positions instead of realising the loss would hide
 * the most common outcome in options.
 */
export function settleExpiry(pos: OptionPosition, underlyingAtExpiry: number, now: number): OptionPosition {
  const value = intrinsic(pos.right, pos.strike, underlyingAtExpiry);
  return {
    ...pos,
    status: "expired",
    exitPremium: value,
    exitAt: now,
    exitReason: "expired",
    underlyingAtExit: underlyingAtExpiry,
  };
}

// ── Account summary ─────────────────────────────────────────────────────────

export type OptionsSummary = {
  openCount: number;
  /** Premium currently tied up in open positions. */
  atRisk: number;
  /** Mark-to-market of open positions; null when any cannot be valued. */
  openValue: number | null;
  /** Positions that could not be valued, so the caller can say so. */
  unpriced: number;
  realisedTotal: number;
  closedCount: number;
  wins: number;
  /** Null until something has been closed — never a flattering zero. */
  winRate: number | null;
};

export function summarise(positions: OptionPosition[], quotes: Record<string, ContractQuote>, now: number): OptionsSummary {
  const open = positions.filter(p => p.status === "open");
  const done = positions.filter(p => p.status !== "open");

  let openValue: number | null = 0;
  let unpriced = 0;
  for (const p of open) {
    const v = markValue(p, quotes[contractKey(p)], now);
    if (v === null) { unpriced++; continue; }
    openValue = (openValue ?? 0) + v;
  }
  // A total that silently omits positions is worse than no total.
  if (unpriced > 0) openValue = null;

  const realisedTotal = done.reduce((s, p) => s + (realised(p) ?? 0), 0);
  const wins = done.filter(p => (realised(p) ?? 0) > 0).length;

  return {
    openCount: open.length,
    atRisk: open.reduce((s, p) => s + costOf(p.entryPremium, p.contracts), 0),
    openValue,
    unpriced,
    realisedTotal,
    closedCount: done.length,
    wins,
    winRate: done.length > 0 ? Math.round((wins / done.length) * 1000) / 10 : null,
  };
}

/** A stable key for one contract, used to match quotes to positions. */
export function contractKey(p: Pick<OptionPosition, "symbol" | "expiry" | "right" | "strike">): string {
  return `${p.symbol}|${p.expiry}|${p.right}|${p.strike}`;
}

/** How a contract reads to a person: "AAPL 15 Nov 190 Call". */
export function contractLabel(p: Pick<OptionPosition, "symbol" | "expiry" | "right" | "strike">): string {
  const t = Date.parse(`${p.expiry}T00:00:00Z`);
  const when = Number.isFinite(t)
    ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : p.expiry;
  return `${p.symbol} ${when} ${p.strike} ${p.right === "CALL" ? "Call" : "Put"}`;
}
