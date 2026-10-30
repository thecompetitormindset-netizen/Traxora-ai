import { describe, expect, it } from "vitest";
import {
  CONTRACT_MULTIPLIER,
  canFill, closePosition, contractKey, contractLabel, costOf, fillPremium,
  intrinsic, isExpired, markValue, openPosition, realised, returnPct,
  settleExpiry, spreadPct, summarise, unrealised,
  type ContractQuote, type OptionPosition,
} from "../optionsPaper";

// What a paper options account must not do: fill at prices nobody gets, value
// positions it cannot price, or quietly drop the ones that expired worthless.

const NOW = Date.parse("2026-11-02T15:00:00Z");
const q = (bid: number | null, ask: number | null, at = NOW): ContractQuote => ({ bid, ask, last: null, at });

const position = (over: Partial<OptionPosition> = {}): OptionPosition => ({
  id: "1", symbol: "AAPL", right: "CALL", strike: 190, expiry: "2026-11-20",
  contracts: 1, entryPremium: 2.00, entryAt: NOW, underlyingAtEntry: 188,
  status: "open", ...over,
});

describe("fills", () => {
  it("buys at the ask and sells at the bid, never the mid", () => {
    // The whole reason paper options flatter: on 1.00 / 1.40 the mid looks like
    // 1.20, but you pay 1.40 going in and receive 1.00 coming out.
    const quote = q(1.00, 1.40);
    expect(fillPremium("buy", quote)).toBe(1.40);
    expect(fillPremium("sell", quote)).toBe(1.00);
  });

  it("reports the spread as a share of the mid", () => {
    // 0.40 wide on a 1.20 mid is 33% — the move needed before the trade is
    // worth anything, which is the number worth staring at.
    expect(spreadPct(q(1.00, 1.40))).toBeCloseTo(33.33, 1);
    expect(spreadPct(q(null, 1.40))).toBeNull();
  });

  it("refuses a quote with a missing side", () => {
    // No bid means it cannot be sold. Treating the absence as zero would book
    // a total loss that never happened.
    expect(canFill(q(null, 1.40), NOW)).toBe(false);
    expect(canFill(q(1.00, null), NOW)).toBe(false);
    expect(canFill(undefined, NOW)).toBe(false);
  });

  it("refuses a crossed book", () => {
    expect(canFill(q(1.50, 1.20), NOW)).toBe(false);
  });

  it("refuses a quote that has gone stale", () => {
    expect(canFill(q(1.00, 1.40, NOW - 2 * 60 * 60_000), NOW)).toBe(false);
    expect(canFill(q(1.00, 1.40, NOW - 60_000), NOW)).toBe(true);
  });
});

describe("opening a position", () => {
  const ticket = { symbol: "AAPL", right: "CALL" as const, strike: 190, expiry: "2026-11-20", contracts: 2 };

  it("fills at the ask and charges premium times the multiplier", () => {
    const r = openPosition(ticket, q(1.00, 1.40), 188, 10_000, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.position.entryPremium).toBe(1.40);
    expect(r.cost).toBe(1.40 * CONTRACT_MULTIPLIER * 2);
  });

  it("refuses rather than inventing a premium when it cannot be priced", () => {
    // A ticket that becomes a position at a made-up price leaves the account
    // tracking a trade nobody could have made.
    const r = openPosition(ticket, q(null, null), 188, 10_000, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/cannot be filled/);
  });

  it("refuses when the account cannot afford it, and says the numbers", () => {
    const r = openPosition(ticket, q(1.00, 1.40), 188, 100, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("280.00");
    expect(r.error).toContain("100.00");
  });

  it("refuses an expiry that has already passed", () => {
    const r = openPosition({ ...ticket, expiry: "2026-10-16" }, q(1.00, 1.40), 188, 10_000, NOW);
    expect(r.ok).toBe(false);
  });

  it("refuses a fractional or empty contract count", () => {
    expect(openPosition({ ...ticket, contracts: 0 }, q(1, 1.4), 188, 10_000, NOW).ok).toBe(false);
    expect(openPosition({ ...ticket, contracts: 1.5 }, q(1, 1.4), 188, 10_000, NOW).ok).toBe(false);
  });

  it("refuses without a price for the underlying", () => {
    // The entry price of the stock is what makes the trade legible afterwards.
    expect(openPosition(ticket, q(1.00, 1.40), null, 10_000, NOW).ok).toBe(false);
  });
});

describe("valuing an open position", () => {
  it("marks to the bid — what selling would actually receive", () => {
    expect(markValue(position(), q(1.80, 2.20), NOW)).toBe(180);
  });

  it("returns null, not zero, when it cannot be valued", () => {
    // "Worth nothing" and "worth unknown" are different facts, and only one of
    // them is a loss.
    expect(markValue(position(), q(null, 2.20), NOW)).toBeNull();
    expect(unrealised(position(), undefined, NOW)).toBeNull();
  });

  it("counts the spread as an immediate loss on a fresh position", () => {
    // Bought at 2.00 (the ask), immediately worth 1.60 (the bid). Down 20%
    // before the underlying has moved at all — which is the true position.
    const open = unrealised(position({ entryPremium: 2.00 }), q(1.60, 2.00), NOW);
    expect(open).toBe(-40);
    expect(returnPct(position({ entryPremium: 2.00 }), open)).toBe(-20);
  });
});

describe("closing", () => {
  it("sells at the bid and books the difference", () => {
    const r = closePosition(position({ entryPremium: 2.00 }), q(3.00, 3.40), NOW, 196);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.position.exitPremium).toBe(3.00);
    expect(realised(r.position)).toBe(100);
    expect(r.proceeds).toBe(300);
  });

  it("will not close twice", () => {
    expect(closePosition(position({ status: "closed" }), q(3, 3.4), NOW, 196).ok).toBe(false);
  });

  it("refuses to close against an unusable quote", () => {
    expect(closePosition(position(), q(null, 3.4), NOW, 196).ok).toBe(false);
  });
});

