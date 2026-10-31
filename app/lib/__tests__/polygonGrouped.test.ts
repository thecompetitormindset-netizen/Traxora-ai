import { describe, expect, it } from "vitest";
import { MIN_DOLLAR_VOLUME, MIN_PRICE, dateOfGrouped, parseGrouped, redactKey } from "../polygonGrouped";

// One call returns the whole US market for a date, which is what makes a
// universe of thousands possible on a budget of five calls a minute. What has
// to be right is which rows are kept: the brief was to stop overlooking names
// nobody watches, but an options pick on something untradeable is not a pick.

const row = (over: Record<string, unknown> = {}) => ({
  T: "ACME", o: 20, h: 21, l: 19.5, c: 20.5, v: 1_000_000, t: Date.parse("2026-10-26T20:00:00Z"),
  ...over,
});

const body = (rows: unknown[]) => ({ queryCount: rows.length, resultsCount: rows.length, status: "OK", results: rows });

describe("parseGrouped", () => {
  it("keeps a liquid, ordinary ticker", () => {
    const { bars } = parseGrouped(body([row()]), "2026-10-26");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ symbol: "ACME", close: 20.5, volume: 1_000_000, date: "2026-10-26" });
  });

  it("drops sub-dollar names, where options are unusable or absent", () => {
    const { bars } = parseGrouped(body([row({ c: MIN_PRICE - 0.01, v: 50_000_000 })]), "2026-10-26");
    expect(bars).toHaveLength(0);
  });

  it("measures liquidity in dollars, not shares", () => {
    // A million shares of a $6 stock is a thinner market than fifty thousand
    // of a $300 one. Share count alone would keep the first and drop the
    // second, which is backwards.
    const thinButBusy = parseGrouped(body([row({ c: 6, v: 400_000 })]), "2026-10-26");   // $2.4M
    const richButQuiet = parseGrouped(body([row({ c: 300, v: 50_000 })]), "2026-10-26"); // $15M

    expect(thinButBusy.bars).toHaveLength(0);
    expect(richButQuiet.bars).toHaveLength(1);
  });

  it("keeps a name right at the dollar-volume floor", () => {
    const atFloor = parseGrouped(body([row({ c: 10, v: MIN_DOLLAR_VOLUME / 10 })]), "2026-10-26");
    expect(atFloor.bars).toHaveLength(1);
  });

  it("drops warrants, units and share-class suffixes", () => {
    // These carry no useful options market, so storing them would cost space
    // to produce picks nobody could take.
    const { bars } = parseGrouped(body([
      row({ T: "ACME.WS" }), row({ T: "ACME-U" }), row({ T: "BRK.B" }), row({ T: "TOOLONG" }),
    ]), "2026-10-26");
    expect(bars).toHaveLength(0);
  });

  it("drops a row missing part of the OHLC rather than zero-filling it", () => {
    // A zero in a technical is worse than a gap.
    const { bars } = parseGrouped(body([row({ h: undefined }), row({ T: "GOOD" })]), "2026-10-26");
    expect(bars.map(b => b.symbol)).toEqual(["GOOD"]);
  });

  it("reports how many rows arrived, so filtering is visible", () => {
    const { bars, received } = parseGrouped(body([row(), row({ T: "PENNY", c: 0.5, v: 90_000_000 })]), "2026-10-26");
    expect(received).toBe(2);
    expect(bars).toHaveLength(1);
  });

  it("rounds the adjusted volume", () => {
    const { bars } = parseGrouped(body([row({ v: 1_234_567.89 })]), "2026-10-26");
    expect(bars[0].volume).toBe(1_234_568);
  });

  it("returns nothing rather than throwing on junk", () => {
    expect(parseGrouped(null, "2026-10-26").bars).toEqual([]);
    expect(parseGrouped({}, "2026-10-26").bars).toEqual([]);
    expect(parseGrouped({ results: "nope" }, "2026-10-26").bars).toEqual([]);
  });

  it("returns nothing for a closed session, which is not an error", () => {
    expect(parseGrouped(body([]), "2026-10-25").bars).toEqual([]);
  });
});

describe("dateOfGrouped", () => {
  it("prefers the date the rows themselves carry", () => {
    expect(dateOfGrouped(body([row()]), "1999-01-01")).toBe("2026-10-26");
  });

  it("falls back to the requested date when no row says otherwise", () => {
    expect(dateOfGrouped(body([]), "2026-10-26")).toBe("2026-10-26");
    expect(dateOfGrouped(null, "2026-10-26")).toBe("2026-10-26");
  });
});

describe("redactKey", () => {
  it("removes the key from a provider message", () => {
    expect(redactKey("Unknown apiKey=abc123secret supplied", "abc123secret"))
      .toBe("Unknown apiKey=[redacted] supplied");
  });

  it("removes every occurrence, not just the first", () => {
    expect(redactKey("k1 and k1 again", "k1")).toBe("[redacted] and [redacted] again");
  });

  it("leaves a message that does not contain the key alone", () => {
    const msg = "You are not entitled to this data. Please upgrade your plan.";
    expect(redactKey(msg, "abc123")).toBe(msg);
  });

  it("does nothing when there is no key to hide", () => {
    expect(redactKey("some message", "")).toBe("some message");
  });
});
