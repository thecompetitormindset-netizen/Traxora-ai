import { describe, expect, it } from "vitest";
import { parseCboeVix, plausibleVix } from "../vixQuote";

// Built from the real Cboe payload, captured 2026-10-24 22:50 UTC with the
// market closed. The shape is not documented anywhere, so this body IS the
// specification — and it contains the trap these tests exist to pin.

const REAL_BODY = {
  timestamp: "2026-10-24 22:50:54",
  data: {
    symbol: "^VIX",
    security_type: "index",
    exchange_id: 5,
    current_price: 19.45,
    price_change: 0.42,
    price_change_percent: 2.1594,
    bid: 0,
    ask: 0,
    bid_size: 0,
    ask_size: 0,
    open: 20.1,
    high: 20.66,
    low: 18.88,
    close: 19.45,
    prev_day_close: 19.45,   // ← echoes current_price; the trap
    volume: 0,
    iv30: 132.15,            // ← a plausible-looking number that is not VIX
    iv30_change: 0,
    iv30_change_percent: 0,
    seqno: 0,
    last_trade_time: "2026-10-23T16:15:01",
    tick: "down",
  },
  symbol: "_VIX",
};

describe("parseCboeVix against the real payload", () => {
  it("reads the level", () => {
    expect(parseCboeVix(REAL_BODY)!.level).toBe(19.45);
  });

  it("derives the previous close from the change, not from prev_day_close", () => {
    // prev_day_close is 19.45, identical to current_price, while price_change
    // says the day's move was +0.42. Trusting the field yields a zero change
    // and a VIX term structure reported as "flat" — a direction asserted from
    // data that states none. 19.45 - 0.42 = 19.03, which also agrees with
    // price_change_percent: 19.45 / 1.021594 = 19.04.
    const q = parseCboeVix(REAL_BODY)!;
    expect(q.previousClose).toBeCloseTo(19.03, 2);
    expect(q.previousClose).not.toBe(19.45);
  });

  it("reports cboe as the source", () => {
    expect(parseCboeVix(REAL_BODY)!.source).toBe("cboe");
  });

  it("does not mistake iv30 for the level", () => {
    // 132.15 sits beside the price fields. A loose plausibility bound would
    // admit it as a VIX reading.
    expect(plausibleVix(132.15)).toBe(false);
    expect(parseCboeVix(REAL_BODY)!.level).not.toBe(132.15);
  });
});

describe("parseCboeVix fallbacks", () => {
  it("uses a named previous close when no change field exists and it differs", () => {
    const body = { data: { current_price: 20, prev_day_close: 19 } };
    expect(parseCboeVix(body)!.previousClose).toBe(19);
  });

  it("returns null previous close when the named field merely repeats the level", () => {
    // Equal to the level, it carries no information — and null makes the
    // caller degrade term structure to "flat" for the honest reason rather
    // than computing a zero change from a duplicated number.
    const body = { data: { current_price: 20, prev_day_close: 20 } };
    expect(parseCboeVix(body)!.previousClose).toBeNull();
  });

  it("accepts a genuine zero change", () => {
    // price_change present and zero is a real statement: the level is
    // unchanged. That is different from the field being absent.
    const body = { data: { current_price: 20, price_change: 0 } };
    expect(parseCboeVix(body)!.previousClose).toBe(20);
  });

  it("handles a negative change", () => {
    const body = { data: { current_price: 18, price_change: -1.5 } };
    expect(parseCboeVix(body)!.previousClose).toBeCloseTo(19.5, 5);
  });

  it("ignores a change that implies an implausible previous close", () => {
    const body = { data: { current_price: 19, price_change: 500 } };
    expect(parseCboeVix(body)!.previousClose).toBeNull();
  });

  it("falls back through alternative level field names", () => {
    expect(parseCboeVix({ data: { last_trade_price: 21.3 } })!.level).toBe(21.3);
    expect(parseCboeVix({ data: { last: 21.3 } })!.level).toBe(21.3);
    expect(parseCboeVix({ current_price: 21.3 })!.level).toBe(21.3);
  });

  it("returns null when nothing resembles a VIX level", () => {
    expect(parseCboeVix({ data: { volume: 0, bid: 0 } })).toBeNull();
    expect(parseCboeVix({})).toBeNull();
    expect(parseCboeVix(null)).toBeNull();
    expect(parseCboeVix("19.45")).toBeNull();
  });
});

describe("plausibleVix", () => {
  it("accepts the historical range", () => {
    expect(plausibleVix(9.14)).toBe(true);    // near the all-time low
    expect(plausibleVix(19.45)).toBe(true);
    expect(plausibleVix(82.69)).toBe(true);   // near the 2020 high
  });

  it("rejects values outside it", () => {
    expect(plausibleVix(0)).toBe(false);
    expect(plausibleVix(-5)).toBe(false);
    expect(plausibleVix(132.15)).toBe(false);
    expect(plausibleVix(NaN)).toBe(false);
    expect(plausibleVix("19.45")).toBe(false);
    expect(plausibleVix(null)).toBe(false);
  });
});