describe("expiry", () => {
  it("knows when a contract has expired", () => {
    expect(isExpired("2026-11-20", Date.parse("2026-11-20T18:00:00Z"))).toBe(false);
    expect(isExpired("2026-11-20", Date.parse("2026-11-20T21:00:00Z"))).toBe(true);
  });

  it("values a call and a put at intrinsic", () => {
    expect(intrinsic("CALL", 190, 196)).toBe(6);
    expect(intrinsic("CALL", 190, 185)).toBe(0);
    expect(intrinsic("PUT", 190, 185)).toBe(5);
    expect(intrinsic("PUT", 190, 196)).toBe(0);
  });

  it("books the full loss when it expires worthless, rather than dropping it", () => {
    // The most common outcome in options. An account that removed these
    // instead of realising them would hide the lesson entirely.
    const p = settleExpiry(position({ entryPremium: 2.00 }), 185, NOW);
    expect(p.status).toBe("expired");
    expect(p.exitPremium).toBe(0);
    expect(realised(p)).toBe(-200);
    expect(returnPct(p, realised(p))).toBe(-100);
  });

  it("books intrinsic value when it finishes in the money", () => {
    const p = settleExpiry(position({ entryPremium: 2.00 }), 196, NOW);
    expect(realised(p)).toBe(400);
  });
});

describe("summary", () => {
  const quotes = { [contractKey(position())]: q(1.80, 2.20) };

  it("adds up open value and realised profit", () => {
    const s = summarise(
      [position({ id: "a" }), position({ id: "b", status: "closed", entryPremium: 2, exitPremium: 3 })],
      quotes, NOW,
    );
    expect(s.openCount).toBe(1);
    expect(s.atRisk).toBe(200);
    expect(s.openValue).toBe(180);
    expect(s.realisedTotal).toBe(100);
    expect(s.winRate).toBe(100);
  });

  it("reports no total at all when a position cannot be priced", () => {
    // A total that silently leaves one out is worse than no total, because it
    // looks complete.
    const s = summarise([position({ id: "a" }), position({ id: "c", strike: 999 })], quotes, NOW);
    expect(s.unpriced).toBe(1);
    expect(s.openValue).toBeNull();
  });

  it("has no win rate until something has closed", () => {
    const s = summarise([position()], quotes, NOW);
    expect(s.closedCount).toBe(0);
    expect(s.winRate).toBeNull();
  });
});

describe("labels", () => {
  it("reads a contract the way a person says it", () => {
    expect(contractLabel(position())).toBe("AAPL 20 Nov 190 Call");
    expect(contractLabel(position({ right: "PUT" }))).toBe("AAPL 20 Nov 190 Put");
  });

  it("keys a contract by everything that identifies it", () => {
    expect(contractKey(position())).toBe("AAPL|2026-11-20|CALL|190");
    expect(contractKey(position({ strike: 195 }))).not.toBe(contractKey(position()));
  });
});

describe("costOf", () => {
  it("prices per share times a hundred", () => {
    expect(costOf(1.40, 2)).toBe(280);
  });
});
