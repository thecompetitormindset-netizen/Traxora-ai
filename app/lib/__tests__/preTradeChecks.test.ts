import { describe, expect, it } from "vitest";
import { evaluatePreTradeChecks } from "../preTradeChecks";

const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// The OXY setup reviewed on 2026-08-12: earnings had passed on Aug 5 and the
// Sep 10 ex-dividend fell after the Sep 4 expiry, so it was clean — but that
// was verified by hand. These checks make it automatic.
const NOW      = new Date("2026-08-12T14:00:00Z").getTime();
const EXPIRY   = sec("2026-09-04T20:00:00Z");
const OXY_ARGS = {
  nowMs: NOW,
  expiryTs: EXPIRY,
  earningsTs: sec("2026-08-05T20:00:00Z"),   // already passed
  exDividendTs: sec("2026-09-10T13:30:00Z"), // after expiry
};

describe("evaluatePreTradeChecks", () => {
  it("clears the OXY setup — earnings passed, ex-div falls after expiry", () => {
    expect(evaluatePreTradeChecks(OXY_ARGS)).toEqual([]);
  });

  it("flags earnings inside the DTE window", () => {
    const flags = evaluatePreTradeChecks({ ...OXY_ARGS, earningsTs: sec("2026-08-27T20:00:00Z") });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("earnings");
    expect(flags[0].severity).toBe("warn");
    expect(flags[0].label).toMatch(/Aug 2[67]/);
    expect(flags[0].detail).toMatch(/IV crush/i);
  });

  it("does not flag earnings landing after expiry", () => {
    expect(evaluatePreTradeChecks({ ...OXY_ARGS, earningsTs: sec("2026-09-20T20:00:00Z") })).toEqual([]);
  });

  it("flags an ex-dividend before expiry as assignment risk when a short leg exists", () => {
    const flags = evaluatePreTradeChecks({
      ...OXY_ARGS, exDividendTs: sec("2026-08-25T13:30:00Z"), hasShortLeg: true,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("ex-dividend");
    expect(flags[0].severity).toBe("warn");
    expect(flags[0].detail).toMatch(/early assignment/i);
  });

  it("downgrades ex-dividend to informational without a short leg", () => {
    const flags = evaluatePreTradeChecks({
      ...OXY_ARGS, exDividendTs: sec("2026-08-25T13:30:00Z"), hasShortLeg: false,
    });
    expect(flags[0].severity).toBe("info");
    expect(flags[0].detail).toMatch(/no assignment exposure/i);
  });

  it("reports both events when both land inside the window", () => {
    const flags = evaluatePreTradeChecks({
      ...OXY_ARGS,
      earningsTs:   sec("2026-08-20T20:00:00Z"),
      exDividendTs: sec("2026-08-25T13:30:00Z"),
      hasShortLeg:  true,
    });
    expect(flags.map(f => f.kind)).toEqual(["earnings", "ex-dividend"]);
  });

  it("returns nothing without an expiry to bound the window", () => {
    expect(evaluatePreTradeChecks({ ...OXY_ARGS, expiryTs: null })).toEqual([]);
  });

  it("ignores dates already in the past", () => {
    expect(evaluatePreTradeChecks({ ...OXY_ARGS, exDividendTs: sec("2026-08-01T13:30:00Z") })).toEqual([]);
  });
});
